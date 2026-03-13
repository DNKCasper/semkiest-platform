import { createTokenTrackingMiddleware } from '../../middleware/token-tracking.middleware';
import type { DatabaseAdapter, UsageRecord } from '../../middleware/token-tracking.middleware';
import type { GatewayContext } from '../../middleware/types';
import type { LLMRequest, LLMResponse } from '../../types';

function makeRequest(overrides: Partial<LLMRequest> = {}): LLMRequest {
  return {
    requestId: 'req-001',
    messages: [{ role: 'user', content: 'Hello' }],
    attribution: { organizationId: 'org-abc', projectId: 'proj-xyz', agentType: 'test-runner' },
    templateRef: { id: 'code-review', version: '1.0.0' },
    ...overrides,
  };
}

function makeResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    requestId: 'req-001',
    content: 'Response',
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    cost: { inputCostUsd: 0.0003, outputCostUsd: 0.00075, totalCostUsd: 0.00105 },
    finishReason: 'stop',
    latencyMs: 200,
    timestamp: new Date(),
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

function makeMockDb(): { db: DatabaseAdapter; records: UsageRecord[] } {
  const records: UsageRecord[] = [];
  const db: DatabaseAdapter = {
    createUsageRecord: jest.fn(async (record: UsageRecord) => { records.push(record); }),
    getMonthlyTokenUsage: jest.fn(async () => 0),
  };
  return { db, records };
}

describe('createTokenTrackingMiddleware', () => {
  it('persists a usage record after a successful request', async () => {
    const { db, records } = makeMockDb();
    const middleware = createTokenTrackingMiddleware({ db });
    const ctx = makeCtx();
    const next = jest.fn(async () => { ctx.response = makeResponse(); });

    await middleware(ctx, next);

    expect(db.createUsageRecord).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.requestId).toBe('req-001');
    expect(record.organizationId).toBe('org-abc');
    expect(record.projectId).toBe('proj-xyz');
    expect(record.agentType).toBe('test-runner');
    expect(record.provider).toBe('claude');
    expect(record.model).toBe('claude-sonnet-4-5');
    expect(record.inputTokens).toBe(100);
    expect(record.outputTokens).toBe(50);
    expect(record.totalTokens).toBe(150);
    expect(record.costUsd).toBeCloseTo(0.00105);
    expect(record.templateId).toBe('code-review');
    expect(record.templateVersion).toBe('1.0.0');
  });

  it('does NOT persist a record when there is no response', async () => {
    const { db } = makeMockDb();
    const middleware = createTokenTrackingMiddleware({ db });
    const ctx = makeCtx();
    const next = jest.fn(async () => { /* no response */ });

    await middleware(ctx, next);

    expect(db.createUsageRecord).not.toHaveBeenCalled();
  });

  it('calls onRecordPersisted callback after success', async () => {
    const { db } = makeMockDb();
    const onRecordPersisted = jest.fn();
    const middleware = createTokenTrackingMiddleware({ db, onRecordPersisted });
    const ctx = makeCtx();
    const next = jest.fn(async () => { ctx.response = makeResponse(); });

    await middleware(ctx, next);

    expect(onRecordPersisted).toHaveBeenCalledTimes(1);
    expect(onRecordPersisted).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-001' }));
  });

  it('does not throw when db persistence fails (non-fatal)', async () => {
    const db: DatabaseAdapter = {
      createUsageRecord: jest.fn(async () => { throw new Error('DB connection refused'); }),
      getMonthlyTokenUsage: jest.fn(async () => 0),
    };
    const onPersistError = jest.fn();
    const middleware = createTokenTrackingMiddleware({ db, onPersistError });
    const ctx = makeCtx();
    const next = jest.fn(async () => { ctx.response = makeResponse(); });

    // Should not throw — persistence failure is non-fatal
    await expect(middleware(ctx, next)).resolves.toBeUndefined();
    expect(onPersistError).toHaveBeenCalledWith(
      expect.any(Error),
      'req-001',
    );
  });

  it('still calls next before trying to persist', async () => {
    const { db } = makeMockDb();
    const callOrder: string[] = [];

    const middleware = createTokenTrackingMiddleware({ db });
    const ctx = makeCtx();
    const next = jest.fn(async () => {
      callOrder.push('next');
      ctx.response = makeResponse();
    });

    (db.createUsageRecord as jest.Mock).mockImplementationOnce(async () => {
      callOrder.push('persist');
    });

    await middleware(ctx, next);

    expect(callOrder).toEqual(['next', 'persist']);
  });
});
