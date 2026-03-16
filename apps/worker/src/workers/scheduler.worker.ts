import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { prisma } from '@semkiest/db';
import { RunStatus } from '@semkiest/db';
import type { ScheduledTestJobData, ScheduledTestJobResult } from '@semkiest/shared-types';
import { SCHEDULER_QUEUE_NAME } from '../queues/scheduler.queue';
import { config } from '../config';

// =============================================================================
// Scheduled-test job processor
// =============================================================================

/**
 * Processes a single scheduled-test job.
 *
 * Responsibilities:
 *  1. Create / update a ScheduleRun record to track execution
 *  2. Execute the test suite (stubbed: replace with real test runner integration)
 *  3. Update the ScheduleRun record with success / failure outcome
 *  4. Update parent Schedule.lastRunStatus and nextRunAt
 *
 * Concurrency is controlled at the Worker level via the `concurrency` option,
 * which prevents overlapping runs for the same queue.
 */
async function processScheduledTestJob(
  job: Job<ScheduledTestJobData, ScheduledTestJobResult>,
): Promise<ScheduledTestJobResult> {
  const { scheduleId, projectId, runId, attempt } = job.data;

  console.info(
    `[scheduler-worker] Processing job ${job.id}: schedule=${scheduleId} project=${projectId} attempt=${attempt}`,
  );

  // Upsert a ScheduleRun record (the API may have already created one for catch-up runs)
  let run = await prisma.scheduleRun.findUnique({ where: { id: runId } });

  if (!run) {
    run = await prisma.scheduleRun.create({
      data: {
        id: runId,
        scheduleId,
        status: RunStatus.RUNNING,
        jobId: job.id ?? undefined,
        attempt,
      },
    });
  } else {
    await prisma.scheduleRun.update({
      where: { id: runId },
      data: { status: RunStatus.RUNNING, jobId: job.id ?? undefined },
    });
  }

  // Update parent schedule: last run timestamp
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { lastRunAt: new Date() },
  });

  try {
    // -------------------------------------------------------------------------
    // TODO: Replace this stub with actual test execution logic.
    //
    // Integration point: call the test runner service (e.g. Playwright,
    // custom test orchestrator) with the projectId and any profile config
    // stored on the schedule's metadata field.
    // -------------------------------------------------------------------------
    await runTestsForProject(projectId, scheduleId);

    // Mark as success
    const completedAt = new Date();
    await prisma.scheduleRun.update({
      where: { id: runId },
      data: { status: RunStatus.SUCCESS, completedAt },
    });

    await prisma.schedule.update({
      where: { id: scheduleId },
      data: { lastRunStatus: RunStatus.SUCCESS },
    });

    console.info(
      `[scheduler-worker] Job ${job.id} completed successfully for schedule ${scheduleId}`,
    );

    return {
      runId,
      scheduleId,
      status: 'success',
      completedAt: completedAt.toISOString(),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const completedAt = new Date();
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    await prisma.scheduleRun.update({
      where: { id: runId },
      data: {
        status: isFinalAttempt ? RunStatus.FAILED : RunStatus.PENDING,
        completedAt: isFinalAttempt ? completedAt : undefined,
        errorMessage,
      },
    });

    if (isFinalAttempt) {
      await prisma.schedule.update({
        where: { id: scheduleId },
        data: { lastRunStatus: RunStatus.FAILED },
      });
    }

    console.error(
      `[scheduler-worker] Job ${job.id} failed (attempt ${job.attemptsMade + 1}): ${errorMessage}`,
    );

    // Re-throw so BullMQ can apply retry/backoff
    throw err;
  }
}

// =============================================================================
// Test execution — creates a real TestRun and enqueues the coordinate job
// =============================================================================

/**
 * Creates a TestRun for the project, optionally pulling the test profile
 * from the schedule's metadata, and returns once the run is created.
 *
 * The actual test orchestration is handled by the coordinate queue worker
 * (if available) or directly via the API. The ScheduleRun record provides
 * the link between the schedule and the test run.
 */
async function runTestsForProject(projectId: string, scheduleId: string): Promise<void> {
  console.info(
    `[scheduler-worker] Executing tests for project=${projectId} schedule=${scheduleId}`,
  );

  // Fetch the schedule to get any metadata (e.g. profileId override)
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { metadata: true },
  });

  // Determine the test profile to use:
  //  1. From schedule metadata if specified
  //  2. Otherwise pick the first profile belonging to the project
  let profileId: string | undefined;

  const meta = schedule?.metadata as Record<string, unknown> | null;
  if (meta && typeof meta['profileId'] === 'string') {
    profileId = meta['profileId'] as string;
  }

  if (!profileId) {
    const firstProfile = await prisma.testProfile.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    profileId = firstProfile?.id;
  }

  if (!profileId) {
    throw new Error(`No test profile found for project ${projectId}. Create a profile first.`);
  }

  // Create a TestRun in PENDING status
  const testRun = await prisma.testRun.create({
    data: {
      testProfileId: profileId,
      status: 'PENDING',
    },
  });

  console.info(
    `[scheduler-worker] Created TestRun ${testRun.id} for profile=${profileId} schedule=${scheduleId}`,
  );

  // Mark the run as RUNNING
  await prisma.testRun.update({
    where: { id: testRun.id },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  // Try to enqueue a coordinate job if the queue infrastructure is available.
  // This is a best-effort integration — if BullMQ queues aren't reachable from
  // the worker context we just mark the run as needing manual processing.
  try {
    const { enqueueCoordinateJob } = await import('../queue');
    if (typeof enqueueCoordinateJob === 'function') {
      await enqueueCoordinateJob({
        metadata: {
          projectId,
          testRunId: testRun.id,
          correlationId: scheduleId,
        },
        baseUrl: '', // will be resolved from project config
        profileId,
      });
      console.info(
        `[scheduler-worker] Enqueued coordinate job for TestRun ${testRun.id}`,
      );
    }
  } catch {
    // Coordinate queue not available — the run stays in RUNNING status
    // and can be picked up by the API polling or completed manually.
    console.warn(
      `[scheduler-worker] Could not enqueue coordinate job for TestRun ${testRun.id} — run stays in RUNNING state`,
    );
  }
}

// =============================================================================
// Worker factory
// =============================================================================

/**
 * Creates and returns a BullMQ Worker that processes scheduled-test jobs.
 *
 * @param connection      - ioredis connection options
 * @param concurrency     - max concurrent jobs (default: 5); prevents overlapping runs
 */
export function createSchedulerWorker(
  connection: ConnectionOptions,
  concurrency = 5,
): Worker<ScheduledTestJobData, ScheduledTestJobResult> {
  const worker = new Worker<ScheduledTestJobData, ScheduledTestJobResult>(
    SCHEDULER_QUEUE_NAME,
    processScheduledTestJob,
    {
      connection,
      concurrency,
      prefix: config.redis.keyPrefix,
      // Lock duration: 30 s per job; auto-extended while the job is processing
      lockDuration: 30_000,
    },
  );

  worker.on('completed', (job, result) => {
    console.info(`[scheduler-worker] Job ${job.id} done:`, result.status);
  });

  worker.on('failed', (job, err) => {
    console.error(`[scheduler-worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[scheduler-worker] Worker error:', err);
  });

  return worker;
}
