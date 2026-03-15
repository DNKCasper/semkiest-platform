/**
 * CoordinatorAgent — orchestrates multi-agent test runs.
 *
 * Extends BaseAgent to sequence multiple testing agents into a single cohesive
 * test run, managing phases, handling failures, tracking progress, and
 * aggregating results.
 */

import { randomUUID } from 'crypto';
import {
  AgentRunStatus,
  CoordinatorResult,
  ExecutionContext,
  ExecutionPhase,
  TestRunPlan,
  TestRunSummary,
} from './types';
import { AgentExecutor, LocalAgentExecutor } from './agent-executor';

/**
 * Event emitter interface for publishing test run events.
 * Minimal Socket.IO-compatible shape to avoid hard dependency.
 */
export interface EventBus {
  publish(eventType: string, payload: unknown): Promise<void>;
}

/**
 * Logger interface compatible with common Node.js loggers.
 */
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * The Coordinator Agent orchestrates multiple testing agents into a
 * single test run. It manages:
 *
 * - Validating the test run plan
 * - Arranging agents into phases
 * - Executing agents sequentially or in parallel based on phase config
 * - Handling agent failures according to configured strategy
 * - Emitting progress events for real-time updates
 * - Aggregating results into a final CoordinatorResult
 */
export class CoordinatorAgent {
  private plan: TestRunPlan;
  private executor: AgentExecutor;
  private eventBus?: EventBus;
  private logger: Logger;

  private agentRunStatus: Map<string, AgentRunStatus> = new Map();
  private startedAt: Date | null = null;
  private completedAt: Date | null = null;

  /**
   * Create a coordinator agent.
   *
   * @param plan - The test run plan specifying agents and execution order.
   * @param options.executor - Agent executor (defaults to LocalAgentExecutor).
   * @param options.eventBus - Optional event bus for publishing progress events.
   * @param options.logger - Logger instance (defaults to console).
   */
  constructor(
    plan: TestRunPlan,
    options?: {
      executor?: AgentExecutor;
      eventBus?: EventBus;
      logger?: Logger;
    },
  ) {
    this.plan = plan;
    this.executor = options?.executor || new LocalAgentExecutor();
    this.eventBus = options?.eventBus;
    this.logger = options?.logger || console;
  }

