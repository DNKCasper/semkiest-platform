/**
 * Type definitions for the Coordinator Agent.
 *
 * Defines the core types for test run orchestration, agent configuration,
 * execution phases, and failure strategies.
 */

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

/**
 * All agent types that the coordinator knows about and can orchestrate.
 */
export type AgentType =
  | 'explorer'
  | 'spec-reader'
  | 'ui-functional'
  | 'visual-regression'
  | 'accessibility'
  | 'cross-browser'
  | 'load'
  | 'security'
  | 'data-generator'
  | 'performance'
  | 'api';

// ---------------------------------------------------------------------------
// Execution phases
// ---------------------------------------------------------------------------

/**
 * Logical phases of a test run. Coordinator runs these in order:
 * discovery → generation → testing → reporting
 */
export type ExecutionPhase = 'discovery' | 'generation' | 'testing' | 'reporting';

// ---------------------------------------------------------------------------
// Failure strategies
// ---------------------------------------------------------------------------

/**
 * Strategy for handling agent failures during execution.
 *
 * - `fail-fast`: Stop all remaining agents immediately on first failure.
 * - `continue-on-error`: Run all agents regardless of failures, record errors.
 * - `retry-then-continue`: Retry failed agents up to `retries` count, then continue.
 */
export type FailureStrategy = 'fail-fast' | 'continue-on-error' | 'retry-then-continue';

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for a single agent within a test run plan.
 */
export interface AgentConfig {
  /** Type of agent to run. */
  type: AgentType;
  /** Whether this agent is enabled for the test run. */
  enabled: boolean;
  /** Execution priority (higher = earlier). Defaults to 50. */
  priority: number;
  /** Timeout in milliseconds for this agent. Defaults to 300000 (5 minutes). */
  timeout: number;
  /** Number of retries on failure. Defaults to 0. */
  retries: number;
  /** Agent-specific settings and configuration options. */
  settings: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Phase configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for a specific execution phase.
 */
export interface PhaseConfig {
  /** The phase being configured. */
  phase: ExecutionPhase;
  /** Agent types to run in this phase. */
  agents: AgentType[];
  /** Whether agents should run in parallel (true) or sequentially (false). */
  parallel: boolean;
  /** Optional timeout override for this phase (in milliseconds). */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Test run plan
// ---------------------------------------------------------------------------

/**
 * Complete orchestration plan for a test run.
 *
 * Specifies which agents to run, in what phases, with what configuration,
 * and how to handle failures.
 */
export interface TestRunPlan {
  /** Unique identifier for this test run. */
  testRunId: string;
  /** Project ID being tested. */
  projectId: string;
  /** Correlation ID for tracing across the system. */
  correlationId: string;
  /** Base URL of the application under test. */
  baseUrl: string;
  /** Phase configurations, in execution order. */
  phases: PhaseConfig[];
  /** Strategy for handling agent failures. */
  failureStrategy: FailureStrategy;
  /** Global timeout for the entire test run (in milliseconds). */
  globalTimeout: number;
  /** All agent configurations. */
  agents: AgentConfig[];
}

// ---------------------------------------------------------------------------
// Agent run status
// ---------------------------------------------------------------------------

/**
 * Tracking information for a single agent's execution within a test run.
 */
export interface AgentRunStatus {
  /** Type of agent. */
  agentType: AgentType;
  /** Unique identifier for this agent instance. */
  agentId: string;
  /** Phase this agent is running in. */
  phase: ExecutionPhase;
  /** Current status of the agent. */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  /** ISO timestamp of when the agent started (if applicable). */
  startedAt?: Date;
  /** ISO timestamp of when the agent completed (if applicable). */
  completedAt?: Date;
  /** Result data from the agent (if completed successfully). */
  result?: AgentRunResult;
  /** Error information (if failed). */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  /** Number of times this agent has been retried. */
  retryCount: number;
}

/**
 * Result payload from a single agent execution.
 */
export interface AgentRunResult {
  /** Overall status of the agent run. */
  status: 'pass' | 'fail' | 'warning' | 'skip';
  /** Paths or URLs of evidence artifacts (screenshots, logs, etc). */
  evidence?: string[];
  /** Error message (if status is 'fail'). */
  error?: string;
  /** Execution duration in milliseconds. */
  durationMs: number;
  /** Agent-specific result data. */
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Coordinator result
// ---------------------------------------------------------------------------

/**
 * Summary statistics from a test run.
 */
export interface TestRunSummary {
  /** Total number of agents that ran. */
  total: number;
  /** Number of agents that passed. */
  passed: number;
  /** Number of agents that failed. */
  failed: number;
  /** Number of agents that had warnings. */
  warnings: number;
  /** Number of agents that were skipped. */
  skipped: number;
  /** Total duration in milliseconds. */
  duration: number;
  /** Pass rate as a percentage (0–100). */
  passRate: number;
}

/**
 * Final result returned by the Coordinator Agent after orchestrating
 * a complete test run.
 */
export interface CoordinatorResult {
  /** Unique identifier for this test run. */
  testRunId: string;
  /** Project ID that was tested. */
  projectId: string;
  /** Phase configurations that were executed. */
  phases: PhaseConfig[];
  /** Run status for each agent that executed. */
  agentResults: AgentRunStatus[];
  /** Summary statistics. */
  summary: TestRunSummary;
  /** Optional URL to the generated test report. */
  reportUrl?: string;
}

// ---------------------------------------------------------------------------
// Execution context (for agent executors)
// ---------------------------------------------------------------------------

/**
 * Context provided to agent executors when running agents.
 */
export interface ExecutionContext {
  /** Test run ID. */
  testRunId: string;
  /** Project ID. */
  projectId: string;
  /** Base URL of the application under test. */
  baseUrl: string;
  /** Correlation ID for tracing. */
  correlationId: string;
  /** Timeout in milliseconds for this execution. */
  timeout: number;
}

/**
 * Result returned from executing a single agent.
 */
export interface AgentExecutionResult {
  /** Overall status of the execution. */
  status: 'pass' | 'fail' | 'warning' | 'skip';
  /** Evidence artifacts produced by the agent. */
  evidence?: string[];
  /** Error message (if status is 'fail'). */
  error?: string;
  /** Duration of the execution in milliseconds. */
  durationMs: number;
  /** Agent-specific result data. */
  data?: unknown;
}
