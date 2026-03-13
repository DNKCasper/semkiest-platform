import type { AgentConfig, AgentLogger, AgentResult, AgentStatus, LogLevel } from './types.js';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Creates a structured console logger scoped to the agent name.
 */
function createLogger(agentName: string, level: LogLevel): AgentLogger {
  const minLevel = LOG_LEVELS[level];

  const emit = (lvl: LogLevel, fn: (s: string) => void, message: string, meta?: Record<string, unknown>): void => {
    if (LOG_LEVELS[lvl] >= minLevel) {
      const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level: lvl,
        agent: agentName,
        message,
      };
      if (meta !== undefined) {
        entry['meta'] = meta;
      }
      fn(JSON.stringify(entry));
    }
  };

  return {
    debug: (msg, meta) => emit('debug', (s) => process.stdout.write(`${String(s)}\n`), msg, meta),
    info: (msg, meta) => emit('info', (s) => process.stdout.write(`${String(s)}\n`), msg, meta),
    warn: (msg, meta) => emit('warn', (s) => process.stderr.write(`${String(s)}\n`), msg, meta),
    error: (msg, meta) => emit('error', (s) => process.stderr.write(`${String(s)}\n`), msg, meta),
  };
}

/**
 * Abstract base class for all SemkiEst agents.
 *
 * Subclasses must implement `execute()`. The `run()` method orchestrates
 * initialization, execution, and cleanup, returning a typed `AgentResult`.
 *
 * @example
 * ```ts
 * class MyAgent extends BaseAgent<MyInput, MyOutput> {
 *   async execute(input: MyInput): Promise<MyOutput> {
 *     // implementation
 *   }
 * }
 * ```
 */
export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  protected readonly name: string;
  protected readonly logger: AgentLogger;
  private _status: AgentStatus = 'idle';

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.logger = createLogger(config.name, config.logLevel ?? 'info');
  }

  /**
   * Core agent logic implemented by subclasses.
   * Called by `run()` after `initialize()` completes.
   */
  abstract execute(input: TInput): Promise<TOutput>;

  /**
   * Orchestrates the full agent lifecycle: initialize → execute → cleanup.
   * Always returns an `AgentResult`; never throws.
   */
  async run(input: TInput): Promise<AgentResult<TOutput>> {
    const start = Date.now();
    this._status = 'running';
    this.logger.info('Agent starting');

    try {
      await this.initialize();
      const data = await this.execute(input);
      this._status = 'completed';
      this.logger.info('Agent completed successfully');
      return {
        success: true,
        data,
        duration: Date.now() - start,
        agentName: this.name,
      };
    } catch (err) {
      this._status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Agent execution failed', { error: message });
      return {
        success: false,
        error: message,
        duration: Date.now() - start,
        agentName: this.name,
      };
    } finally {
      await this.safeCleanup();
    }
  }

  /** Override to run setup before execute(). */
  protected async initialize(): Promise<void> {
    this.logger.debug('Initializing agent');
  }

  /** Override to run teardown after execute() (called in finally block). */
  protected async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up agent');
  }

  /** Current lifecycle status of the agent. */
  get status(): AgentStatus {
    return this._status;
  }

  private async safeCleanup(): Promise<void> {
    try {
      await this.cleanup();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn('Cleanup failed', { error: message });
    }
  }
}
