import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { AgentConfig, AgentResult, AgentStatus } from './types';

/**
 * Abstract base class for all SemkiEst agents.
 *
 * Provides lifecycle management (initialize / run / stop), status tracking,
 * and a typed EventEmitter surface so agents can stream progress events to
 * callers without coupling to a specific transport.
 *
 * @example
 * ```ts
 * class MyAgent extends BaseAgent<MyConfig, MyResult> {
 *   async initialize() { ... }
 *   async run()        { ... }
 *   async stop()       { ... }
 * }
 * ```
 */
export abstract class BaseAgent<
  TConfig extends AgentConfig = AgentConfig,
  TResult = unknown,
> extends EventEmitter {
  /** Resolved config with any defaults applied. */
  protected readonly config: TConfig & Required<Pick<AgentConfig, 'id'>>;

  private _status: AgentStatus = 'idle';

  constructor(config: TConfig) {
    super();
    this.config = {
      ...config,
      id: config.id ?? randomUUID(),
    } as TConfig & Required<Pick<AgentConfig, 'id'>>;
  }

  // ---------------------------------------------------------------------------
  // Abstract lifecycle interface
  // ---------------------------------------------------------------------------

  /**
   * Perform any async setup before `run()` is called.
   * Implementations should validate prerequisites and acquire resources.
   */
  abstract initialize(): Promise<void>;

  /**
   * Execute the agent's primary work and return a typed result.
   * Must set status to 'running' at the start and 'stopped' (or 'error') at the end.
   */
  abstract run(): Promise<AgentResult<TResult>>;

  /**
   * Gracefully stop an in-progress run.
   * Should attempt to release resources even if called from an error state.
   */
  abstract stop(): Promise<void>;

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  /** Unique identifier assigned at construction. */
  getId(): string {
    return this.config.id;
  }

  /** Human-readable label. */
  getName(): string {
    return this.config.name;
  }

  /** Current lifecycle state. */
  getStatus(): AgentStatus {
    return this._status;
  }

  // ---------------------------------------------------------------------------
  // Protected helpers
  // ---------------------------------------------------------------------------

  /**
   * Transition to a new status and emit a `status` event so listeners can react.
   */
  protected setStatus(status: AgentStatus): void {
    this._status = status;
    this.emit('status', status);
  }

  /**
   * Emit a `log` event with a plain-text message.
   * Prefer this over `console.log` so callers can route output as needed.
   */
  protected log(message: string): void {
    this.emit('log', message);
  }
}
