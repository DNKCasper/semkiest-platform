/**
 * Core types and interfaces for the LLM Gateway.
 * Provides a provider-agnostic abstraction over multiple LLM providers.
 */

/** Supported LLM provider identifiers. */
export enum LLMProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
}

/** Supported Anthropic (Claude) models. */
export type AnthropicModel =
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-haiku-20240307'
  | 'claude-3-opus-20240229';

/** Supported OpenAI models. */
export type OpenAIModel = 'gpt-4o' | 'gpt-4-turbo' | 'gpt-3.5-turbo';

/** Union of all supported model identifiers. */
export type LLMModel = AnthropicModel | OpenAIModel;

/** Roles for chat messages. */
export type MessageRole = 'user' | 'assistant' | 'system';

/** A single message in a conversation. */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/** Token usage and estimated cost for a single LLM call. */
export interface TokenUsage {
  /** Number of tokens in the input/prompt. */
  inputTokens: number;
  /** Number of tokens in the output/completion. */
  outputTokens: number;
  /** Total tokens consumed. */
  totalTokens: number;
  /** Estimated cost in USD, if calculable. */
  estimatedCostUsd?: number;
}

/**
 * Attribution metadata attached to LLM requests.
 * Used for cost tracking per project, agent type, and run.
 */
export interface RequestMetadata {
  projectId?: string;
  agentId?: string;
  agentType?: string;
  runId?: string;
}

/** Input for an LLM completion request. */
export interface LLMRequest {
  /** Conversation messages to send. */
  messages: LLMMessage[];
  /** Model to use. Falls back to provider default if omitted. */
  model?: LLMModel;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** Optional system prompt (alternative to including a system message). */
  systemPrompt?: string;
  /** Attribution metadata for cost tracking. */
  metadata?: RequestMetadata;
}

/** Result from an LLM completion request. */
export interface LLMResponse {
  /** The generated text content. */
  content: string;
  /** The actual model used (may differ from requested model). */
  model: string;
  /** Provider that served this response. */
  provider: LLMProvider;
  /** Token usage for billing and tracking. */
  usage: TokenUsage;
  /** Reason the generation stopped. */
  finishReason: 'stop' | 'max_tokens' | 'error' | string;
  /** Attribution metadata echoed from the request. */
  metadata?: RequestMetadata;
}

/** Configuration for a single provider instance. */
export interface ProviderConfig {
  /** Which provider this config targets. */
  provider: LLMProvider;
  /** API key for authentication. */
  apiKey: string;
  /** Default model to use when no model is specified in the request. */
  defaultModel?: LLMModel;
  /** Custom base URL (for proxies or self-hosted models). */
  baseURL?: string;
  /** Maximum number of retries on transient errors. Default: 2. */
  maxRetries?: number;
  /** Request timeout in milliseconds. Default: 30000. */
  timeoutMs?: number;
}

/**
 * Per-agent model configuration.
 * Allows different agent types to use different providers and models.
 */
export interface AgentModelConfig {
  /** Identifier for the agent type (e.g., "reasoning", "summarizer"). */
  agentType: string;
  /** Primary provider to use. */
  primaryProvider: LLMProvider;
  /** Primary model to use. */
  primaryModel: LLMModel;
  /** Fallback provider if the primary fails. */
  fallbackProvider?: LLMProvider;
  /** Fallback model to use with the fallback provider. */
  fallbackModel?: LLMModel;
}

/** Health status for a provider at a point in time. */
export interface HealthStatus {
  provider: LLMProvider;
  healthy: boolean;
  /** Round-trip latency in milliseconds, if measured. */
  latencyMs?: number;
  /** Error message if unhealthy. */
  error?: string;
  checkedAt: Date;
}

/** Configuration for the circuit breaker. */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before the circuit opens. Default: 5. */
  failureThreshold: number;
  /** Milliseconds to wait before attempting a reset (OPEN → HALF_OPEN). Default: 60000. */
  resetTimeoutMs: number;
  /** Consecutive successes in HALF_OPEN state before fully closing. Default: 2. */
  successThreshold: number;
}

/** Configuration for the LLM Gateway. */
export interface GatewayConfig {
  /** Provider configurations keyed by LLMProvider. */
  providers: Partial<Record<LLMProvider, ProviderConfig>>;
  /** Per-agent model configurations. */
  agentConfigs?: AgentModelConfig[];
  /** Default provider to use when no agent config matches. */
  defaultProvider?: LLMProvider;
  /** Default model to use when no agent config matches. */
  defaultModel?: LLMModel;
  /** Circuit breaker configuration. */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Interval in milliseconds between health checks. Default: 60000. */
  healthCheckIntervalMs?: number;
}

/** Aggregated token usage record for attribution reporting. */
export interface UsageRecord {
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  projectId?: string;
  agentId?: string;
  agentType?: string;
  runId?: string;
  timestamp: Date;
}
