/**
 * Configuration for creating a BaseAgent instance.
 */
export interface AgentConfig {
  /** Human-readable agent name */
  name: string;
  /** Semantic version string (defaults to '1.0.0') */
  version?: string;
}

/**
 * Abstract base class for all SemkiEst agents.
 *
 * Concrete agents extend this class and implement the `execute` method
 * with their specific input/output types.
 *
 * @template TInput  - The agent's accepted input type
 * @template TOutput - The agent's produced output type
 */
export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  protected readonly name: string;
  protected readonly version: string;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.version = config.version ?? '1.0.0';
  }

  /**
   * Execute the agent with the given input and return a result.
   */
  abstract execute(input: TInput): Promise<TOutput>;

  /** Returns the agent's registered name. */
  getName(): string {
    return this.name;
  }

  /** Returns the agent's semantic version. */
  getVersion(): string {
    return this.version;
  }
}
