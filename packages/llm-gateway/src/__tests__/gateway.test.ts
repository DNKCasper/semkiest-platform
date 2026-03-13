import { LLMGateway } from '../gateway';
import type { ILLMProvider, ProviderHealthStatus } from '../providers/base.provider';
import type { LLMRequest, LLMResponse } from '../types';
import { GatewayError, RateLimitError } from '../types';

function makeRequest(overrides: Partial<LLMRequest> = {}): LLMRequest {
  return {
    messages: [{ role: 'user', content: 'Hello' }],
    attribution: { organizationId: 'org-123', projectId: 'proj-456' },
    ...overrides,
  };
}

function makeResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    requestId: 'req-001',
    content: 'Hi there!',
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    cost: { inputCostUsd: 0.00003, outputCostUsd: 0.000075, totalCostUsd: 0.000105 },
    finishReason: 'stop',
    latencyMs: 100,
    timestamp: new Date(),
    ...overrides,
  };
}

function makeProvider(name: ILLMProvider['name'], response?: LLMResponse): ILLMProvider {
  return {
    name,
    defaultModel: 'test-model',
    complete: jest.fn(async () => response ?? makeResponse({ provider: name })),
    healthCheck: jest.fn(async (): Promise<ProviderHealthStatus> => ({ healthy: true })),
  };
}

describe('LLMGateway', () => {
  describe('complete()', () => {
    it('routes a request to a registered provider', async () => {
      const provider = makeProvider('claude');
      const gateway = new LLMGateway({ logging: false });
      gateway.registerProvider(provider);

      const response = await gateway.complete(makeRequest());

      expect(provider.complete).toHaveBeenCalledTimes(1);
      expect(response.provider).toBe('claude');
    });

    it('auto-generates requestId if not provided', async () => {
      const provider = makeProvider('claude');
      const gateway = new LLMGateway({ logging: false });
      gateway.registerProvider(provider);

      await gateway.complete(makeRequest());

      const calledWith = (provider.complete as jest.Mock).mock.calls[0][0] as LLMRequest;
      expect(calledWith.requestId).toBeTruthy();
      expect(typeof calledWith.requestId).toBe('string');
    });

    it('uses the requestId from the request when provided', async () => {
      const provider = makeProvider('claude');
      const gateway = new LLMGateway({ logging: false });
      gateway.registerProvider(provider);

      await gateway.complete(makeRequest({ requestId: 'my-custom-id' }));

      const calledWith = (provider.complete as jest.Mock).mock.calls[0][0] as LLMRequest;
      expect(calledWith.requestId).toBe('my-custom-id');
    });

    it('throws GatewayError when no providers are registered', async () => {
      const gateway = new LLMGateway({ logging: false });

      await expect(gateway.complete(makeRequest())).rejects.toThrow(GatewayError);
    });

    it('falls back to secondary provider when primary fails', async () => {
      const failing = makeProvider('claude');
      (failing.complete as jest.Mock).mockRejectedValue(new Error('Claude is down'));

      const fallback = makeProvider('openai', makeResponse({ provider: 'openai' }));

      const gateway = new LLMGateway({
        logging: false,
        factory: { fallbackChain: ['claude', 'openai'], maxRetries: 0 },
      });
      gateway.registerProvider(failing, 1);
      gateway.registerProvider(fallback, 2);

      const response = await gateway.complete(makeRequest({ provider: undefined }));

      expect(response.provider).toBe('openai');
    });

    it('runs logging middleware when configured', async () => {
      const logs: string[] = [];
      const logger = {
        info: (msg: string) => logs.push(msg),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const provider = makeProvider('claude');
      const gateway = new LLMGateway({ logging: { logger } });
      gateway.registerProvider(provider);

      await gateway.complete(makeRequest());

      expect(logs).toContain('llm-gateway: request started');
      expect(logs).toContain('llm-gateway: request completed');
    });

    it('runs token tracking middleware and persists usage', async () => {
      const records: unknown[] = [];
      const db = {
        createUsageRecord: jest.fn(async (record: unknown) => { records.push(record); }),
        getMonthlyTokenUsage: jest.fn(async () => 0),
      };

      const provider = makeProvider('claude');
      const gateway = new LLMGateway({ logging: false, tokenTracking: { db } });
      gateway.registerProvider(provider);

      await gateway.complete(makeRequest());

      expect(records).toHaveLength(1);
    });

    it('enforces rate limiting via Redis middleware', async () => {
      const store = new Map<string, string>([['key', '9999']]);
      const pipeline = {
        incrby: jest.fn(() => pipeline),
        expireat: jest.fn(() => pipeline),
        exec: jest.fn(async () => null),
      };
      const redis = {
        get: jest.fn(async () => '9999'),
        incrby: jest.fn(async () => 10000),
        expireat: jest.fn(async () => 1),
        pipeline: jest.fn(() => pipeline),
      };

      const getBudget = jest.fn(async () => ({ monthlyTokenLimit: 10_000 }));

      const provider = makeProvider('claude');
      const gateway = new LLMGateway({
        logging: false,
        rateLimiting: { redis, getBudget, preRequestEstimate: 200 },
      });
      gateway.registerProvider(provider);

      await expect(gateway.complete(makeRequest())).rejects.toThrow(RateLimitError);
      expect(provider.complete).not.toHaveBeenCalled();
    });
  });

  describe('provider management', () => {
    it('lists registered providers', () => {
      const gateway = new LLMGateway({ logging: false });
      gateway.registerProvider(makeProvider('claude'), 1);
      gateway.registerProvider(makeProvider('openai'), 2);

      const providers = gateway.listProviders();
      expect(providers).toContain('claude');
      expect(providers).toContain('openai');
    });

    it('supports hot-swap via unregisterProvider', async () => {
      const provider = makeProvider('claude');
      const gateway = new LLMGateway({ logging: false });
      gateway.registerProvider(provider);

      gateway.unregisterProvider('claude');

      await expect(gateway.complete(makeRequest())).rejects.toThrow(GatewayError);
    });
  });
});
