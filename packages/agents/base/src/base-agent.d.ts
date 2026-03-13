import type { AgentConfig, AgentLogger, AgentResult, AgentStatus } from './types.js';
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
export declare abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
    protected readonly name: string;
    protected readonly logger: AgentLogger;
    private _status;
    constructor(config: AgentConfig);
    /**
     * Core agent logic implemented by subclasses.
     * Called by `run()` after `initialize()` completes.
     */
    abstract execute(input: TInput): Promise<TOutput>;
    /**
     * Orchestrates the full agent lifecycle: initialize → execute → cleanup.
     * Always returns an `AgentResult`; never throws.
     */
    run(input: TInput): Promise<AgentResult<TOutput>>;
    /** Override to run setup before execute(). */
    protected initialize(): Promise<void>;
    /** Override to run teardown after execute() (called in finally block). */
    protected cleanup(): Promise<void>;
    /** Current lifecycle status of the agent. */
    get status(): AgentStatus;
    private safeCleanup;
}
//# sourceMappingURL=base-agent.d.ts.map