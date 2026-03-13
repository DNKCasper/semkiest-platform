import type { ILLMProvider, ProviderRegistration } from './base.provider.js';
import type { LLMRequest, LLMResponse, ProviderName } from '../types/index.js';
import { GatewayError } from '../types/index.js';

export interface ProviderFactoryOptions {
  /**
   * Fallback chain: ordered list of provider names to try when the primary fails.
   * The gateway attempts providers in order until one succeeds.
   */
  fallbackChain?: ProviderName[];
  /** Maximum retry attempts per provider before falling back */
  maxRetries?: number;
  /** Base delay (ms) for exponential backoff between retries */
  retryDelayMs?: number;
}

/**
 * Manages LLM provider registrations and routes requests with
 * automatic fallback and retry support.
 *
 * Usage:
 * ```ts
 * const factory = new ProviderFactory({ fallbackChain: ['claude', 'openai'] });
 * factory.register(claudeProvider, 1);
 * factory.register(openaiProvider, 2);
 * const response = await factory.complete(request);
 * ```
 */
export class ProviderFactory {
  private readonly providers = new Map<ProviderName, ProviderRegistration>();
  private readonly fallbackChain: ProviderName[];
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: ProviderFactoryOptions = {}) {
    this.fallbackChain = options.fallbackChain ?? [];
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
  }

  /**
   * Register a provider with an optional priority (lower = preferred).
   */
  register(provider: ILLMProvider, priority = 100): void {
    this.providers.set(provider.name, { provider, priority });
  }

  /**
   * Remove a registered provider (supports hot-swap).
   */
  unregister(name: ProviderName): void {
    this.providers.delete(name);
  }

  /**
   * Returns a registered provider by name, or undefined.
   */
  get(name: ProviderName): ILLMProvider | undefined {
    return this.providers.get(name)?.provider;
  }

  /**
   * Returns all registered provider names ordered by priority.
   */
  listProviders(): ProviderName[] {
    return [...this.providers.entries()]
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([name]) => name);
  }

  /**
   * Route a completion request through the fallback chain.
   *
   * Resolution order:
   * 1. The provider explicitly named in `request.provider`
   * 2. Each provider in `fallbackChain` (in order)
   * 3. Remaining registered providers ordered by priority
   *
   * @throws {GatewayError} when all providers fail
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const chain = this.buildProviderChain(request.provider);

    if (chain.length === 0) {
      throw new GatewayError('No providers registered', 'NO_PROVIDERS');
    }

    const errors: Array<{ provider: ProviderName; error: unknown }> = [];

    for (const providerName of chain) {
      const registration = this.providers.get(providerName);
      if (!registration) continue;

      const result = await this.attemptWithRetry(registration.provider, request);
      if (result.success) {
        return result.response;
      }

      errors.push({ provider: providerName, error: result.error });
    }

    const errorSummary = errors
      .map(({ provider, error }) => `${provider}: ${String(error)}`)
      .join('; ');

    throw new GatewayError(
      `All providers failed: ${errorSummary}`,
      'ALL_PROVIDERS_FAILED',
    );
  }

  private buildProviderChain(preferred?: ProviderName): ProviderName[] {
    const seen = new Set<ProviderName>();
    const chain: ProviderName[] = [];

    const add = (name: ProviderName) => {
      if (!seen.has(name) && this.providers.has(name)) {
        seen.add(name);
        chain.push(name);
      }
    };

    if (preferred) add(preferred);
    for (const name of this.fallbackChain) add(name);
    for (const name of this.listProviders()) add(name);

    return chain;
  }

  private async attemptWithRetry(
    provider: ILLMProvider,
    request: LLMRequest,
  ): Promise<{ success: true; response: LLMResponse } | { success: false; error: unknown }> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await this.delay(this.retryDelayMs * Math.pow(2, attempt - 1));
      }

      try {
        const response = await provider.complete(request);
        return { success: true, response };
      } catch (error) {
        lastError = error;
      }
    }

    return { success: false, error: lastError };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
