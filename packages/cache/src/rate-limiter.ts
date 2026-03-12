import type { Redis } from 'ioredis';
import type { RateLimitResult } from './types.js';

/**
 * Build the Redis key for a rate-limit bucket.
 *
 * Format: `ratelimit:<userId>:<endpoint>:<windowStart>`
 * where `windowStart` is floored to the nearest `windowSeconds` boundary.
 */
function buildKey(userId: string, endpoint: string, windowSeconds: number): string {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  return `ratelimit:${userId}:${endpoint}:${windowStart}`;
}

/**
 * Sliding-window rate limiter backed by Redis.
 *
 * Uses a fixed-window counter per user+endpoint combination. Each counter
 * expires automatically at the end of its time window.
 */
export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  /**
   * Check whether `userId` is allowed to call `endpoint`.
   *
   * Increments the request counter for the current window. If the resulting
   * count exceeds `limit` the request is rejected.
   *
   * @param userId        Unique user identifier
   * @param endpoint      API endpoint identifier (e.g. `"POST /api/runs"`)
   * @param limit         Maximum requests allowed per `windowSeconds`
   * @param windowSeconds Duration of the time window in seconds
   * @returns `RateLimitResult` containing `allowed`, `remaining`, and `resetAt`
   */
  async checkRateLimit(
    userId: string,
    endpoint: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const key = buildKey(userId, endpoint, windowSeconds);

    const pipeline = this.redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, windowSeconds);

    const results = await pipeline.exec();
    // results is Array<[Error | null, unknown]>
    const incrResult = results?.[0];
    const count = incrResult !== undefined && incrResult !== null && incrResult[1] !== null
      ? (incrResult[1] as number)
      : 1;

    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const resetAt = windowStart + windowSeconds;

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);

    return { allowed, remaining, resetAt };
  }

  /**
   * Return the number of requests `userId` has left for `endpoint` in the
   * current window without incrementing the counter.
   *
   * @param userId        Unique user identifier
   * @param endpoint      API endpoint identifier
   * @param limit         Maximum requests allowed per `windowSeconds`
   * @param windowSeconds Duration of the time window in seconds
   */
  async getRemainingRequests(
    userId: string,
    endpoint: string,
    limit: number,
    windowSeconds: number,
  ): Promise<number> {
    const key = buildKey(userId, endpoint, windowSeconds);
    const raw = await this.redis.get(key);
    if (raw === null) return limit;
    const count = parseInt(raw, 10);
    return Math.max(0, limit - count);
  }
}

/**
 * Create a `RateLimiter` instance backed by the provided ioredis client.
 */
export function createRateLimiter(redis: Redis): RateLimiter {
  return new RateLimiter(redis);
}
