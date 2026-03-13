/**
 * @semkiest/cross-browser-agent
 *
 * Public API for the Cross-Browser Testing Agent (SEM-76).
 *
 * Exports:
 * - CrossBrowserAgent: main agent class
 * - BaseAgent: abstract base (local implementation of SEM-50)
 * - BrowserMatrix helpers and constants
 * - ParallelExecutor for custom task scheduling
 * - All relevant TypeScript types
 */

export { CrossBrowserAgent } from './cross-browser-agent';
export type {
  CrossBrowserAgentConfig,
  CrossBrowserInput,
  CrossBrowserOutput,
  CrossBrowserSummary,
  BrowserTestResult,
  TestCase,
  TestStep,
} from './cross-browser-agent';

export { BaseAgent } from './base-agent';
export type { AgentConfig, AgentLogger, AgentResult } from './base-agent';

export {
  DEFAULT_BROWSER_MATRIX,
  DEFAULT_VIEWPORTS,
  getEnabledBrowsers,
  createBrowserMatrix,
} from './browser-matrix';
export type {
  BrowserName,
  BrowserConfig,
  BrowserMatrix,
  ViewportConfig,
} from './browser-matrix';

export { ParallelExecutor } from './parallel-executor';
export type { ExecutionTask, ExecutionResult } from './parallel-executor';
