/**
 * BaseAgent - Abstract base class for all SemkiEst platform agents.
 *
 * Provides a common lifecycle (initialize → execute → cleanup) with timing,
 * error handling, and structured result production.
 */

/** Minimal logger interface satisfied by console or any logging library. */
export interface AgentLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/** Core configuration shared by every agent. */
export interface AgentConfig {
  /** Human-readable agent name used in logs and reports. */
  name: string;
  /** SemVer string for this agent implementation. */
  version: string;
  /** Maximum wall-clock milliseconds for the execute() phase (default: 300 000). */
  timeoutMs?: number;
  /** Optional logger; falls back to a console-based implementation. */
  logger?: AgentLogger;
}

/** Structured result envelope returned by BaseAgent.run(). */
export interface AgentResult<TData> {
  /** Name of the agent that produced this result. */
  agentName: string;
  /** Agent version at the time of the run. */
  agentVersion: string;
  /** ISO-8601 timestamp when the run started. */
  startedAt: string;
  /** ISO-8601 timestamp when the run finished. */
  finishedAt: string;
  /** Wall-clock duration of the run in milliseconds. */
  durationMs: number;
  /** Whether the run completed without throwing. */
  success: boolean;
  /** Agent-specific result payload (only present on success). */
  data?: TData;
  /** Human-readable error message (only present on failure). */
  errorMessage?: string;
}

/** Console-based fallback logger used when no logger is supplied. */
const createConsoleLogger = (agentName: string): AgentLogger => ({
  info: (msg, ...args) => console.info(`[${agentName}] INFO  ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[${agentName}] WARN  ${msg}`, ...args),
  error: (msg, ...args) =>
    console.error(`[${agentName}] ERROR ${msg}`, ...args),
  debug: (msg, ...args) =>
    console.debug(`[${agentName}] DEBUG ${msg}`, ...args),
});

/**
 * Abstract base class for SemkiEst agents.
 *
 * Subclasses must implement:
 * - {@link initialize}  — set up external resources (browser, DB connections, …)
 * - {@link execute}     — perform the agent's core work and return typed data
 * - {@link cleanup}     — tear down resources regardless of execute() outcome
 *
 * @template TConfig  Agent-specific config extending {@link AgentConfig}.
 * @template TData    Shape of the data payload produced by this agent.
 */
export abstract class BaseAgent<
  TConfig extends AgentConfig,
  TData,
> {
  protected readonly config: TConfig;
  protected readonly logger: AgentLogger;
  private readonly timeoutMs: number;

  constructor(config: TConfig) {
    this.config = config;
    this.logger = config.logger ?? createConsoleLogger(config.name);
    this.timeoutMs = config.timeoutMs ?? 300_000;
  }

  /**
   * Prepare any resources needed by {@link execute}.
   * Called once before execute() on every run.
   */
  protected abstract initialize(): Promise<void>;

  /**
   * Perform the agent's core work.
   * @returns Agent-specific result data.
   */
  protected abstract execute(): Promise<TData>;

  /**
   * Release all resources acquired in {@link initialize}.
   * Always called — even when execute() throws.
   */
  protected abstract cleanup(): Promise<void>;

  /**
   * Orchestrate the full agent lifecycle and return a structured result.
   *
   * Order of operations:
   * 1. initialize()
   * 2. execute()   (wrapped in a timeout)
   * 3. cleanup()   (always executed)
   */
  async run(): Promise<AgentResult<TData>> {
    const startedAt = new Date();
    this.logger.info(`Starting agent v${this.config.version}`);

    let data: TData | undefined;
    let errorMessage: string | undefined;
    let success = false;

    try {
      await this.initialize();
      data = await this.withTimeout(this.execute(), this.timeoutMs);
      success = true;
      this.logger.info('Agent run completed successfully');
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : String(err);
      this.logger.error(`Agent run failed: ${errorMessage}`);
    } finally {
      try {
        await this.cleanup();
      } catch (cleanupErr) {
        const msg =
          cleanupErr instanceof Error
            ? cleanupErr.message
            : String(cleanupErr);
        this.logger.warn(`Cleanup encountered an error: ${msg}`);
      }
    }

    const finishedAt = new Date();
    const result: AgentResult<TData> = {
      agentName: this.config.name,
      agentVersion: this.config.version,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      success,
    };

    if (success && data !== undefined) {
      result.data = data;
    }
    if (!success) {
      result.errorMessage = errorMessage;
    }

    return result;
  }

  /** Reject a promise if it does not settle within {@link ms} milliseconds. */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Agent timed out after ${ms}ms`)),
        ms,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (reason: unknown) => {
          clearTimeout(timer);
          reject(reason);
        },
      );
    });
  }
}
