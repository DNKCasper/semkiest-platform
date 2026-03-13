/**
 * Abstract base class that all SemkiEst agents must extend.
 *
 * BaseAgent manages the full agent lifecycle:
 *   IDLE → INITIALIZING → RUNNING → COMPLETED | FAILED | CANCELLED
 *
 * Subclasses implement the four abstract lifecycle hooks:
 *   {@link initialize}, {@link execute}, {@link cleanup}, {@link onError}
 *
 * During execution subclasses can call the protected reporting helpers:
 *   {@link reportResult}, {@link reportProgress}, {@link reportError}
 */

import { AgentContext } from './context';
import { AgentStateMachine, InvalidTransitionError } from './state-machine';
import {
  AgentOptions,
  AgentResult,
  AgentState,
  ErrorReport,
  HeartbeatInfo,
  ProgressUpdate,
  ResultStatus,
} from './types';

export abstract class BaseAgent<TResult = unknown> {
  /** Unique identifier for this agent instance. */
  readonly agentId: string;

  /** Shared services injected at construction time. */
  protected readonly context: AgentContext;

  private readonly stateMachine: AgentStateMachine;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs: number;
  private lastHeartbeat: Date;
  private startedAt: Date | null = null;

  /** The final result of the agent run (set once, never mutated). */
  protected result: AgentResult<TResult> | null = null;

  // ---------------------------------------------------------------------------
  // Observable callbacks – consumers attach these to monitor the agent.
  // ---------------------------------------------------------------------------

  /** Called once when the agent produces its final result. */
  onResultReported?: (result: AgentResult<TResult>) => void;

  /** Called whenever the agent emits a progress update. */
  onProgressReported?: (update: ProgressUpdate) => void;

  /** Called whenever the agent reports a structured error. */
  onErrorReported?: (report: ErrorReport) => void;

  /** Called on each heartbeat tick while the agent is running. */
  onHeartbeat?: (info: HeartbeatInfo) => void;

  /**
   * @param agentId  Unique identifier for this agent instance.
   * @param context  Shared services provided by the framework.
   * @param options  Optional tunables (e.g. heartbeat interval).
   */
  constructor(agentId: string, context: AgentContext, options?: AgentOptions) {
    this.agentId = agentId;
    this.context = context;
    this.stateMachine = new AgentStateMachine();
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 30_000;
    this.lastHeartbeat = new Date();
  }

  // ---------------------------------------------------------------------------
  // State observation
  // ---------------------------------------------------------------------------

  /** Returns the agent's current lifecycle state. */
  getState(): AgentState {
    return this.stateMachine.getState();
  }

  /** Returns a snapshot suitable for external monitoring systems. */
  getHeartbeatInfo(): HeartbeatInfo {
    return {
      agentId: this.agentId,
      state: this.getState(),
      lastHeartbeat: this.lastHeartbeat,
    };
  }

  // ---------------------------------------------------------------------------
  // Abstract lifecycle hooks – must be implemented by every subclass.
  // ---------------------------------------------------------------------------

  /**
   * Called once before {@link execute}.
   * Use this to acquire resources, validate configuration, or warm up caches.
   */
  protected abstract initialize(): Promise<void>;

  /**
   * Main execution logic.
   * The agent is in the RUNNING state for the duration of this call.
   * Implementations should call {@link reportProgress} to emit updates and
   * {@link reportResult} to set the final outcome before returning.
   */
  protected abstract execute(): Promise<void>;

  /**
   * Called after {@link execute} completes (or after an error), even if the
   * agent was cancelled. Use this to release resources unconditionally.
   */
  protected abstract cleanup(): Promise<void>;

  /**
   * Called when an unhandled error is thrown from {@link initialize} or
   * {@link execute}. The agent will transition to FAILED after this hook.
   * @param error The error that triggered the failure.
   */
  protected abstract onError(error: Error): Promise<void>;

  // ---------------------------------------------------------------------------
  // Primary entry point
  // ---------------------------------------------------------------------------

