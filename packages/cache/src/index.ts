/**
 * @sem/cache
 *
 * Redis connection manager, cache service abstraction, rate limiter, and
 * pub/sub manager for the SemkiEst platform.
 *
 * @example
 * ```ts
 * import { createRedisClient, createCacheService, createRateLimiter, createPubSubManager } from '@sem/cache';
 *
 * const redis = await createRedisClient();
 * const cache = createCacheService(redis.native);
 * const limiter = createRateLimiter(redis.native);
 * const pubsub = await createPubSubManager(redis.native, { url: process.env.REDIS_URL! });
 * ```
 */

// Connection management
export { RedisClient, createRedisClient, getRedisClient } from './redis-client.js';

// Cache service
export { CacheService, createCacheService } from './cache-service.js';

// Rate limiter
export { RateLimiter, createRateLimiter } from './rate-limiter.js';

// Pub/Sub
export { PubSubManager, createPubSubManager } from './pubsub.js';

// Types
export type {
  RedisConfig,
  RedisHealthStatus,
  CacheSetOptions,
  KeyValuePair,
  PubSubChannel,
  PubSubMessage,
  SubscriberCallback,
  RateLimitResult,
} from './types.js';

export { PUBSUB_CHANNELS } from './types.js';
