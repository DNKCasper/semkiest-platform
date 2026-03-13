import { LLMProvider, ProviderConfig } from '../types';
import { AnthropicProvider } from './anthropic';
import { BaseProvider } from './base';
import { OpenAIProvider } from './openai';

/**
 * Factory for creating LLM provider instances from configuration objects.
 *
 * Usage:
 * ```typescript
 * const provider = ProviderFactory.create({
 *   provider: LLMProvider.OPENAI,
 *   apiKey: process.env.OPENAI_API_KEY,
 *   defaultModel: 'gpt-4o',
 * });
 * ```
 */
export class ProviderFactory {
  /**
   * Creates and returns a provider instance based on the given configuration.
   * Throws if the provider type is not supported.
   */
  static create(config: ProviderConfig): BaseProvider {
    switch (config.provider) {
      case LLMProvider.ANTHROPIC:
        return new AnthropicProvider(config);
      case LLMProvider.OPENAI:
        return new OpenAIProvider(config);
      default: {
        // Exhaustive check — TypeScript will flag unhandled cases at compile time
        const _exhaustive: never = config.provider;
        throw new Error(
          `[ProviderFactory] Unsupported provider: "${String(_exhaustive)}". ` +
            `Supported providers: ${Object.values(LLMProvider).join(', ')}`,
        );
      }
    }
  }

  /**
   * Creates a map of provider instances from a record of provider configs.
   * Providers missing from the record are simply not included in the map.
   */
  static createAll(
    configs: Partial<Record<LLMProvider, ProviderConfig>>,
  ): Map<LLMProvider, BaseProvider> {
    const providers = new Map<LLMProvider, BaseProvider>();
    for (const [, config] of Object.entries(configs) as [LLMProvider, ProviderConfig][]) {
      if (config) {
        const provider = ProviderFactory.create(config);
        providers.set(provider.getProvider(), provider);
      }
    }
    return providers;
  }
}
