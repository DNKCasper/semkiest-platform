/**
 * Core type definitions for the agent framework.
 */

/** Lifecycle states an agent can be in. */
export enum AgentState {
  /** Agent created but not yet running. */
  IDLE = 'IDLE',
  /** Agent is setting up resources. */
  INITIALIZING = 'INITIALIZING',
  /** Agent is actively executing. */
  RUNNING = 'RUNNING',
  /** Agent finished successfully. */
  COMPLETED = 'COMPLETED',
  /** Agent encountered an unrecoverable error. */
  FAILED = 'FAILED',
  /** Agent was cancelled before completion. */
  CANCELLED = 'CANCELLED',
}

/**
 * Defines the allowed state transitions for the agent state machine.
 * Terminal states (COMPLETED, FAILED, CANCELLED) have no outgoing transitions.
 */
export const VALID_TRANSITIONS: Readonly<Record<AgentState, readonly AgentState[]>> = {
  [AgentState.IDLE]: [AgentState.INITIALIZING, AgentState.CANCELLED],
  [AgentState.INITIALIZING]: [AgentState.RUNNING, AgentState.FAILED, AgentState.CANCELLED],
  [AgentState.RUNNING]: [AgentState.COMPLETED, AgentState.FAILED, AgentState.CANCELLED],
  [AgentState.COMPLETED]: [],
  [AgentState.FAILED]: [],
  [AgentState.CANCELLED]: [],
} as const;

/** Overall outcome status of an agent run. */
export type ResultStatus = 'pass' | 'fail' | 'warning' | 'skip';

/**
 * Final result produced by an agent after its lifecycle completes.
 * @template T The shape of the agent-specific result payload.
 */
export interface AgentResult<T = unknown> {
  /** Unique identifier of the agent that produced this result. */
  agentId: string;
  /** Overall outcome of the agent run. */
  status: ResultStatus;
  /** Agent-specific result payload (present on successful runs). */
  data?: T;
  /** Error encountered during the run (present on failed runs). */
  error?: Error;
  /** Timestamp when the agent started executing. */
  startedAt: Date;
  /** Timestamp when the agent finished executing. */
  completedAt: Date;
  /** Arbitrary key/value metadata attached to the result. */
  metadata?: Record<string, unknown>;
}

/** Incremental progress update emitted during agent execution. */
export interface ProgressUpdate {
  /** Unique identifier of the reporting agent. */
  agentId: string;
  /** Human-readable description of the current step. */
  message: string;
  /** Optional completion percentage (0–100). */
  progress?: number;
  /** Arbitrary key/value metadata for the update. */
  metadata?: Record<string, unknown>;
  /** Timestamp when the update was emitted. */
  timestamp: Date;
}

/** Structured error report emitted when an agent encounters an error. */
export interface ErrorReport {
  /** Unique identifier of the reporting agent. */
  agentId: string;
  /** The error that occurred. */
  error: Error;
  /** Additional context captured at the time of the error. */
  context?: Record<string, unknown>;
  /** Timestamp when the error was reported. */
  timestamp: Date;
}

/** Heartbeat snapshot used to monitor long-running agents externally. */
export interface HeartbeatInfo {
  /** Unique identifier of the agent sending the heartbeat. */
  agentId: string;
  /** Current lifecycle state of the agent. */
  state: AgentState;
  /** Timestamp of the most recent heartbeat. */
  lastHeartbeat: Date;
  /** Arbitrary key/value metadata included in the heartbeat. */
  metadata?: Record<string, unknown>;
}

/** Constructor options for {@link BaseAgent}. */
export interface AgentOptions {
  /**
   * How often (in milliseconds) the agent emits heartbeat signals.
   * @default 30000
   */
  heartbeatIntervalMs?: number;
}
