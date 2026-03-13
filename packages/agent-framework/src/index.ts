/**
 * @semkiest/agent-framework
 *
 * Foundational agent framework providing:
 * - {@link BaseAgent} – abstract base class all agents must extend
 * - {@link AgentStateMachine} – lifecycle state machine (IDLE → … → COMPLETED/FAILED/CANCELLED)
 * - {@link AgentContext} – shared services injected into every agent
 * - Full TypeScript types for results, progress, errors, and heartbeats
 *
 * @example
 * ```ts
 * import { BaseAgent, AgentContext, AgentState } from '@semkiest/agent-framework';
 *
 * class MyAgent extends BaseAgent<{ count: number }> {
 *   protected async initialize() { ... }
 *   protected async execute() {
 *     this.reportProgress('Working…', 50);
 *     this.reportResult('pass', { count: 42 });
 *   }
 *   protected async cleanup() { ... }
 *   protected async onError(err: Error) { ... }
 * }
 * ```
 */

export { BaseAgent } from './base-agent';
export { AgentStateMachine, InvalidTransitionError } from './state-machine';
export type { AgentContext, LLMClient, Logger, ProjectConfig, StorageClient, TestProfile } from './context';
export {
  AgentState,
  VALID_TRANSITIONS,
} from './types';
export type {
  AgentOptions,
  AgentResult,
  ErrorReport,
  HeartbeatInfo,
  ProgressUpdate,
  ResultStatus,
} from './types';
