import type { GatewayContext, MiddlewareFn, NextFunction } from './types.js';
import { RateLimitError } from '../types/index.js';

/**
 * Redis client interface (subset of ioredis).
 * Using an interface keeps the middleware testable without a real Redis instance.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  incrby(key: string, increment: number): Promise<number>;
  expireat(key: string, timestamp: number): Promise<number>;
  pipeline(): RedisPipeline;
}

export interface RedisPipeline {
  incrby(key: string, increment: number): RedisPipeline;
  expireat(key: string, timestamp: number): RedisPipeline;
  exec(): Promise<unknown>;
}

/** Monthly budget configuration for an organization */
export interface OrgBudgetConfig {
  /** Maximum tokens allowed per calendar month */
  monthlyTokenLimit: number;
}

export interface RateLimitingMiddlewareOptions {
  redis: RedisClient;
  /**
   * Returns the budget config for an organization.
   * Return `null` to allow unlimited usage.
   */
  getBudget(organizationId: string): Promise<OrgBudgetConfig | null>;
  /**
   * Redis key prefix. Defaults to "llm-gateway:rate-limit".
   */
  keyPrefix?: string;
  /**
   * Estimated tokens to reserve before the actual request completes.
   * The real usage is checked & updated after the response arrives.
   * Defaults to 0 (post-request enforcement only).
   */
  preRequestEstimate?: number;
}

/**
 * Generates the Redis key for monthly token usage.
 * Key format: `{prefix}:{orgId}:{YYYY-MM}`
 */
function buildMonthKey(prefix: string, organizationId: string, date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}:${organizationId}:${year}-${month}`;
}

/**
 * Returns the Unix timestamp (seconds) for the end of the current UTC month.
 * Used to set TTL on Redis keys so they expire automatically.
 */
function endOfMonthTimestamp(date: Date = new Date()): number {
  const endOfMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return Math.floor(endOfMonth.getTime() / 1000);
}

/**
 * Middleware that enforces per-organization monthly token budgets using Redis.
 *
 * Flow:
 * 1. Before the request: optionally check a pre-request estimate to fast-fail
 * 2. After the response: atomically increment the org's monthly counter
 * 3. If the new total exceeds the budget, throw `RateLimitError`
 *
 * Note: post-request enforcement means a request may succeed but push the org
 * slightly over budget. This is intentional — it avoids blocking on token
 * estimation before every request. Operators can set conservative budgets.
 */
export function createRateLimitingMiddleware(
  options: RateLimitingMiddlewareOptions,
): MiddlewareFn {
  const prefix = options.keyPrefix ?? 'llm-gateway:rate-limit';

  return async (ctx: GatewayContext, next: NextFunction): Promise<void> => {
    const { organizationId } = ctx.request.attribution;
    const budget = await options.getBudget(organizationId);

    // No budget configured — allow unlimited usage
    if (!budget) {
      await next();
      return;
    }

    const now = new Date();
    const key = buildMonthKey(prefix, organizationId, now);

    // Pre-request check (if estimate is configured)
    if (options.preRequestEstimate && options.preRequestEstimate > 0) {
      const currentRaw = await options.redis.get(key);
      const current = parseInt(currentRaw ?? '0', 10);

      if (current + options.preRequestEstimate > budget.monthlyTokenLimit) {
        throw new RateLimitError(organizationId, current, budget.monthlyTokenLimit);
      }
    }

    // Run the request
    await next();

    // Post-request: increment counter with actual usage
    if (!ctx.response) return;

    const tokensUsed = ctx.response.usage.totalTokens;
    const expireAt = endOfMonthTimestamp(now);

    const pipeline = options.redis.pipeline();
    pipeline.incrby(key, tokensUsed);
    pipeline.expireat(key, expireAt);
    await pipeline.exec();

    // Fetch the updated total to check against the budget
    const newTotalRaw = await options.redis.get(key);
    const newTotal = parseInt(newTotalRaw ?? '0', 10);

    if (newTotal > budget.monthlyTokenLimit) {
      // Log the overage but do NOT throw — the response already succeeded.
      // Throw on the *next* request instead (pre-request check will catch it).
      process.stderr.write(
        JSON.stringify({
          level: 'warn',
          message: 'llm-gateway: organization exceeded monthly token budget',
          organizationId,
          currentUsage: newTotal,
          limit: budget.monthlyTokenLimit,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
    }
  };
}

/**
 * Returns the current monthly token usage for an organization.
 * Useful for exposing usage stats in admin APIs.
 */
export async function getMonthlyTokenUsage(
  redis: RedisClient,
  organizationId: string,
  keyPrefix = 'llm-gateway:rate-limit',
  date: Date = new Date(),
): Promise<number> {
  const key = buildMonthKey(keyPrefix, organizationId, date);
  const raw = await redis.get(key);
  return parseInt(raw ?? '0', 10);
}
