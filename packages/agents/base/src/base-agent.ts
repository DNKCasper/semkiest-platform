/**
 * BaseAgent — abstract foundation for all SemkiEst agents.
 *
 * Every concrete agent must:
 * 1. Call `super(config)` in its constructor.
 * 2. Implement `onInitialize()` to set up internal state / connections.
 * 3. Implement `execute()` to perform the agent's primary action.
 */

/** Configuration provided to every agent at construction time. */
export interface AgentConfig {
  /** Human-readable agent name used in logs and metadata. */
  name: string;
  /** SemVer string for the agent implementation. */
  version: string;
  /** Optional one-line description of what the agent does. */
  description?: string;
}

/** Execution context passed to `execute()` on each invocation. */
export interface AgentContext {
  /** The project this invocation belongs to. */
  projectId: string;
  /** Optional session identifier for correlating multiple invocations. */
  sessionId?: string;
  /** Arbitrary caller-provided metadata. */
  metadata?: Record<string, unknown>;
}

/** Standardised envelope returned by every agent execution. */
export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** ISO-8601 timestamp of when the result was produced. */
  timestamp: Date;
}

/**
 * Abstract base class for all SemkiEst agents.
 *
 * Lifecycle:
 * ```
 * const agent = new MyAgent(config);
 * await agent.initialize();            // one-time setup
 * const result = await agent.execute(ctx, input);
 * ```
 */
export abstract class BaseAgent {
  protected readonly name: string;
  protected readonly version: string;
  protected readonly description: string;

  private _initialized = false;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.version = config.version;
    this.description = config.description ?? '';
  }

  /**
   * Initialise the agent. Must be called once before `execute()`.
   * Internally delegates to `onInitialize()` for subclass-specific logic.
   */
  async initialize(): Promise<void> {
    await this.onInitialize();
    this._initialized = true;
  }

  /** Subclass-specific initialisation logic. */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Execute the agent's primary action.
   *
   * @param context - Execution context (project, session, …).
   * @param input   - Optional agent-specific input payload.
   */
  abstract execute<T>(context: AgentContext, input?: unknown): Promise<AgentResult<T>>;

  /** Returns `true` after `initialize()` has completed successfully. */
  isInitialized(): boolean {
    return this._initialized;
  }

  getName(): string {
    return this.name;
  }

  getVersion(): string {
    return this.version;
  }

  getDescription(): string {
    return this.description;
  }

  /** Helper for subclasses to build a successful result. */
  protected success<T>(data: T): AgentResult<T> {
    return { success: true, data, timestamp: new Date() };
  }

  /** Helper for subclasses to build a failed result. */
  protected failure<T>(error: string): AgentResult<T> {
    return { success: false, error, timestamp: new Date() };
  }
}
