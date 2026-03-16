/**
 * Coordinate Worker — processes coordinate jobs using the CoordinatorAgent.
 *
 * This worker bridges BullMQ jobs to the coordinator package, which orchestrates
 * multi-agent test runs through phases (discovery → generation → testing → reporting).
 *
 * Flow:
 *  1. Receive CoordinateJobPayload from BullMQ
 *  2. Fetch TestProfile config from DB
 *  3. Build a TestRunPlan using PlanBuilder
 *  4. Execute via CoordinatorAgent with LocalAgentExecutor
 *  5. Write results back to TestRun / TestResult / TestStep tables
 *  6. Broadcast status updates via Redis pub/sub (for WebSocket relay)
 */

import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { prisma } from '@semkiest/db';
import { config } from '../config';
import {
  PlanBuilder,
  CoordinatorAgent,
  LocalAgentExecutor,
  type CoordinatorResult,
  type AgentType,
  type EventBus,
  type Logger,
} from '@semkiest/coordinator';
import { COORDINATE_QUEUE, type CoordinateJobPayload } from '../jobs/coordinate';
import { publishProgress } from '../queue';

// =============================================================================
// Result type for the BullMQ job
// =============================================================================

interface CoordinateJobResult {
  testRunId: string;
  status: 'PASSED' | 'FAILED';
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
    passRate: number;
  };
}

// =============================================================================
// Logger adapter
// =============================================================================

