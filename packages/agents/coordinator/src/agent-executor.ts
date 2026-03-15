/**
 * Agent executor abstractions — define how agents are launched and monitored.
 *
 * The coordinator uses AgentExecutor to abstract away the details of how
 * agents are actually run: in-process, via BullMQ queue, etc.
 */

import {
  AgentConfig,
  AgentExecutionResult,
  AgentType,
  ExecutionContext,
} from './types';

// ---------------------------------------------------------------------------
// Core abstractions
// ---------------------------------------------------------------------------

/**
 * Abstract interface for executing agents.
 *
 * Implementations handle the actual mechanics of running an agent,
 * whether in-process, via job queue, remote RPC, etc.
 */
export interface AgentExecutor {
  /**
   * Execute an agent and return its result.
   *
   * @param agentType - Type of agent to run.
   * @param agentId - Unique identifier for this agent instance.
   * @param config - Agent configuration (including settings, timeouts, etc).
   * @param context - Execution context (test run, project, URLs, etc).
   * @returns The result of the agent execution.
   * @throws If the execution fails or times out.
   */
  execute(
    agentType: AgentType,
    agentId: string,
    config: AgentConfig,
    context: ExecutionContext,
  ): Promise<AgentExecutionResult>;

  /**
   * Cancel an agent that is currently executing.
   *
   * @param agentId - The agent instance to cancel.
   */
  cancel(agentId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local (in-process) executor
// ---------------------------------------------------------------------------

/**
 * In-process agent executor that runs agents directly within the
 * coordinator process. Useful for testing and single-node setups.
 *
 * NOTE: This is a stub implementation. In a real system, this would
 * dynamically import and instantiate agent classes. For now, it returns
 * synthetic results suitable for testing the coordinator logic.
 */
export class LocalAgentExecutor implements AgentExecutor {
  private runningAgents: Map<string, AbortController> = new Map();

  /**
   * Execute an agent locally with timeout support.
   */
  async execute(
    agentType: AgentType,
    agentId: string,
    config: AgentConfig,
    context: ExecutionContext,
  ): Promise<AgentExecutionResult> {
    const abortController = new AbortController();
    this.runningAgents.set(agentId, abortController);

    try {
      // Simulate agent execution with timeout.
      const timeoutPromise = new Promise<AgentExecutionResult>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Agent ${agentId} timed out after ${config.timeout}ms`));
        }, config.timeout);

        abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
        });
      });

      const executionPromise = this.simulateAgentExecution(
        agentType,
        agentId,
        config,
        context,
        abortController.signal,
      );

      return await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      this.runningAgents.delete(agentId);
    }
  }

  /**
   * Cancel an agent execution.
   */
  async cancel(agentId: string): Promise<void> {
    const controller = this.runningAgents.get(agentId);
    if (controller) {
      controller.abort();
      this.runningAgents.delete(agentId);
    }
  }

  /**
   * Simulate agent execution (stub).
   *
   * In a real implementation, this would:
   * 1. Dynamically import the agent module based on agentType.
   * 2. Instantiate the agent with the provided config and context.
   * 3. Call agent.run() to get the result.
   * 4. Transform the AgentResult into AgentExecutionResult.
   */
  private async simulateAgentExecution(
    agentType: AgentType,
    agentId: string,
    config: AgentConfig,
    context: ExecutionContext,
    signal: AbortSignal,
  ): Promise<AgentExecutionResult> {
    // Simulate varying execution times based on agent type.
    const baseDurationMs = {
      explorer: 2000,
      'spec-reader': 1500,
      'ui-functional': 3000,
      'visual-regression': 2500,
      accessibility: 2000,
      'cross-browser': 4000,
      load: 5000,
      security: 3500,
      'data-generator': 1000,
      performance: 3000,
      api: 2000,
    }[agentType] || 2000;

    const durationMs = baseDurationMs + Math.random() * 1000;

    // Return a passing result (stub).
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          status: 'pass',
          durationMs,
          evidence: [`${context.testRunId}/${agentId}/results.json`],
          data: {
            agentType,
            config,
            context,
          },
        });
      }, durationMs);

      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Queue-based executor (BullMQ stub)
// ---------------------------------------------------------------------------

/**
 * Executor that dispatches agent execution to a BullMQ job queue.
 *
 * This is a stub implementation. A real implementation would:
 * 1. Connect to a Redis instance.
 * 2. Create BullMQ Queue instances for each agent type.
 * 3. Enqueue jobs with the appropriate metadata.
 * 4. Poll or subscribe for job completion.
 * 5. Handle retries and failures via BullMQ mechanisms.
 */
export class QueueAgentExecutor implements AgentExecutor {
  /**
   * Create a queue executor.
   *
   * @param redisUrl - Connection string for Redis (e.g., "redis://localhost:6379").
   */
  constructor(private _redisUrl: string) {
    // TODO: Initialize Redis connection and BullMQ queues.
  }

  /**
   * Enqueue an agent job and wait for completion.
   */
  async execute(
    _agentType: AgentType,
    _agentId: string,
    _config: AgentConfig,
    _context: ExecutionContext,
  ): Promise<AgentExecutionResult> {
    // TODO: Implement BullMQ job enqueuing.
    // 1. Get or create queue for agentType.
    // 2. Add job with agentId, config, context.
    // 3. Set job timeout to config.timeout.
    // 4. Subscribe to job completion event.
    // 5. Return result or throw on failure.

    throw new Error(
      'QueueAgentExecutor.execute() not yet implemented. Stub for future BullMQ integration.',
    );
  }

  /**
   * Cancel an enqueued or running job.
   */
  async cancel(_agentId: string): Promise<void> {
    // TODO: Implement BullMQ job cancellation.
    throw new Error(
      'QueueAgentExecutor.cancel() not yet implemented. Stub for future BullMQ integration.',
    );
  }
}
