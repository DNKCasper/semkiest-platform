import { createRateLimitingMiddleware, getMonthlyTokenUsage } from '../../middleware/rate-limiting.middleware';
import type { RedisClient } from '../../middleware/rate-limiting.middleware';
import type { GatewayContext } from '../../middleware/types';
import type { LLMRequest, LLMResponse } from '../../types';
import { RateLimitError } from '../../types';

function makeRequest(orgId = 'org-123'): LLMRequest {
  return {
    requestId: 'req-001',
    messages: [{ role: 'user', content: 'Hello' }],
    attribution: { organizationId: orgId },
  };
}

function makeResponse(totalTokens = 500): LLMResponse {
  return {
    requestId: 'req-001',
    content: 'Hi',
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    usage: { inputTokens: 300, outputTokens: 200, totalTokens },
    cost: { inputCostUsd: 0.001, outputCostUsd: 0.003, totalCostUsd: 0.004 },
    finishReason: 'stop',
    latencyMs: 100,
    timestamp: new Date(),
  };
}

function makeCtx(orgId?: string): GatewayContext {
  return {
    request: makeRequest(orgId),
    meta: {},
  };
}

function makeMockRedis(initialValue = '0'): { redis: RedisClient; store: Map<string, string> } {
  const store = new Map<string, string>([[`__initial`, initialValue]]);
  let currentValue = parseInt(initialValue, 10);

  const pipeline = {
    incrby: jest.fn((_key: string, increment: number) => {
      currentValue += increment;
      pipeline._pendingValue = currentValue;
      return pipeline;
    }),
    expireat: jest.fn(() => pipeline),
    exec: jest.fn(async () => null),
    _pendingValue: 0,
  };

  const redis: RedisClient = {
    get: jest.fn(async (key: string) => {
      return store.get(key) ?? String(currentValue);
    }),
    incrby: jest.fn(async (_key: string, increment: number) => {
      currentValue += increment;
      return currentValue;
    }),
    expireat: jest.fn(async () => 1),
    pipeline: jest.fn(() => pipeline),
  };

  // Update store after pipeline.exec
  (pipeline.exec as jest.Mock).mockImplementation(async () => {
    const key = `llm-gateway:rate-limit:org-123:${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    store.set(key, String(currentValue));
    return null;
  });

  return { redis, store };
}

describe('createRateLimitingMiddleware', () => {
  it('allows requests when no budget is configured', async () => {
    const { redis } = makeMockRedis();
    const getBudget = jest.fn(async () => null);
    const middleware = createRateLimitingMiddleware({ redis, getBudget });
    const ctx = makeCtx();
    const next = jest.fn(async () => { ctx.response = makeResponse(); });

    await middleware(ctx, next);

    expect(next).toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('allows requests within budget', async () => {
    const { redis } = makeMockRedis('0');
    const getBudget = jest.fn(async () => ({ monthlyTokenLimit: 10_000 }));
    const middleware = createRateLimitingMiddleware({ redis, getBudget });
    const ctx = makeCtx();
    const next = jest.fn(async () => { ctx.response = makeResponse(500); });

    await middleware(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('blocks request when pre-request estimate exceeds budget', async () => {
    const { redis } = makeMockRedis('9900');
    (redis.get as jest.Mock).mockResolvedValue('9900');
    const getBudget = jest.fn(async () => ({ monthlyTokenLimit: 10_000 }));
    const middleware = createRateLimitingMiddleware({
      redis,
      getBudget,
      preRequestEstimate: 200, // 9900 + 200 = 10100 > 10000
    });
    const ctx = makeCtx();
    const next = jest.fn();

    await expect(middleware(ctx, next)).rejects.toThrow(RateLimitError);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes pre-request check and increments after response', async () => {
    const { redis } = makeMockRedis('0');
    const getBudget = jest.fn(async () => ({ monthlyTokenLimit: 10_000 }));
    const middleware = createRateLimitingMiddleware({ redis, getBudget });
    const ctx = makeCtx();
    const next = jest.fn(async () => { ctx.response = makeResponse(500); });

    await middleware(ctx, next);

    // Pipeline should have been used to atomically increment and set expiry
    expect(redis.pipeline).toHaveBeenCalled();
  });

  it('does not increment when next throws (no response)', async () => {
    const { redis } = makeMockRedis('0');
    const getBudget = jest.fn(async () => ({ monthlyTokenLimit: 10_000 }));
    const middleware = createRateLimitingMiddleware({ redis, getBudget });
    const ctx = makeCtx();
    const next = jest.fn(async () => { throw new Error('Provider error'); });

    await expect(middleware(ctx, next)).rejects.toThrow('Provider error');
    // Pipeline should NOT be called since there's no response
    expect(redis.pipeline).not.toHaveBeenCalled();
  });
});

describe('getMonthlyTokenUsage', () => {
  it('returns 0 when no key exists', async () => {
    const redis = {
      get: jest.fn(async () => null),
      incrby: jest.fn(),
      expireat: jest.fn(),
      pipeline: jest.fn(),
    } as unknown as RedisClient;

    const usage = await getMonthlyTokenUsage(redis, 'org-xyz');
    expect(usage).toBe(0);
  });

  it('returns parsed integer from Redis', async () => {
    const redis = {
      get: jest.fn(async () => '42000'),
      incrby: jest.fn(),
      expireat: jest.fn(),
      pipeline: jest.fn(),
    } as unknown as RedisClient;

    const usage = await getMonthlyTokenUsage(redis, 'org-xyz');
    expect(usage).toBe(42000);
  });
});
