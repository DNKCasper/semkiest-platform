import { RateLimiterRedis, RateLimiterRes, RateLimiterMemory } from 'rate-limiter-flexible';
import type { Redis } from 'ioredis';
import type { Request, Response, NextFunction } from 'express';

/** Default limits for general org API traffic: 1000 req/min */
const ORG_RATE_LIMIT_DEFAULTS = {
  points: 1000,
  duration: 60, // seconds
  keyPrefix: 'rl:org',
};

/** Default limits for LLM API calls: 60 req/min per org */
const LLM_RATE_LIMIT_DEFAULTS = {
  points: 60,
  duration: 60, // seconds
  keyPrefix: 'rl:llm',
};

export interface RateLimitOptions {
  /** Number of requests allowed per window. Default: 1000 for org, 60 for LLM. */
  points?: number;
  /** Window size in seconds. Default: 60. */
  duration?: number;
}

/**
 * Attaches standard rate-limit response headers to the outgoing response.
 * Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 */
function setRateLimitHeaders(res: Response, result: RateLimiterRes, limit: number): void {
  const resetTime = new Date(Date.now() + result.msBeforeNext);
  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(Math.max(0, result.remainingPoints)));
  res.set('X-RateLimit-Reset', String(Math.floor(resetTime.getTime() / 1000)));
}

/**
 * Extracts the organization identifier from the request.
 * Falls back to IP address or "anonymous" when no org context is present.
 */
function extractOrgKey(req: Request): string {
  const userReq = req as Request & { user?: { organizationId?: string } };
  return (
    userReq.user?.organizationId ??
    (req.headers['x-organization-id'] as string | undefined) ??
    req.ip ??
    'anonymous'
  );
}

/**
 * Creates per-organization API rate limiting middleware.
 *
 * Uses Redis for distributed rate limiting across multiple API instances.
 * Falls back to in-memory limiting when Redis is unavailable (fail-open
 * strategy to avoid blocking legitimate traffic on infrastructure errors).
 *
 * Returns 429 Too Many Requests with a Retry-After header when the limit
 * is exceeded, along with standard X-RateLimit-* headers on every response.
 *
 * @param redisClient - Connected ioredis client
 * @param options - Optional override for points and duration
 */
export function createOrgRateLimiter(
  redisClient: Redis,
  options?: RateLimitOptions,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const config = { ...ORG_RATE_LIMIT_DEFAULTS, ...options };

  const limiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: config.keyPrefix,
    points: config.points,
    duration: config.duration,
  });

  // Fallback used when Redis is unreachable
  const memoryFallback = new RateLimiterMemory({
    keyPrefix: `${config.keyPrefix}:mem`,
    points: config.points,
    duration: config.duration,
  });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = extractOrgKey(req);

    const consume = async (l: RateLimiterRedis | RateLimiterMemory): Promise<void> => {
      try {
        const result = await l.consume(key);
        setRateLimitHeaders(res, result, config.points);
        next();
      } catch (err) {
        if (err instanceof RateLimiterRes) {
          setRateLimitHeaders(res, err, config.points);
          const retryAfter = Math.ceil(err.msBeforeNext / 1000);
          res.set('Retry-After', String(retryAfter));
          res.status(429).json({
            error: 'Too Many Requests',
            message: `API rate limit exceeded. Retry after ${retryAfter} seconds.`,
            retryAfter,
          });
        } else {
          // Unexpected error (e.g. Redis down) – fail open
          next();
        }
      }
    };

    try {
      await consume(limiter);
    } catch {
      // Redis unreachable – degrade gracefully to in-memory limiter
      await consume(memoryFallback);
    }
  };
}

/**
 * Creates LLM API call throttling middleware.
 *
 * Applies stricter per-organization limits on routes that proxy LLM provider
 * APIs, preventing runaway credit consumption and respecting provider limits.
 *
 * @param redisClient - Connected ioredis client
 * @param options - Optional override for points and duration
 */
export function createLlmRateLimiter(
  redisClient: Redis,
  options?: RateLimitOptions,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const config = { ...LLM_RATE_LIMIT_DEFAULTS, ...options };

  const limiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: config.keyPrefix,
    points: config.points,
    duration: config.duration,
  });

  const memoryFallback = new RateLimiterMemory({
    keyPrefix: `${config.keyPrefix}:mem`,
    points: config.points,
    duration: config.duration,
  });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = extractOrgKey(req);

    const consume = async (l: RateLimiterRedis | RateLimiterMemory): Promise<void> => {
      try {
        const result = await l.consume(key);
        setRateLimitHeaders(res, result, config.points);
        next();
      } catch (err) {
        if (err instanceof RateLimiterRes) {
          setRateLimitHeaders(res, err, config.points);
          const retryAfter = Math.ceil(err.msBeforeNext / 1000);
          res.set('Retry-After', String(retryAfter));
          res.status(429).json({
            error: 'Too Many Requests',
            message: `LLM API rate limit exceeded. Retry after ${retryAfter} seconds.`,
            retryAfter,
            type: 'llm_rate_limit',
          });
        } else {
          next();
        }
      }
    };

    try {
      await consume(limiter);
    } catch {
      await consume(memoryFallback);
    }
  };
}
