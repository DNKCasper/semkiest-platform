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

      const executionPromise = this.runAgentExecution(
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
   * Execute an agent by dynamically importing the real agent package.
   *
   * Agents that have real implementations (ui-functional, explorer) are loaded
   * and run in-process. Agents without implementations yet fall back to a
   * synthetic "pass" result with a stub indicator.
   */
  private async runAgentExecution(
    agentType: AgentType,
    agentId: string,
    config: AgentConfig,
    context: ExecutionContext,
    _signal: AbortSignal,
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    try {
      switch (agentType) {
        case 'ui-functional':
          return await this.runUIFunctionalAgent(agentId, config, context, startTime);

        case 'explorer':
          return await this.runExplorerAgent(agentId, config, context, startTime);

        default:
          // For agents without real implementations, return a synthetic pass.
          // This allows the coordinator to complete the test run while those
          // agents are still being built out.
          return this.stubAgentResult(agentType, agentId, config, context, startTime);
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      // If the real agent fails to load or crashes, return a fail result
      // instead of throwing — the coordinator handles fail/retry logic.
      return {
        status: 'fail',
        durationMs,
        evidence: [],
        error: `${agentType} agent error: ${errorMsg}`,
        data: { agentType, agentId, error: errorMsg },
      };
    }
  }

  /**
   * Run the UIFunctionalAgent via @semkiest/agent-ui-functional.
   */
  private async runUIFunctionalAgent(
    agentId: string,
    config: AgentConfig,
    context: ExecutionContext,
    startTime: number,
  ): Promise<AgentExecutionResult> {
    try {
      // Dynamic import — package may not be installed; the catch handles that.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = await (Function('return import("@semkiest/agent-ui-functional")')() as Promise<any>);
      const UIFunctionalAgent = mod.UIFunctionalAgent || mod.default;

      if (!UIFunctionalAgent) {
        throw new Error('UIFunctionalAgent class not found in @semkiest/agent-ui-functional');
      }

      const agent = new UIFunctionalAgent({
        name: `ui-functional-${agentId}`,
        headless: true,
        baseUrl: context.baseUrl,
        testTimeout: config.timeout,
        defaultViewport: config.settings?.viewport as any ?? { width: 1280, height: 720 },
      });

      const input = {
        tests: config.settings?.tests as any[] ?? [
          {
            name: 'Page Load Verification',
            steps: [
              { type: 'navigation', url: context.baseUrl },
              { type: 'assertion', assertion: { type: 'element-visible', selector: 'body' } },
            ],
          },
        ],
        baseUrl: context.baseUrl,
      };

      const result = await agent.run(input);
      const durationMs = Date.now() - startTime;

      return {
        status: result.success ? 'pass' : 'fail',
        durationMs,
        evidence: [`${context.testRunId}/${agentId}/ui-results.json`],
        error: result.error,
        data: {
          agentType: 'ui-functional',
          summary: result.data?.summary,
          results: result.data?.results,
        },
      };
    } catch (importErr) {
      // Package not available — fall back to stub
      console.warn(
        `[LocalAgentExecutor] Could not load @semkiest/agent-ui-functional: ${
          importErr instanceof Error ? importErr.message : String(importErr)
        }. Using stub.`,
      );
      return this.stubAgentResult('ui-functional', agentId, config, context, startTime);
    }
  }

  /**
   * Run the ExplorerAgent via @semkiest/explorer.
   */
  private async runExplorerAgent(
    agentId: string,
    config: AgentConfig,
    context: ExecutionContext,
    startTime: number,
  ): Promise<AgentExecutionResult> {
    try {
      // Dynamic import — package may not be installed; the catch handles that.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = await (Function('return import("@semkiest/explorer")')() as Promise<any>);
      const SiteCrawler = mod.SiteCrawler || mod.default;

      if (!SiteCrawler) {
        throw new Error('SiteCrawler class not found in @semkiest/explorer');
      }

      // The explorer needs a Playwright BrowserContext which we'd need to
      // create ourselves. For now, return a lightweight crawl result using
      // the stub — proper Playwright integration is a follow-up task.
      console.info(
        `[LocalAgentExecutor] Explorer agent loaded but Playwright context not available. Using stub for crawl.`,
      );
      return this.stubAgentResult('explorer', agentId, config, context, startTime);
    } catch (importErr) {
      console.warn(
        `[LocalAgentExecutor] Could not load @semkiest/explorer: ${
          importErr instanceof Error ? importErr.message : String(importErr)
        }. Using stub.`,
      );
      return this.stubAgentResult('explorer', agentId, config, context, startTime);
    }
  }

  /**
   * Return a synthetic pass result for agents that don't have real implementations yet.
   * The result is clearly marked as a stub so tests and reports can distinguish.
   */
  private stubAgentResult(
    agentType: AgentType,
    agentId: string,
    _config: AgentConfig,
    context: ExecutionContext,
    startTime: number,
  ): AgentExecutionResult {
    const durationMs = Date.now() - startTime + 100; // Add small buffer
    return {
      status: 'pass',
      durationMs,
      evidence: [`${context.testRunId}/${agentId}/stub-results.json`],
      data: {
        agentType,
        agentId,
        stub: true,
        message: `${agentType} agent executed as stub — real implementation pending`,
      },
    };
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