  /**
   * Runs the full agent lifecycle in order:
   * initialize → execute → cleanup (always) → result
   *
   * @returns The {@link AgentResult} produced during execution.
   */
  async run(): Promise<AgentResult<TResult>> {
    this.startedAt = new Date();
    this.startHeartbeat();

    try {
      this.stateMachine.transition(AgentState.INITIALIZING);
      this.context.logger.info(`Agent ${this.agentId} initializing`);
      await this.initialize();

      this.stateMachine.transition(AgentState.RUNNING);
      this.context.logger.info(`Agent ${this.agentId} running`);
      await this.execute();

      if (this.stateMachine.canTransition(AgentState.COMPLETED)) {
        this.stateMachine.transition(AgentState.COMPLETED);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Skip the onError hook for state machine violations (internal errors).
      if (!(error instanceof InvalidTransitionError)) {
        this.context.logger.error(`Agent ${this.agentId} encountered an error`, {
          error: err.message,
        });
        try {
          await this.onError(err);
        } catch (hookErr) {
          this.context.logger.error(`Agent ${this.agentId} onError hook threw`, {
            error: hookErr instanceof Error ? hookErr.message : String(hookErr),
          });
        }
      }

      if (this.stateMachine.canTransition(AgentState.FAILED)) {
        this.stateMachine.transition(AgentState.FAILED);
      }

      if (!this.result) {
        this.reportError({ error: err });
        const failResult: AgentResult<TResult> = {
          agentId: this.agentId,
          status: 'fail',
          error: err,
          startedAt: this.startedAt,
          completedAt: new Date(),
        };
        this.result = failResult;
        this.onResultReported?.(failResult);
      }
    } finally {
      this.stopHeartbeat();
      try {
        await this.cleanup();
      } catch (cleanupErr) {
        this.context.logger.error(`Agent ${this.agentId} cleanup threw`, {
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
    }

    if (!this.result) {
      const passResult: AgentResult<TResult> = {
        agentId: this.agentId,
        status: 'pass',
        startedAt: this.startedAt,
        completedAt: new Date(),
      };
      this.result = passResult;
      this.onResultReported?.(passResult);
    }

    return this.result;
  }

  /**
   * Requests cancellation of the agent.
   * Only has an effect if the agent is in a cancellable state (IDLE or RUNNING).
   */
  async cancel(): Promise<void> {
    if (this.stateMachine.canTransition(AgentState.CANCELLED)) {
      this.stateMachine.transition(AgentState.CANCELLED);
      this.stopHeartbeat();
      this.context.logger.info(`Agent ${this.agentId} cancelled`);
    }
  }

  // ---------------------------------------------------------------------------
  // Protected reporting helpers – called from within execute()
  // ---------------------------------------------------------------------------

  /**
   * Records the final result of the agent run.
   * If called inside {@link execute}, this result is returned from {@link run}.
   *
   * @param status   Outcome classification.
   * @param data     Agent-specific result payload.
   * @param metadata Arbitrary key/value annotations.
   */
  protected reportResult(
    status: ResultStatus,
    data?: TResult,
    metadata?: Record<string, unknown>,
  ): void {
    const agentResult: AgentResult<TResult> = {
      agentId: this.agentId,
      status,
      data,
      startedAt: this.startedAt ?? new Date(),
      completedAt: new Date(),
      metadata,
    };
    this.result = agentResult;
    this.onResultReported?.(agentResult);
  }

  /**
   * Emits an incremental progress update to any attached observer.
   *
   * @param message  Human-readable description of the current step.
   * @param progress Optional completion percentage (0–100).
   * @param metadata Arbitrary key/value annotations.
   */
  protected reportProgress(
    message: string,
    progress?: number,
    metadata?: Record<string, unknown>,
  ): void {
    const update: ProgressUpdate = {
      agentId: this.agentId,
      message,
      progress,
      metadata,
      timestamp: new Date(),
    };
    this.onProgressReported?.(update);
  }

  /**
   * Emits a structured error report to any attached observer.
   *
   * @param options.error   The error being reported.
   * @param options.context Additional context captured at the error site.
   */
  protected reportError(options: { error: Error; context?: Record<string, unknown> }): void {
    const errorReport: ErrorReport = {
      agentId: this.agentId,
      error: options.error,
      context: options.context,
      timestamp: new Date(),
    };
    this.onErrorReported?.(errorReport);
  }

  // ---------------------------------------------------------------------------
  // Heartbeat mechanism
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.lastHeartbeat = new Date();
      this.onHeartbeat?.(this.getHeartbeatInfo());
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
