import { RateLimiter } from './rate-limiter.js';

function makeRedis(overrides: Record<string, jest.Mock> = {}): {
  pipeline: jest.Mock;
  get: jest.Mock;
} {
  return {
    pipeline: jest.fn(),
    get: jest.fn(),
    ...overrides,
  };
}

describe('RateLimiter', () => {
  describe('checkRateLimit', () => {
    it('allows request when count is within limit', async () => {
      const pipelineMock = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
      };
      const redis = makeRedis({ pipeline: jest.fn().mockReturnValue(pipelineMock) });
      const limiter = new RateLimiter(redis as never);
      const result = await limiter.checkRateLimit('user1', 'GET /api', 10, 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(typeof result.resetAt).toBe('number');
    });

    it('rejects request when count exceeds limit', async () => {
      const pipelineMock = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 11], [null, 1]]),
      };
      const redis = makeRedis({ pipeline: jest.fn().mockReturnValue(pipelineMock) });
      const limiter = new RateLimiter(redis as never);
      const result = await limiter.checkRateLimit('user1', 'GET /api', 10, 60);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('allows request at exactly the limit boundary', async () => {
      const pipelineMock = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 5], [null, 1]]),
      };
      const redis = makeRedis({ pipeline: jest.fn().mockReturnValue(pipelineMock) });
      const limiter = new RateLimiter(redis as never);
      const result = await limiter.checkRateLimit('user1', 'POST /api', 5, 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('returns resetAt in the future', async () => {
      const pipelineMock = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
      };
      const redis = makeRedis({ pipeline: jest.fn().mockReturnValue(pipelineMock) });
      const limiter = new RateLimiter(redis as never);
      const before = Math.floor(Date.now() / 1000);
      const result = await limiter.checkRateLimit('user1', 'GET /api', 10, 60);
      expect(result.resetAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getRemainingRequests', () => {
    it('returns full limit when no counter exists', async () => {
      const redis = makeRedis({ get: jest.fn().mockResolvedValue(null) });
      const limiter = new RateLimiter(redis as never);
      expect(await limiter.getRemainingRequests('user1', 'GET /api', 10, 60)).toBe(10);
    });

    it('returns remaining count based on stored value', async () => {
      const redis = makeRedis({ get: jest.fn().mockResolvedValue('3') });
      const limiter = new RateLimiter(redis as never);
      expect(await limiter.getRemainingRequests('user1', 'GET /api', 10, 60)).toBe(7);
    });

    it('returns 0 when limit exceeded', async () => {
      const redis = makeRedis({ get: jest.fn().mockResolvedValue('15') });
      const limiter = new RateLimiter(redis as never);
      expect(await limiter.getRemainingRequests('user1', 'GET /api', 10, 60)).toBe(0);
    });
  });
});
