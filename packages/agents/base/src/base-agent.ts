import { EventEmitter } from 'events';
import {
  AgentConfig,
  AgentResult,
  AgentLogEntry,
  AgentEvent,
  LogLevel,
} from './types';

/**
 * Abstract base class that all SemkiEst agents extend.
 *
 * Provides:
 * - Lifecycle management (start → execute → end)
 * - Structured logging via `this.log()`
 * - Timeout enforcement
 * - EventEmitter-based event broadcasting
 * - Consistent AgentResult construction helpers
 */
export abstract class BaseAgent<
  TConfig extends AgentConfig = AgentConfig,
  TInput = unknown,
  TData = unknown,
> extends EventEmitter {
  protected readonly config: TConfig;
  private readonly logs: AgentLogEntry[] = [];

  constructor(config: TConfig) {
    super();
    this.config = config;
  }

  /** The agent's unique identifier */
  get id(): string {
    return this.config.id;
  }

  /** The agent's display name */
  get name(): string {
    return this.config.name;
  }

  /**
   * Override this method to implement agent-specific logic.
   * Called internally by `run()` which wraps it with timeout and lifecycle events.
   */
  protected abstract executeImpl(input: TInput): Promise<TData>;

  /**
   * Public entry-point. Wraps `executeImpl` with timeout, lifecycle events,
   * and structured error handling.
   */
  async run(input: TInput): Promise<AgentResult<TData>> {
    const startedAt = Date.now();

    this.emitEvent({ type: 'start', agentId: this.id, agentName: this.name });

    try {
      const data = await this.withTimeout(
        () => this.executeImpl(input),
        this.config.timeout ?? 60_000,
      );

      const result: AgentResult<TData> = {
        success: true,
        data,
        duration: Date.now() - startedAt,
        metadata: { logs: this.logs },
      };

      this.emitEvent({ type: 'end', agentId: this.id, result });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      this.emitEvent({ type: 'error', agentId: this.id, error });

      const result: AgentResult<TData> = {
        success: false,
        error: error.message,
        duration: Date.now() - startedAt,
        metadata: { logs: this.logs },
      };

      this.emitEvent({ type: 'end', agentId: this.id, result });
      return result;
    }
  }

  /** Emit a structured log entry and broadcast it as an agent event */
  protected log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: AgentLogEntry = { level, message, timestamp: new Date(), context };
    this.logs.push(entry);
    this.emitEvent({ type: 'log', agentId: this.id, entry });
  }

  /** Convenience helpers */
  protected debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  protected info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  protected warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  protected error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  /** Returns a copy of all log entries collected so far */
  getLogs(): AgentLogEntry[] {
    return [...this.logs];
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private emitEvent(event: AgentEvent): void {
    this.emit(event.type, event);
    this.emit('*', event);
  }

  private withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent "${this.name}" timed out after ${ms}ms`));
      }, ms);

      fn()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
