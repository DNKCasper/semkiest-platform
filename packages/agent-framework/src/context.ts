/**
 * Agent context definition.
 *
 * The AgentContext is injected into every agent at construction time and
 * provides access to all shared services required during execution.
 */

/** Static configuration for the project under test. */
export interface ProjectConfig {
  /** Unique project identifier. */
  projectId: string;
  /** Human-readable project name. */
  name: string;
  /** Optional base URL for the application being tested. */
  baseUrl?: string;
  /** Arbitrary additional project metadata. */
  metadata?: Record<string, unknown>;
}

/** Settings that describe how tests should be executed. */
export interface TestProfile {
  /** Unique test profile identifier. */
  profileId: string;
  /** Human-readable profile name. */
  name: string;
  /** Profile-specific configuration values (browser, viewport, auth, etc.). */
  settings: Record<string, unknown>;
}

/**
 * Thin abstraction over any LLM provider.
 * Agents use this to request completions without coupling to a specific SDK.
 */
export interface LLMClient {
  /**
   * Request a text completion from the language model.
   * @param prompt The input prompt.
   * @param options Provider-specific options (temperature, max tokens, etc.).
   */
  complete(prompt: string, options?: Record<string, unknown>): Promise<string>;
}

/**
 * Key/value storage abstraction used by agents to persist intermediate data.
 */
export interface StorageClient {
  /** Retrieve a stored value by key. Returns `undefined` if not found. */
  get(key: string): Promise<unknown>;
  /** Persist a value under the given key. */
  set(key: string, value: unknown): Promise<void>;
  /** Remove a stored value by key. */
  delete(key: string): Promise<void>;
}

/** Structured logger interface available to all agents. */
export interface Logger {
  /** Log a debug-level message. */
  debug(message: string, meta?: Record<string, unknown>): void;
  /** Log an info-level message. */
  info(message: string, meta?: Record<string, unknown>): void;
  /** Log a warning-level message. */
  warn(message: string, meta?: Record<string, unknown>): void;
  /** Log an error-level message. */
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * All services and configuration available to an agent during its lifecycle.
 *
 * An AgentContext is created once per agent run and passed to the agent
 * constructor. It provides a stable surface for accessing shared infrastructure
 * without hard-coding dependencies inside individual agent implementations.
 */
export interface AgentContext {
  /** Static project configuration. */
  projectConfig: ProjectConfig;
  /** Active test profile settings. */
  testProfile: TestProfile;
  /** LLM client for AI-assisted operations. */
  llmClient: LLMClient;
  /** Storage client for persisting intermediate results. */
  storageClient: StorageClient;
  /** Logger for structured output during execution. */
  logger: Logger;
}
