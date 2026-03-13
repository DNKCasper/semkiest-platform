import { createLoggingMiddleware } from '../../middleware/logging.middleware';
import type { GatewayContext } from '../../middleware/types';
import type { LLMRequest, LLMResponse } from '../../types';

function makeRequest(overrides: Partial<LLMRequest> = {}): LLMRequest {
  return {
    requestId: 'req-test-001',
    messages: [{ role: 'user', content: 'Hello, world!' }],
    attribution: { organizationId: 'org-123' },
    ...overrides,
  };
}

function makeResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    requestId: 'req-test-001',
    content: 'Hi there!',
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    cost: { inputCostUsd: 0.00003, outputCostUsd: 0.000075, totalCostUsd: 0.000105 },
    finishReason: 'stop',
    latencyMs: 123,
    timestamp: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeCtx(request?: LLMRequest, response?: LLMResponse): GatewayContext {
  return {
    request: request ?? makeRequest(),
    response,
    meta: {},
  };
}

describe('createLoggingMiddleware', () => {
  it('calls next and logs request/response on success', async () => {
    const infoLogs: Array<{ message: string; data?: Record<string, unknown> }> = [];
    const logger = {
      info: (message: string, data?: Record<string, unknown>) => { infoLogs.push({ message, data }); },
      warn: jest.fn(),
      error: jest.fn(),
    };

    const middleware = createLoggingMiddleware({ logger });
    const ctx = makeCtx();

    const next = jest.fn(async () => {
      ctx.response = makeResponse();
    });

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(infoLogs).toHaveLength(2);
    expect(infoLogs[0]!.message).toBe('llm-gateway: request started');
    expect(infoLogs[1]!.message).toBe('llm-gateway: request completed');
  });

  it('logs error and re-throws when next throws', async () => {
    const errorLogs: Array<{ message: string; data?: Record<string, unknown> }> = [];
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: (message: string, data?: Record<string, unknown>) => { errorLogs.push({ message, data }); },
    };

    const middleware = createLoggingMiddleware({ logger });
    const ctx = makeCtx();
    const testError = new Error('Provider failed');
    const next = jest.fn(async () => { throw testError; });

    await expect(middleware(ctx, next)).rejects.toThrow('Provider failed');

    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]!.message).toBe('llm-gateway: request failed');
    expect(errorLogs[0]!.data?.error).toMatchObject({ message: 'Provider failed' });
  });

  it('redacts API keys from metadata', async () => {
    const infoLogs: Array<{ message: string; data?: Record<string, unknown> }> = [];
    const logger = {
      info: (message: string, data?: Record<string, unknown>) => { infoLogs.push({ message, data }); },
      warn: jest.fn(),
      error: jest.fn(),
    };

    const request = makeRequest({
      metadata: { apiKey: 'sk-supersecret', someData: 'safe-value' },
    });

    const middleware = createLoggingMiddleware({ logger });
    const ctx = makeCtx(request);
    const next = jest.fn(async () => { ctx.response = makeResponse(); });

    await middleware(ctx, next);

    const requestLog = infoLogs[0]?.data?.metadata as Record<string, unknown> | undefined;
    expect(requestLog?.['apiKey']).toBe('[REDACTED]');
    expect(requestLog?.['someData']).toBe('safe-value');
  });

  it('truncates long message content in logs', async () => {
    const infoLogs: Array<{ message: string; data?: Record<string, unknown> }> = [];
    const logger = {
      info: (message: string, data?: Record<string, unknown>) => { infoLogs.push({ message, data }); },
      warn: jest.fn(),
      error: jest.fn(),
    };

    const longContent = 'A'.repeat(1000);
    const request = makeRequest({
      messages: [{ role: 'user', content: longContent }],
    });

    const middleware = createLoggingMiddleware({ logger });
    const ctx = makeCtx(request);
    const next = jest.fn(async () => { ctx.response = makeResponse(); });

    await middleware(ctx, next);

    const messages = infoLogs[0]?.data?.messages as Array<{ contentPreview: string }>;
    expect(messages?.[0]?.contentPreview.length).toBeLessThan(longContent.length);
    expect(messages?.[0]?.contentPreview).toContain('[truncated');
  });

  it('does not log response if next does not set ctx.response', async () => {
    const infoLogs: Array<{ message: string }> = [];
    const logger = {
      info: (message: string) => { infoLogs.push({ message }); },
      warn: jest.fn(),
      error: jest.fn(),
    };

    const middleware = createLoggingMiddleware({ logger });
    const ctx = makeCtx();
    const next = jest.fn(async () => { /* no response set */ });

    await middleware(ctx, next);

    expect(infoLogs).toHaveLength(1);
    expect(infoLogs[0]!.message).toBe('llm-gateway: request started');
  });
});
