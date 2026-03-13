import type { LLMRequest, LLMResponse, ProviderName } from '../types/index.js';

/** Health check result for a provider */
export interface ProviderHealthStatus {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Contract that all LLM provider adapters must fulfil.
 *
 * Implementations are responsible for:
 * - Translating the gateway's unified request format into the provider's native API
 * - Translating the provider's native response into a unified `LLMResponse`
 * - Populating `usage` (token counts) and `finishReason`
 */
export interface ILLMProvider {
  /** Unique identifier for this provider */
  readonly name: ProviderName;

  /** Default model to use when none is specified in the request */
  readonly defaultModel: string;

  /**
   * Send a completion request and return the full response.
   *
   * @param request - Unified gateway request
   * @returns Resolved response with usage statistics
   * @throws {GatewayError} on provider-level failures
   */
  complete(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Check if the provider is reachable and healthy.
   * Used by the factory during fallback evaluation.
   */
  healthCheck(): Promise<ProviderHealthStatus>;
}

/** Configuration for a registered provider */
export interface ProviderRegistration {
  provider: ILLMProvider;
  /** Priority when multiple providers are available (lower = higher priority) */
  priority: number;
}
