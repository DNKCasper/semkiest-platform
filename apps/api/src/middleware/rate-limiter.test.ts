import type { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { createOrgRateLimiter, createLlmRateLimiter } from './rate-limiter';

// Minimal Redis mock – createOrgRateLimiter falls back to RateLimiterMemory on error
const mockRedis = {
  status: 'ready',
  options: {},
  duplicate: jest.fn(),
  defineCommand: jest.fn(),
} as unknown as import('ioredis').Redis;

// Force RateLimiterRedis to always throw so the fallback path is exercised
jest.mock('rate-limiter-flexible', () => {
  const actual = jest.requireActual<typeof import('rate-limiter-flexible')>('rate-limiter-flexible');

  class RateLimiterRedisMock {
    private inner: InstanceType<typeof actual.RateLimiterMemory>;
    constructor(opts: ConstructorParameters<typeof actual.RateLimiterMemory>[0]) {
      this.inner = new actual.RateLimiterMemory({ ...opts, keyPrefix: `${opts.keyPrefix ?? ''}:mock` });
    }
    async consume(key: string): Promise<actual.RateLimiterRes> {
      return this.inner.consume(key);
    }
  }

  return { ...actual, RateLimiterRedis: RateLimiterRedisMock };
});

function makeReqRes(orgId?: string): { req: Request; res: Response; next: NextFunction } {
  const req = {
    headers: orgId ? { 'x-organization-id': orgId } : {},
    ip: '127.0.0.1',
  } as unknown as Request;

  const headers: Record<string, string> = {};
  const res = {
    set: jest.fn((k: string, v: string) => { headers[k] = v; }),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    _headers: headers,
  } as unknown as Response;

  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe('createOrgRateLimiter', () => {
  it('calls next() and sets rate limit headers on successful consume', async () => {
    const middleware = createOrgRateLimiter(mockRedis, { points: 100, duration: 60 });
    const { req, res, next } = makeReqRes('org-1');

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    expect(res.set).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      expect.stringMatching(/^\d+$/),
    );
  });

  it('returns 429 and Retry-After when limit is exhausted', async () => {
    // Use a 1-point limit so the second call exceeds it
    const middleware = createOrgRateLimiter(mockRedis, { points: 1, duration: 60 });
    const { req: req1, res: res1, next: next1 } = makeReqRes('org-exhaust');
    await middleware(req1, res1, next1); // first call – succeeds

    const { req: req2, res: res2, next: next2 } = makeReqRes('org-exhaust');
    await middleware(req2, res2, next2); // second call – exceeds limit

    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Too Many Requests' }),
    );
    expect(res2.set).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
  });

  it('falls through to next() when an unexpected error occurs (fail-open)', async () => {
    // Override consume to throw an unexpected error (not RateLimiterRes)
    jest.spyOn(RateLimiterMemory.prototype, 'consume').mockRejectedValueOnce(new Error('oops'));

    const middleware = createOrgRateLimiter(mockRedis, { points: 100, duration: 60 });
    const { req, res, next } = makeReqRes('org-error');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe('createLlmRateLimiter', () => {
  it('calls next() and sets LLM rate limit headers', async () => {
    const middleware = createLlmRateLimiter(mockRedis, { points: 10, duration: 60 });
    const { req, res, next } = makeReqRes('org-llm');

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
  });

  it('returns 429 with type=llm_rate_limit when LLM limit exceeded', async () => {
    const middleware = createLlmRateLimiter(mockRedis, { points: 1, duration: 60 });
    const { req: req1, res: res1, next: next1 } = makeReqRes('org-llm-exhaust');
    await middleware(req1, res1, next1);

    const { req: req2, res: res2, next: next2 } = makeReqRes('org-llm-exhaust');
    await middleware(req2, res2, next2);

    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'llm_rate_limit' }),
    );
  });
});
