import {
  HealthStatus,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from '../types';

/**
 * Abstract base class for all LLM provider implementations.
 * Subclasses must implement `complete` and `checkHealth`.
 */
export abstract class BaseProvider {
  protected readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /** Returns the provider enum value identifying this provider. */
  abstract getProvider(): LLMProvider;

  /**
   * Sends a completion request and returns the full response.
   * Implementations should handle retries and map errors to
   * descriptive messages.
   */
  abstract complete(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Performs a lightweight health check against the provider API.
   * Should return quickly — implementations may send a minimal probe request.
   */
  abstract checkHealth(): Promise<HealthStatus>;

  /** Returns the default model for this provider. */
  getDefaultModel(): string {
    return this.config.defaultModel ?? this.getFallbackDefaultModel();
  }

  /**
   * Returns the hard-coded default model when none is specified in config.
   * Subclasses override this to provide provider-specific defaults.
   */
  protected abstract getFallbackDefaultModel(): string;

  /** Returns the configured API key. */
  protected getApiKey(): string {
    return this.config.apiKey;
  }

  /** Returns the configured max retries (default: 2). */
  protected getMaxRetries(): number {
    return this.config.maxRetries ?? 2;
  }

  /** Returns the configured timeout in milliseconds (default: 30000). */
  protected getTimeoutMs(): number {
    return this.config.timeoutMs ?? 30_000;
  }
}
