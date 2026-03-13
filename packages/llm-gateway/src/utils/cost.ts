import { AnthropicModel, OpenAIModel } from '../types';

/**
 * Per-million-token pricing (USD) as of early 2025.
 * Update these values when provider pricing changes.
 */

interface ModelPricing {
  /** Cost per 1M input tokens in USD. */
  inputPerMillion: number;
  /** Cost per 1M output tokens in USD. */
  outputPerMillion: number;
}

const ANTHROPIC_PRICING: Record<AnthropicModel, ModelPricing> = {
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  'claude-3-opus-20240229': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
};

const OPENAI_PRICING: Record<OpenAIModel, ModelPricing> = {
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-4-turbo': { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  'gpt-3.5-turbo': { inputPerMillion: 0.5, outputPerMillion: 1.5 },
};

/**
 * Estimates the USD cost of an Anthropic API call.
 * Returns undefined if the model is not in the pricing table.
 */
export function estimateAnthropicCost(
  model: AnthropicModel,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const pricing = ANTHROPIC_PRICING[model];
  if (!pricing) return undefined;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}

/**
 * Estimates the USD cost of an OpenAI API call.
 * Returns undefined if the model is not in the pricing table.
 */
export function estimateOpenAICost(
  model: OpenAIModel,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const pricing = OPENAI_PRICING[model];
  if (!pricing) return undefined;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}