const logger: Logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => console.info(`[coordinate-worker] ${msg}`, ctx ?? ''),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[coordinate-worker] ${msg}`, ctx ?? ''),
  error: (msg: string, ctx?: Record<string, unknown>) => console.error(`[coordinate-worker] ${msg}`, ctx ?? ''),
  debug: (msg: string, ctx?: Record<string, unknown>) => console.debug(`[coordinate-worker] ${msg}`, ctx ?? ''),
};

// =============================================================================
// Job processor
// =============================================================================

async function processCoordinateJob(
  job: Job<CoordinateJobPayload, CoordinateJobResult>,
): Promise<CoordinateJobResult> {
  const { metadata, baseUrl, profileId, agents, failureStrategy, globalTimeout } = job.data;
  const { projectId, testRunId } = metadata;

  logger.info('Processing coordinate job', { jobId: job.id, testRunId, projectId, profileId });

  // ── 1. Mark TestRun as RUNNING ──────────────────────────────────────────────
  await prisma.testRun.update({
    where: { id: testRunId },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  // Publish progress for WebSocket listeners
  await publishProgress({
    jobId: job.id ?? testRunId,
    jobType: COORDINATE_QUEUE,
    percentage: 0,
    message: 'Test run started — building execution plan',
    timestamp: Date.now(),
  });

  try {
    // ── 2. Fetch profile and project config ───────────────────────────────────
    const profile = await prisma.testProfile.findUnique({
      where: { id: profileId },
      include: { project: true },
    });

    if (!profile) {
      throw new Error(`TestProfile ${profileId} not found`);
    }

    // Resolve the base URL: explicit payload > profile config > project URL
    const resolvedBaseUrl =
      baseUrl ||
      (profile.config as Record<string, unknown>)?.baseUrl as string ||
      profile.project?.url ||
      '';

    if (!resolvedBaseUrl) {
      throw new Error(
        `No base URL available for test run. Set it on the project, profile config, or pass it in the job payload.`,
      );
    }

    // Parse enabled agents from profile config or payload
    const profileConfig = (profile.config ?? {}) as Record<string, unknown>;
    const enabledAgents: AgentType[] = (agents as AgentType[]) ??
      (profileConfig.enabledAgents as AgentType[]) ?? [
        'explorer',
        'ui-functional',
      ];

    // ── 3. Build the test plan ────────────────────────────────────────────────
    const plan = PlanBuilder.fromProfile({
      baseUrl: resolvedBaseUrl,
      enabledAgents,
      globalTimeout: globalTimeout ?? (profileConfig.globalTimeout as number) ?? 600_000,
      failureStrategy: failureStrategy ?? (profileConfig.failureStrategy as any) ?? 'continue-on-error',
      agentTimeout: (profileConfig.agentTimeout as number) ?? 300_000,
      agentRetries: (profileConfig.agentRetries as number) ?? 1,
    })
      .withTestRunId(testRunId)
      .withProjectId(projectId)
      .withCorrelationId(metadata.correlationId ?? job.id ?? testRunId)
      .build();

    logger.info('Execution plan built', {
      testRunId,
      agents: plan.agents.map((a: any) => a.type),
      phases: plan.phases.map((p: any) => `${p.phase}(${p.agents.join(',')})`),
    });

    // ── 4. Create the EventBus bridge (coordinator → Redis pub/sub) ───────────
    const eventBus: EventBus = {
      async publish(eventType: string, payload: unknown): Promise<void> {
        // Map coordinator events to progress updates
        const event = payload as Record<string, unknown>;
        const agentType = event?.agentType as string ?? '';
        const agentId = event?.agentId as string ?? '';

        await publishProgress({
          jobId: job.id ?? testRunId,
          jobType: COORDINATE_QUEUE,
          percentage: 0,
          message: `${eventType}: ${agentType} (${agentId})`,
          timestamp: Date.now(),
        });
      },
    };

    // ── 5. Execute the coordinator ────────────────────────────────────────────
    const executor = new LocalAgentExecutor();
    const coordinator = new CoordinatorAgent(plan, {
      executor,
      eventBus,
      logger,
    });

    const result: CoordinatorResult = await coordinator.execute();

    // Report progress: execution done, now persisting
    await job.updateProgress(80);

    // ── 6. Persist agent results to DB ────────────────────────────────────────
    await persistResults(testRunId, result);

    // ── 7. Mark TestRun complete ──────────────────────────────────────────────
    const finalStatus = result.summary.failed > 0 ? 'FAILED' : 'PASSED';
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });

    await job.updateProgress(100);

    // Final progress broadcast
    await publishProgress({
      jobId: job.id ?? testRunId,
      jobType: COORDINATE_QUEUE,
      percentage: 100,
      message: `Test run ${finalStatus.toLowerCase()}: ${result.summary.passed}/${result.summary.total} agents passed`,
      timestamp: Date.now(),
    });

    logger.info('Coordinate job completed', {
      testRunId,
      status: finalStatus,
      passed: result.summary.passed,
      failed: result.summary.failed,
      duration: result.summary.duration,
    });

    return {
      testRunId,
      status: finalStatus,
      summary: {
        total: result.summary.total,
        passed: result.summary.passed,
        failed: result.summary.failed,
        duration: result.summary.duration,
        passRate: result.summary.passRate,
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error('Coordinate job failed', { testRunId, error: errorMessage });

    // Mark the run as FAILED
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
      },
    });

    // Broadcast failure
    await publishProgress({
      jobId: job.id ?? testRunId,
      jobType: COORDINATE_QUEUE,
      percentage: 0,
      message: `Test run failed: ${errorMessage}`,
      timestamp: Date.now(),
    });

    throw err;
  }
}

// =============================================================================
// Persist coordinator results to the DB
// =============================================================================

/**
 * Map each agent result from the coordinator into TestResult + TestStep rows.
 *
 * Each agent becomes a TestResult; the agent's evidence/data is recorded as
 * a single TestStep for now (expandable as agents return richer data).
 */
async function persistResults(testRunId: string, result: CoordinatorResult): Promise<void> {
  for (const agentRun of result.agentResults) {
    // Map coordinator status to Prisma TestResultStatus
    const statusMap: Record<string, string> = {
      completed: agentRun.result?.status === 'pass' ? 'PASSED' : 'FAILED',
      failed: 'FAILED',
      skipped: 'SKIPPED',
      pending: 'PENDING',
      running: 'RUNNING',
    };
    const testResultStatus = statusMap[agentRun.status] ?? 'ERROR';

    const testResult = await prisma.testResult.create({
      data: {
        testRunId,
        testName: `${agentRun.agentType} agent`,
        status: testResultStatus as any,
        errorMessage: agentRun.error?.message ?? null,
      },
    });

    // Create a summary step for each agent
    await prisma.testStep.create({
      data: {
        testResultId: testResult.id,
        stepNumber: 1,
        action: `Execute ${agentRun.agentType} agent`,
        expected: 'Agent completes successfully',
        actual: agentRun.result
          ? `${agentRun.result.status} in ${agentRun.result.durationMs}ms`
          : agentRun.error?.message ?? 'No result',
        status: testResultStatus === 'PASSED' ? 'PASSED' : testResultStatus === 'SKIPPED' ? 'SKIPPED' : 'FAILED',
      },
    });

    // If the agent produced evidence files, record them in additional steps
    if (agentRun.result?.evidence && agentRun.result.evidence.length > 0) {
      for (let i = 0; i < agentRun.result.evidence.length; i++) {
        await prisma.testStep.create({
          data: {
            testResultId: testResult.id,
            stepNumber: i + 2,
            action: 'Collect evidence',
            expected: 'Evidence artifact captured',
            actual: agentRun.result.evidence[i],
            status: 'PASSED',
          },
        });
      }
    }
  }
}

// =============================================================================
// Worker factory
// =============================================================================

/**
 * Creates and returns a BullMQ Worker for the coordinate queue.
 *
 * @param connection - Redis connection options
 * @param concurrency - Max concurrent coordinate jobs (default: 2)
 */
export function createCoordinateWorker(
  connection: ConnectionOptions,
  concurrency = 2,
): Worker<CoordinateJobPayload, CoordinateJobResult> {
  const worker = new Worker<CoordinateJobPayload, CoordinateJobResult>(
    COORDINATE_QUEUE,
    processCoordinateJob,
    {
      connection,
      concurrency,
      prefix: config.redis.keyPrefix,
      lockDuration: 600_000, // 10 minutes — coordinate jobs are long-running
    },
  );

  worker.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed: ${result.status}`, {
      testRunId: result.testRunId,
      summary: result.summary,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`, {
      testRunId: job?.data?.metadata?.testRunId,
    });
  });

  worker.on('error', (err) => {
    logger.error('Coordinate worker error', { error: err.message });
  });

  return worker;
}