  /**
   * Execute the full test run plan.
   *
   * @returns A CoordinatorResult with aggregated test results.
   */
  async execute(): Promise<CoordinatorResult> {
    this.startedAt = new Date();
    this.logger.info('Coordinator starting test run', {
      testRunId: this.plan.testRunId,
      projectId: this.plan.projectId,
    });

    try {
      // Initialize agent tracking.
      this.initializeAgentTracking();

      // Execute each phase in order.
      for (const phaseConfig of this.plan.phases) {
        // Skip empty phases.
        if (phaseConfig.agents.length === 0) {
          this.logger.debug('Skipping empty phase', { phase: phaseConfig.phase });
          continue;
        }

        this.logger.info('Executing phase', {
          phase: phaseConfig.phase,
          agents: phaseConfig.agents,
          parallel: phaseConfig.parallel,
        });

        await this.executePhase(phaseConfig);

        // Check failure strategy after each phase.
        if (this.shouldHaltExecution()) {
          this.logger.warn('Halting execution due to failure strategy', {
            strategy: this.plan.failureStrategy,
          });
          break;
        }
      }

      // Mark remaining pending agents as skipped.
      this.markSkippedAgents();

      this.completedAt = new Date();
      return this.buildResult();
    } catch (error) {
      this.completedAt = new Date();
      this.logger.error('Coordinator encountered an error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Initialize tracking data structures for all configured agents.
   */
  private initializeAgentTracking(): void {
    for (const agentConfig of this.plan.agents) {
      if (!agentConfig.enabled) {
        continue;
      }

      const agentId = `${agentConfig.type}-${randomUUID()}`;
      const status: AgentRunStatus = {
        agentType: agentConfig.type,
        agentId,
        phase: 'discovery', // Will be updated when agent starts.
        status: 'pending',
        retryCount: 0,
      };
      this.agentRunStatus.set(agentId, status);
    }
  }

  /**
   * Execute all agents in a phase.
   */
  private async executePhase(phaseConfig: any): Promise<void> {
    const phaseStarted = Date.now();

    // Get all agent IDs for this phase.
    const agentIds = Array.from(this.agentRunStatus.entries())
      .filter(([, status]) => phaseConfig.agents.includes(status.agentType))
      .map(([id]) => id);

    if (phaseConfig.parallel) {
      // Run agents in parallel.
      await Promise.all(
        agentIds.map((agentId) => this.executeAgent(agentId, phaseConfig.phase)),
      );
    } else {
      // Run agents sequentially.
      for (const agentId of agentIds) {
        await this.executeAgent(agentId, phaseConfig.phase);
      }
    }

    const phaseDuration = Date.now() - phaseStarted;
    this.logger.info('Phase completed', {
      phase: phaseConfig.phase,
      duration: phaseDuration,
    });
  }

  /**
   * Execute a single agent.
   */
  private async executeAgent(agentId: string, phase: ExecutionPhase): Promise<void> {
    const status = this.agentRunStatus.get(agentId);
    if (!status) {
      this.logger.warn('Agent not found in tracking', { agentId });
      return;
    }

    // Find the agent config.
    const agentConfig = this.plan.agents.find((a) => a.type === status.agentType);
    if (!agentConfig) {
      this.logger.warn('Agent config not found', { agentType: status.agentType });
      return;
    }

    // Mark as running and emit start event.
    status.phase = phase;
    status.status = 'running';
    status.startedAt = new Date();

    await this.publishEvent('AgentStarted', {
      agentId,
      agentType: status.agentType,
      testRunId: this.plan.testRunId,
      config: agentConfig,
    });

    const startTime = Date.now();

    try {
      // Execute the agent.
      const context: ExecutionContext = {
        testRunId: this.plan.testRunId,
        projectId: this.plan.projectId,
        baseUrl: this.plan.baseUrl,
        correlationId: this.plan.correlationId,
        timeout: agentConfig.timeout,
      };

      const result = await this.executor.execute(
        status.agentType,
        agentId,
        agentConfig,
        context,
      );

      const duration = Date.now() - startTime;

      // Mark as completed.
      status.completedAt = new Date();
      status.status = 'completed';
      status.result = {
        status: result.status,
        evidence: result.evidence,
        error: result.error,
        durationMs: duration,
        data: result.data,
      };

      // Emit completion event.
      await this.publishEvent('AgentCompleted', {
        agentId,
        agentType: status.agentType,
        testRunId: this.plan.testRunId,
        result: {
          status: result.status,
          evidence: result.evidence,
          duration,
          summary: `${status.agentType} completed with status ${result.status}`,
        },
      });

      this.logger.info('Agent completed', {
        agentId,
        agentType: status.agentType,
        status: result.status,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if we should retry.
      if (status.retryCount < agentConfig.retries) {
        status.retryCount++;
        this.logger.warn('Agent failed, retrying', {
          agentId,
          attempt: status.retryCount,
          error: errorMsg,
        });

        // Retry the agent.
        return this.executeAgent(agentId, phase);
      }

      // Mark as failed.
      status.completedAt = new Date();
      status.status = 'failed';
      status.error = {
        message: errorMsg,
        code: 'AGENT_EXECUTION_FAILED',
        stack: error instanceof Error ? error.stack : undefined,
      };

      // Emit failure event.
      await this.publishEvent('AgentFailed', {
        agentId,
        agentType: status.agentType,
        testRunId: this.plan.testRunId,
        error: {
          message: errorMsg,
          code: 'AGENT_EXECUTION_FAILED',
        },
        retryCount: status.retryCount,
      });

      this.logger.error('Agent failed', {
        agentId,
        agentType: status.agentType,
        error: errorMsg,
        duration,
      });
    }
  }

  /**
   * Check if execution should halt based on the failure strategy.
   */
  private shouldHaltExecution(): boolean {
    if (this.plan.failureStrategy === 'fail-fast') {
      // Halt on any failure.
      return Array.from(this.agentRunStatus.values()).some(
        (status) => status.status === 'failed',
      );
    }

    // continue-on-error and retry-then-continue always continue.
    return false;
  }

  /**
   * Mark all pending agents as skipped (e.g., due to halt).
   */
  private markSkippedAgents(): void {
    for (const status of this.agentRunStatus.values()) {
      if (status.status === 'pending') {
        status.status = 'skipped';
      }
    }
  }

  /**
   * Build the final CoordinatorResult.
   */
  private buildResult(): CoordinatorResult {
    const agentResults = Array.from(this.agentRunStatus.values());
    const summary = this.computeSummary(agentResults);

    return {
      testRunId: this.plan.testRunId,
      projectId: this.plan.projectId,
      phases: this.plan.phases,
      agentResults,
      summary,
      reportUrl: `http://reports.local/${this.plan.testRunId}/index.html`,
    };
  }

  /**
   * Compute summary statistics from agent results.
   */
  private computeSummary(agentResults: AgentRunStatus[]): TestRunSummary {
    const duration = (this.completedAt?.getTime() ?? 0) - (this.startedAt?.getTime() ?? 0);

    const counts = {
      total: agentResults.length,
      passed: agentResults.filter((a) => a.result?.status === 'pass').length,
      failed: agentResults.filter((a) => a.status === 'failed').length,
      warnings: agentResults.filter((a) => a.result?.status === 'warning').length,
      skipped: agentResults.filter((a) => a.status === 'skipped').length,
    };

    const passRate =
      counts.total > 0 ? Math.round((counts.passed / counts.total) * 100) : 0;

    return {
      total: counts.total,
      passed: counts.passed,
      failed: counts.failed,
      warnings: counts.warnings,
      skipped: counts.skipped,
      duration,
      passRate,
    };
  }

  /**
   * Publish an event via the event bus (if available).
   */
  private async publishEvent(eventType: string, payload: unknown): Promise<void> {
    if (!this.eventBus) {
      return;
    }

    try {
      await this.eventBus.publish(eventType, payload);
    } catch (error) {
      this.logger.warn('Failed to publish event', {
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
