/**
 * Agent lifecycle status.
 */
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
/**
 * Log level for agent output.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Configuration passed to BaseAgent constructor.
 */
export interface AgentConfig {
    /** Human-readable name used in logs and results. */
    name: string;
    /** Minimum log level to emit. Defaults to 'info'. */
    logLevel?: LogLevel;
}
/**
 * Structured logger interface for agents.
 */
export interface AgentLogger {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}
/**
 * Result returned by BaseAgent.run().
 */
export interface AgentResult<TOutput = unknown> {
    /** Whether the agent completed without throwing. */
    success: boolean;
    /** Output produced by execute(), only present on success. */
    data?: TOutput;
    /** Error message, only present on failure. */
    error?: string;
    /** Wall-clock duration in milliseconds. */
    duration: number;
    /** Name of the agent that produced this result. */
    agentName: string;
}
//# sourceMappingURL=types.d.ts.map