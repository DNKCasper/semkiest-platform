/**
 * BaseAgent — abstract foundation for all SemkiEst platform agents.
 *
 * Provides a consistent lifecycle (execute, with timing + error wrapping)
 * and a minimal logging interface so concrete agents focus purely on their
 * domain logic.
 *
 * Dependency: SEM-50 (Base Agent Framework)
 * This local implementation satisfies the SEM-76 dependency until the
 * shared @semkiest/agent-framework package is published.
 */

/** Static configuration supplied when constructing an agent */
export interface AgentConfig {
  /** Human-readable agent name used in logs */
  name: string;
  /** Optional logger; falls back to process.stdout when omitted */
  logger?: AgentLogger;
}

/** Minimal logger interface so agents remain decoupled from any specific logging library */
export interface AgentLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Outcome of a single agent execution.
 * Callers should check `success` before accessing `data`.
 */
export interface AgentResult<TOutput> {
  /** Whether the execution completed without throwing */
  success: boolean;
  /** Populated on success */
  data?: TOutput;
  /** Populated on failure */
  error?: Error;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
}

/**
 * Abstract base class for all SemkiEst agents.
 *
 * @typeParam TInput  - Shape of the input the agent accepts
 * @typeParam TOutput - Shape of the value returned on success
 */
export abstract class BaseAgent<TInput, TOutput> {
  protected readonly name: string;
  protected readonly logger: AgentLogger;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.logger = config.logger ?? defaultConsoleLogger(config.name);
  }

  /**
   * Run the agent with the given input.
   * Automatically wraps execution with timing and error handling.
   *
   * @param input - Agent-specific input payload
   * @returns Resolved {@link AgentResult} (never rejects)
   */
  async run(input: TInput): Promise<AgentResult<TOutput>> {
    const start = Date.now();
    this.logger.info('Agent started', { agent: this.name });
    try {
      const data = await this.execute(input);
      const durationMs = Date.now() - start;
      this.logger.info('Agent completed', { agent: this.name, durationMs });
      return { success: true, data, durationMs };
    } catch (err) {
      const durationMs = Date.now() - start;
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Agent failed', { agent: this.name, durationMs, error: error.message });
      return { success: false, error, durationMs };
    }
  }

  /**
   * Core agent logic — implemented by concrete subclasses.
   *
   * @param input - Agent-specific input payload
   * @returns The agent's output value on success (throw to signal failure)
   */
  protected abstract execute(input: TInput): Promise<TOutput>;
}

/** Fallback console-backed logger used when no logger is provided */
function defaultConsoleLogger(agentName: string): AgentLogger {
  const prefix = `[${agentName}]`;
  return {
    info: (message, meta) =>
      process.stdout.write(`${prefix} INFO  ${message}${formatMeta(meta)}\n`),
    warn: (message, meta) =>
      process.stdout.write(`${prefix} WARN  ${message}${formatMeta(meta)}\n`),
    error: (message, meta) =>
      process.stderr.write(`${prefix} ERROR ${message}${formatMeta(meta)}\n`),
  };
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  return ` ${JSON.stringify(meta)}`;
}
