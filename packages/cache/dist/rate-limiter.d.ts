import type { Redis } from 'ioredis';
import type { RateLimitResult } from './types.js';
/**
 * Sliding-window rate limiter backed by Redis.
 *
 * Uses a fixed-window counter per user+endpoint combination. Each counter
 * expires automatically at the end of its time window.
 */
export declare class RateLimiter {
    private readonly redis;
    constructor(redis: Redis);
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
    checkRateLimit(userId: string, endpoint: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
    /**
     * Return the number of requests `userId` has left for `endpoint` in the
     * current window without incrementing the counter.
     *
     * @param userId        Unique user identifier
     * @param endpoint      API endpoint identifier
     * @param limit         Maximum requests allowed per `windowSeconds`
     * @param windowSeconds Duration of the time window in seconds
     */
    getRemainingRequests(userId: string, endpoint: string, limit: number, windowSeconds: number): Promise<number>;
}
/**
 * Create a `RateLimiter` instance backed by the provided ioredis client.
 */
export declare function createRateLimiter(redis: Redis): RateLimiter;
//# sourceMappingURL=rate-limiter.d.ts.map