/**
 * Possible lifecycle states for an agent.
 */
export type AgentStatus =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

/**
 * Base configuration shared by all agent implementations.
 */
export interface AgentConfig {
  /** Unique identifier for this agent instance. Auto-generated if omitted. */
  id?: string;
  /** Human-readable name for the agent. */
  name: string;
  /** Maximum execution time in milliseconds before the agent is force-stopped. */
  timeout?: number;
}

/**
 * Standardised result returned by `BaseAgent.run()`.
 */
export interface AgentResult<T = unknown> {
  /** Whether the agent completed without a fatal error. */
  success: boolean;
  /** Typed payload produced by the agent. */
  data?: T;
  /** Error captured when `success` is false. */
  error?: Error;
  /** Wall-clock duration of the run in milliseconds. */
  duration: number;
}

/**
 * Events emitted by every agent.
 * Used to type-check EventEmitter calls and listeners.
 */
export interface AgentEvents {
  /** Fired whenever the agent transitions to a new lifecycle state. */
  status: [status: AgentStatus];
  /** Fired when the agent encounters a non-fatal error. */
  error: [error: Error];
  /** Generic progress/log message event. */
  log: [message: string];
}
