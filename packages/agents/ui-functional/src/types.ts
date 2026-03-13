/**
 * Domain types for the UI/Functional Testing Agent.
 */

// ─── Viewport ─────────────────────────────────────────────────────────────────

/** Browser viewport dimensions */
export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
}

// ─── Test steps ───────────────────────────────────────────────────────────────

/** Click on a CSS selector */
export interface ClickStep {
  type: 'click';
  selector: string;
  /** Optional wait condition after clicking */
  waitAfter?: WaitCondition;
}

/** Navigate to a URL */
export interface NavigationStep {
  type: 'navigate';
  url: string;
  /** Wait strategy after navigation (default: 'load') */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
}

/** Fill and optionally submit a form */
export interface FormSubmitStep {
  type: 'form_submit';
  /** Map of selector → value to fill in */
  fields: Record<string, string>;
  /** Selector of the submit button or form element to submit */
  submitSelector?: string;
  waitAfter?: WaitCondition;
}

/** Assert something about the current page state */
export interface AssertionStep {
  type: 'assertion';
  assertion: Assertion;
}

/** Explicit wait step */
export interface WaitStep {
  type: 'wait';
  condition: WaitCondition;
}

/** All possible step types */
export type TestStep =
  | ClickStep
  | NavigationStep
  | FormSubmitStep
  | AssertionStep
  | WaitStep;

// ─── Wait conditions ──────────────────────────────────────────────────────────

export interface WaitForSelectorCondition {
  kind: 'selector';
  selector: string;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
  timeout?: number;
}

export interface WaitForNavigationCondition {
  kind: 'navigation';
  url?: string | RegExp;
  timeout?: number;
}

export interface WaitForNetworkIdleCondition {
  kind: 'network_idle';
  /** Milliseconds of network inactivity required (default: 500) */
  idleMs?: number;
  timeout?: number;
}

export interface WaitForTimeoutCondition {
  kind: 'timeout';
  ms: number;
}

export type WaitCondition =
  | WaitForSelectorCondition
  | WaitForNavigationCondition
  | WaitForNetworkIdleCondition
  | WaitForTimeoutCondition;

// ─── Assertions ───────────────────────────────────────────────────────────────

export interface ElementVisibleAssertion {
  kind: 'element_visible';
  selector: string;
  /** If true, asserts the element is NOT visible */
  negate?: boolean;
}

export interface TextContentAssertion {
  kind: 'text_content';
  selector: string;
  expected: string | RegExp;
  /** If true, uses string containment instead of exact equality */
  contains?: boolean;
}

export interface UrlAssertion {
  kind: 'url';
  expected: string | RegExp;
  /** If true, uses string containment instead of exact equality */
  contains?: boolean;
}

export interface HttpResponseAssertion {
  kind: 'http_response';
  urlPattern: string | RegExp;
  expectedStatus?: number;
  expectedBodyContains?: string;
}

export type Assertion =
  | ElementVisibleAssertion
  | TextContentAssertion
  | UrlAssertion
  | HttpResponseAssertion;

// ─── Test case ────────────────────────────────────────────────────────────────

/** A single UI test case composed of ordered steps */
export interface UITestCase {
  /** Unique test identifier */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Ordered list of steps to execute */
  steps: TestStep[];
  /** Browser viewport for this test (overrides agent-level config) */
  viewport?: ViewportConfig;
  /** Optional tags for filtering/reporting */
  tags?: string[];
}

// ─── Results ──────────────────────────────────────────────────────────────────

export type TestStatus = 'pass' | 'fail' | 'warning' | 'skip';

/** Result of executing a single step */
export interface StepResult {
  stepIndex: number;
  stepType: TestStep['type'];
  status: TestStatus;
  message?: string;
  duration: number;
  /** Base64-encoded PNG screenshot taken on failure */
  screenshotBase64?: string;
}

/** Captured network log entry */
export interface NetworkLog {
  url: string;
  method: string;
  status: number;
  timestamp: Date;
}

/** Result of executing a single UITestCase */
export interface UITestResult {
  testId: string;
  testName: string;
  status: TestStatus;
  steps: StepResult[];
  duration: number;
  /** Console errors captured during test */
  consoleErrors: string[];
  /** Network requests captured during test */
  networkLogs: NetworkLog[];
}

// ─── Agent input / output ─────────────────────────────────────────────────────

/** Input consumed by UIFunctionalAgent.run() */
export interface UIAgentInput {
  tests: UITestCase[];
  /** Default viewport used when a test case doesn't specify one */
  defaultViewport?: ViewportConfig;
  /** Base URL prepended to relative navigation URLs */
  baseUrl?: string;
}

/** Aggregate output produced by UIFunctionalAgent */
export interface UIAgentOutput {
  results: UITestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
  };
}

// ─── Agent config ─────────────────────────────────────────────────────────────

import type { AgentConfig } from '@semkiest/agent-base';

/** Configuration for UIFunctionalAgent */
export interface UIAgentConfig extends AgentConfig {
  /** Default browser viewport dimensions */
  defaultViewport?: ViewportConfig;
  /** Whether to run the browser in headless mode (default: true) */
  headless?: boolean;
  /** Base URL prepended to relative navigation URLs */
  baseUrl?: string;
  /** Per-test-case timeout override in milliseconds */
  testTimeout?: number;
}
