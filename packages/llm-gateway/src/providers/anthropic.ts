import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicModel,
  HealthStatus,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
  TokenUsage,
} from '../types';
import { BaseProvider } from './base';
import { estimateAnthropicCost } from '../utils/cost';

/** Supported Claude models. */
export const ANTHROPIC_MODELS: AnthropicModel[] = [
  'claude-3-5-sonnet-20241022',
  'claude-3-haiku-20240307',
  'claude-3-opus-20240229',
];

const DEFAULT_ANTHROPIC_MODEL: AnthropicModel = 'claude-3-5-sonnet-20241022';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * LLM provider implementation for Anthropic Claude models.
 * Supports claude-3-5-sonnet, claude-3-haiku, and claude-3-opus.
 */
export class AnthropicProvider extends BaseProvider {
  private readonly client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: this.getApiKey(),
      baseURL: config.baseURL,
      maxRetries: this.getMaxRetries(),
      timeout: this.getTimeoutMs(),
    });
  }

  getProvider(): LLMProvider {
    return LLMProvider.ANTHROPIC;
  }

  protected getFallbackDefaultModel(): string {
    return DEFAULT_ANTHROPIC_MODEL;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = (request.model as AnthropicModel | undefined) ?? this.getDefaultModel();

    // Validate model is supported by this provider
    if (!ANTHROPIC_MODELS.includes(model as AnthropicModel)) {
      throw new Error(
        `[AnthropicProvider] Unsupported model: "${model}". ` +
          `Supported models: ${ANTHROPIC_MODELS.join(', ')}`,
      );
    }

    // Separate system message from conversation messages
    let systemPrompt = request.systemPrompt;
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        // Anthropic uses a top-level system param, not a message
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${msg.content}` : msg.content;
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    if (messages.length === 0) {
      throw new Error('[AnthropicProvider] At least one non-system message is required.');
    }

    try {
      const response = await this.client.messages.create({
        model,
        system: systemPrompt,
        messages,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: request.temperature,
      });

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const usage: TokenUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        estimatedCostUsd: estimateAnthropicCost(
          model as AnthropicModel,
          response.usage.input_tokens,
          response.usage.output_tokens,
        ),
      };

      return {
        content,
        model: response.model,
        provider: LLMProvider.ANTHROPIC,
        usage,
        finishReason: response.stop_reason ?? 'stop',
        metadata: request.metadata,
      };
    } catch (err) {
      throw wrapAnthropicError(err);
    }
  }

  async checkHealth(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      // Send a minimal request to verify the API key and reachability
      await this.client.messages.create({
        model: DEFAULT_ANTHROPIC_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return {
        provider: LLMProvider.ANTHROPIC,
        healthy: true,
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
      };
    } catch (err) {
      return {
        provider: LLMProvider.ANTHROPIC,
        healthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        checkedAt: new Date(),
      };
    }
  }
}

function wrapAnthropicError(err: unknown): Error {
  if (err instanceof Anthropic.APIError) {
    const msg = `[AnthropicProvider] API error ${err.status}: ${err.message}`;
    const wrapped = new Error(msg);
    wrapped.name = 'AnthropicAPIError';
    return wrapped;
  }
  if (err instanceof Error) {
    err.message = `[AnthropicProvider] ${err.message}`;
    return err;
  }
  return new Error(`[AnthropicProvider] Unknown error: ${String(err)}`);
}
