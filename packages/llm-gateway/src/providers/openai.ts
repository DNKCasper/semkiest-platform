import OpenAI from 'openai';
import {
  HealthStatus,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  OpenAIModel,
  ProviderConfig,
  TokenUsage,
} from '../types';
import { BaseProvider } from './base';
import { estimateOpenAICost } from '../utils/cost';

/** Supported OpenAI models. */
export const OPENAI_MODELS: OpenAIModel[] = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];

const DEFAULT_OPENAI_MODEL: OpenAIModel = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * LLM provider implementation for OpenAI models.
 * Supports gpt-4o, gpt-4-turbo, and gpt-3.5-turbo.
 */
export class OpenAIProvider extends BaseProvider {
  private readonly client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: this.getApiKey(),
      baseURL: config.baseURL,
      maxRetries: this.getMaxRetries(),
      timeout: this.getTimeoutMs(),
    });
  }

  getProvider(): LLMProvider {
    return LLMProvider.OPENAI;
  }

  protected getFallbackDefaultModel(): string {
    return DEFAULT_OPENAI_MODEL;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = (request.model as OpenAIModel | undefined) ?? this.getDefaultModel();

    // Validate model is supported by this provider
    if (!OPENAI_MODELS.includes(model as OpenAIModel)) {
      throw new Error(
        `[OpenAIProvider] Unsupported model: "${model}". ` +
          `Supported models: ${OPENAI_MODELS.join(', ')}`,
      );
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Inject system prompt first if provided
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    // Map conversation messages to OpenAI format
    for (const msg of request.messages) {
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      });
    }

    if (messages.length === 0) {
      throw new Error('[OpenAIProvider] At least one message is required.');
    }

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: request.temperature,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('[OpenAIProvider] No completion choices returned by the API.');
      }

      const content = choice.message.content ?? '';
      const usageData = response.usage;

      const inputTokens = usageData?.prompt_tokens ?? 0;
      const outputTokens = usageData?.completion_tokens ?? 0;

      const usage: TokenUsage = {
        inputTokens,
        outputTokens,
        totalTokens: usageData?.total_tokens ?? inputTokens + outputTokens,
        estimatedCostUsd: estimateOpenAICost(model as OpenAIModel, inputTokens, outputTokens),
      };

      return {
        content,
        model: response.model,
        provider: LLMProvider.OPENAI,
        usage,
        finishReason: choice.finish_reason ?? 'stop',
        metadata: request.metadata,
      };
    } catch (err) {
      throw wrapOpenAIError(err);
    }
  }

  async checkHealth(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      // Send a minimal request to verify the API key and reachability
      await this.client.chat.completions.create({
        model: DEFAULT_OPENAI_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return {
        provider: LLMProvider.OPENAI,
        healthy: true,
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
      };
    } catch (err) {
      return {
        provider: LLMProvider.OPENAI,
        healthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        checkedAt: new Date(),
      };
    }
  }
}

function wrapOpenAIError(err: unknown): Error {
  if (err instanceof OpenAI.APIError) {
    const msg = `[OpenAIProvider] API error ${err.status}: ${err.message}`;
    const wrapped = new Error(msg);
    wrapped.name = 'OpenAIAPIError';
    return wrapped;
  }
  if (err instanceof Error) {
    err.message = `[OpenAIProvider] ${err.message}`;
    return err;
  }
  return new Error(`[OpenAIProvider] Unknown error: ${String(err)}`);
}
