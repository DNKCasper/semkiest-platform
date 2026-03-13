import { calculateCost, DEFAULT_PRICING_TABLE, GatewayError, RateLimitError } from '../types';
import type { TokenUsage } from '../types';

describe('calculateCost', () => {
  const usage: TokenUsage = {
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
  };

  it('calculates cost for a known Claude model', () => {
    const cost = calculateCost('claude', 'claude-sonnet-4-5', usage);

    expect(cost.inputCostUsd).toBeCloseTo(0.003); // 1000/1000 * 0.003
    expect(cost.outputCostUsd).toBeCloseTo(0.0075); // 500/1000 * 0.015
    expect(cost.totalCostUsd).toBeCloseTo(0.0105);
  });

  it('calculates cost for a known OpenAI model', () => {
    const cost = calculateCost('openai', 'gpt-4o-mini', usage);

    expect(cost.inputCostUsd).toBeCloseTo(0.00015); // 1000/1000 * 0.00015
    expect(cost.outputCostUsd).toBeCloseTo(0.0003);  // 500/1000 * 0.0006
    expect(cost.totalCostUsd).toBeCloseTo(0.00045);
  });

  it('falls back to provider default pricing for unknown model', () => {
    const cost = calculateCost('claude', 'claude-unknown-model', usage);
    const defaultCost = calculateCost('claude', 'default', usage, DEFAULT_PRICING_TABLE);

    expect(cost.totalCostUsd).toBeCloseTo(defaultCost.totalCostUsd);
  });

  it('returns zero cost for ollama (local) models', () => {
    const cost = calculateCost('ollama', 'llama3.1:8b', usage);

    expect(cost.inputCostUsd).toBe(0);
    expect(cost.outputCostUsd).toBe(0);
    expect(cost.totalCostUsd).toBe(0);
  });

  it('accepts a custom pricing table', () => {
    const customTable = {
      claude: { 'custom-model': { inputCostPer1kTokens: 1.0, outputCostPer1kTokens: 2.0 }, default: { inputCostPer1kTokens: 0, outputCostPer1kTokens: 0 } },
      openai: { default: { inputCostPer1kTokens: 0, outputCostPer1kTokens: 0 } },
      gemini: { default: { inputCostPer1kTokens: 0, outputCostPer1kTokens: 0 } },
      ollama: { default: { inputCostPer1kTokens: 0, outputCostPer1kTokens: 0 } },
    };

    const cost = calculateCost('claude', 'custom-model', usage, customTable);

    expect(cost.inputCostUsd).toBeCloseTo(1.0);
    expect(cost.outputCostUsd).toBeCloseTo(1.0);
  });
});

describe('GatewayError', () => {
  it('has correct name and properties', () => {
    const error = new GatewayError('Something went wrong', 'PROVIDER_ERROR', 'claude');

    expect(error.name).toBe('GatewayError');
    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.provider).toBe('claude');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof GatewayError).toBe(true);
  });
});

describe('RateLimitError', () => {
  it('has correct name and properties', () => {
    const error = new RateLimitError('org-xyz', 15_000, 10_000);

    expect(error.name).toBe('RateLimitError');
    expect(error.organizationId).toBe('org-xyz');
    expect(error.currentUsage).toBe(15_000);
    expect(error.limit).toBe(10_000);
    expect(error instanceof GatewayError).toBe(true);
    expect(error instanceof RateLimitError).toBe(true);
    expect(error.message).toContain('org-xyz');
  });
});
