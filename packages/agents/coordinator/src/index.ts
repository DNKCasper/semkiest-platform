/**
 * @semkiest/coordinator — Coordinator Agent package.
 *
 * Public API surface for orchestrating multi-agent test runs.
 */

// Core types
export type {
  AgentType,
  ExecutionPhase,
  FailureStrategy,
  AgentConfig,
  PhaseConfig,
  TestRunPlan,
  AgentRunStatus,
  AgentRunResult,
  CoordinatorResult,
  TestRunSummary,
  ExecutionContext,
  AgentExecutionResult,
} from './types';

// Plan builder
export { PlanBuilder } from './plan-builder';
export type { TestProfile } from './plan-builder';

// Coordinator agent
export { CoordinatorAgent } from './coordinator-agent';
export type { EventBus, Logger } from './coordinator-agent';

// Agent executors
export { LocalAgentExecutor, QueueAgentExecutor } from './agent-executor';
export type { AgentExecutor } from './agent-executor';
