/**
 * Defines the interface for agent tool capabilities, result types, and error handling.
 */

/** Describes a single parameter accepted by a Tool. */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required: boolean;
}

/** Core tool interface that all agent tools must implement. */
export interface Tool<TParams = Record<string, unknown>, TResult = unknown> {
  /** Unique tool identifier */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Schema for the parameters accepted by this tool */
  parameters: ToolParameter[];
  /** Execute the tool with the given parameters */
  execute(params: TParams): Promise<ToolResult<TResult>>;
}

/** Result returned by a tool execution. */
export interface ToolResult<T = unknown> {
  success: boolean;
  output: T;
  metadata?: ToolResultMetadata;
  error?: ToolError;
}

/** Additional metadata attached to a tool result. */
export interface ToolResultMetadata {
  /** Execution duration in milliseconds */
  duration: number;
  /** When the tool execution completed */
  timestamp: Date;
  /** Self-healing events recorded during element finding */
  healingEvents?: HealingEvent[];
  [key: string]: unknown;
}

/** Structured error from a tool execution. */
export interface ToolError {
  code: string;
  message: string;
  details?: unknown;
}

/** Records a single self-healing fallback attempt. */
export interface HealingEvent {
  /** The original selector that failed */
  originalSelector: string;
  /** Which fallback strategy was used */
  fallbackStrategy: 'css' | 'text-content' | 'aria-label' | 'visual-context';
  /** The selector or locator expression that succeeded */
  resolvedSelector: string;
  /** When the healing event occurred */
  timestamp: Date;
}

/** Parameters for navigateTo tool */
export interface NavigateToParams {
  url: string;
}

/** Parameters for click tool */
export interface ClickParams {
  selector: string;
}

/** Parameters for type tool */
export interface TypeParams {
  selector: string;
  text: string;
}

/** Parameters for waitForSelector tool */
export interface WaitForSelectorParams {
  selector: string;
  timeout?: number;
}

/** Parameters for evaluateJS tool */
export interface EvaluateJSParams {
  script: string;
}

/** Screenshot tool produces a base64-encoded PNG string */
export type ScreenshotOutput = string;

/** Page content tool returns the visible text of the page */
export type PageContentOutput = string;
