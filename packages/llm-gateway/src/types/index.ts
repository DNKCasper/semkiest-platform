/**
 * Core types for the LLM Gateway service.
 */

/** Supported LLM provider identifiers */
export type ProviderName = 'claude' | 'openai' | 'gemini' | 'ollama';

/** Supported model role for conversation messages */
export type MessageRole = 'system' | 'user' | 'assistant';

/** A single message in a conversation */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Attribution context for cost tracking.
 * At least one of organizationId, projectId, or agentType must be provided.
 */
export interface CostAttribution {
  /** Organization responsible for the cost */
  organizationId: string;
  /** Project the request belongs to */
  projectId?: string;
  /** Agent type making the request (e.g. "test-generator", "code-reviewer") */
  agentType?: string;
}

/** Optional template reference for request tracing */
export interface TemplateRef {
  id: string;
  version: string;
}

/** Parameters for controlling LLM generation */
export interface GenerationParams {
  /** Maximum tokens to generate. Defaults to provider maximum. */
  maxTokens?: number;
  /** Sampling temperature (0–2). Lower = more deterministic. */
  temperature?: number;
  /** Top-p nucleus sampling (0–1). */
  topP?: number;
  /** Stop sequences to end generation */
  stopSequences?: string[];
}

/** A complete request to the LLM gateway */
export interface LLMRequest {
  /** Unique request identifier (auto-generated if not provided) */
  requestId?: string;
  /** Messages forming the conversation */
  messages: Message[];
  /** System prompt (alternative to including a system message) */
  systemPrompt?: string;
  /** Explicit provider override. Falls back to factory default if omitted. */
  provider?: ProviderName;
  /** Explicit model override. Falls back to provider default if omitted. */
  model?: string;
  /** Generation parameters */
  params?: GenerationParams;
  /** Cost attribution context */
  attribution: CostAttribution;
  /** Template reference for traceability */
  templateRef?: TemplateRef;
  /** Arbitrary metadata attached to the request */
  metadata?: Record<string, unknown>;
}

/** Token usage reported by the provider */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Calculated cost for a completed request */
export interface CostBreakdown {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
}

/** Reason the model stopped generating */
export type FinishReason = 'stop' | 'length' | 'content_filter' | 'error' | 'unknown';

/** A completed response from the LLM gateway */
export interface LLMResponse {
  /** Echoes the request ID */
  requestId: string;
  /** Generated text content */
  content: string;
  /** Provider that served the request */
  provider: ProviderName;
  /** Model used for generation */
  model: string;
  /** Token usage statistics */
  usage: TokenUsage;
  /** Cost breakdown */
  cost: CostBreakdown;
  /** Why generation stopped */
  finishReason: FinishReason;
  /** Wall-clock latency in milliseconds */
  latencyMs: number;
  /** Timestamp of the response */
  timestamp: Date;
}

/** Pricing table entry for a model */
export interface ModelPricing {
  /** Cost per 1,000 input tokens in USD */
  inputCostPer1kTokens: number;
  /** Cost per 1,000 output tokens in USD */
  outputCostPer1kTokens: number;
}

/** Per-provider, per-model pricing configuration */
export type PricingTable = Record<ProviderName, Record<string, ModelPricing>>;

/** Default pricing table (USD per 1k tokens) */
export const DEFAULT_PRICING_TABLE: PricingTable = {
  claude: {
    'claude-opus-4-5': { inputCostPer1kTokens: 0.015, outputCostPer1kTokens: 0.075 },
    'claude-sonnet-4-5': { inputCostPer1kTokens: 0.003, outputCostPer1kTokens: 0.015 },
    'claude-haiku-4-5-20251001': { inputCostPer1kTokens: 0.0008, outputCostPer1kTokens: 0.004 },
    // Fallback for unknown Claude models
    default: { inputCostPer1kTokens: 0.003, outputCostPer1kTokens: 0.015 },
  },
  openai: {
    'gpt-4o': { inputCostPer1kTokens: 0.005, outputCostPer1kTokens: 0.015 },
    'gpt-4o-mini': { inputCostPer1kTokens: 0.00015, outputCostPer1kTokens: 0.0006 },
    'gpt-4-turbo': { inputCostPer1kTokens: 0.01, outputCostPer1kTokens: 0.03 },
    default: { inputCostPer1kTokens: 0.005, outputCostPer1kTokens: 0.015 },
  },
  gemini: {
    'gemini-1.5-pro': { inputCostPer1kTokens: 0.00125, outputCostPer1kTokens: 0.005 },
    'gemini-1.5-flash': { inputCostPer1kTokens: 0.000075, outputCostPer1kTokens: 0.0003 },
    default: { inputCostPer1kTokens: 0.00125, outputCostPer1kTokens: 0.005 },
  },
  ollama: {
    // Local models have no API cost
    default: { inputCostPer1kTokens: 0, outputCostPer1kTokens: 0 },
  },
};

/**
 * Calculates cost for a completed request.
 */
export function calculateCost(
  provider: ProviderName,
  model: string,
  usage: TokenUsage,
  pricingTable: PricingTable = DEFAULT_PRICING_TABLE,
): CostBreakdown {
  const providerPricing = pricingTable[provider] ?? pricingTable.claude;
  const pricing = providerPricing[model] ?? providerPricing['default'];

  if (!pricing) {
    return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 };
  }

  const inputCostUsd = (usage.inputTokens / 1000) * pricing.inputCostPer1kTokens;
  const outputCostUsd = (usage.outputTokens / 1000) * pricing.outputCostPer1kTokens;

  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}

/** Gateway-level error */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: ProviderName,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/** Rate limit exceeded error */
export class RateLimitError extends GatewayError {
  constructor(
    public readonly organizationId: string,
    public readonly currentUsage: number,
    public readonly limit: number,
  ) {
    super(
      `Organization ${organizationId} has exceeded monthly token budget (${currentUsage}/${limit})`,
      'RATE_LIMIT_EXCEEDED',
    );
    this.name = 'RateLimitError';
  }
}
