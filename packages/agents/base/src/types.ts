/**
 * Core types for the BaseAgent framework.
 */

/** Base configuration for all agents */
export interface AgentConfig {
  /** Unique identifier for this agent instance */
  id: string;
  /** Human-readable agent name */
  name: string;
  /** Maximum execution time in milliseconds (default: 60000) */
  timeout?: number;
}

/** Structured result returned by every agent execution */
export interface AgentResult<TData = unknown> {
  /** Whether the execution completed successfully */
  success: boolean;
  /** Payload produced by the agent */
  data?: TData;
  /** Human-readable error message when success is false */
  error?: string;
  /** Wall-clock duration in milliseconds */
  duration: number;
  /** Arbitrary additional metadata */
  metadata?: Record<string, unknown>;
}

/** Severity levels for agent log entries */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single structured log entry emitted during agent execution */
export interface AgentLogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/** Lifecycle events emitted by BaseAgent */
export type AgentEvent =
  | { type: 'start'; agentId: string; agentName: string }
  | { type: 'end'; agentId: string; result: AgentResult }
  | { type: 'log'; agentId: string; entry: AgentLogEntry }
  | { type: 'error'; agentId: string; error: Error };
