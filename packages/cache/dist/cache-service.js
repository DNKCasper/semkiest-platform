"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
exports.createCacheService = createCacheService;
/**
 * Generic cache service wrapping an ioredis client.
 * All values are JSON-serialised before storage and deserialised on retrieval,
 * providing type-safe access with full generic support.
 */
class CacheService {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    // ---------------------------------------------------------------------------
    // Single-key operations
    // ---------------------------------------------------------------------------
    /**
     * Retrieve a cached value by key.
     * Returns `null` when the key does not exist or has expired.
     */
    async get(key) {
        const raw = await this.redis.get(key);
        if (raw === null)
            return null;
        return JSON.parse(raw);
    }
    /**
     * Store a value under `key`.
     *
     * @param key    Cache key
     * @param value  Value to store (will be JSON-serialised)
     * @param options Optional TTL and existence constraints
     */
    async set(key, value, options) {
        const serialised = JSON.stringify(value);
        if (options?.onlyIfNotExists === true) {
            if (options.ttlSeconds !== undefined) {
                await this.redis.set(key, serialised, 'EX', options.ttlSeconds, 'NX');
            }
            else {
                await this.redis.set(key, serialised, 'NX');
            }
        }
        else if (options?.ttlSeconds !== undefined) {
            await this.redis.set(key, serialised, 'EX', options.ttlSeconds);
        }
        else {
            await this.redis.set(key, serialised);
        }
    }
    /**
     * Store a value with an explicit TTL (seconds).
     * Convenience wrapper around `set` with `{ ttlSeconds }`.
     */
    async setWithTTL(key, value, ttlSeconds) {
        await this.set(key, value, { ttlSeconds });
    }
    /**
     * Delete one or more keys.
     * Returns the number of keys that were removed.
     */
    async del(keys) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        if (keyList.length === 0)
            return 0;
        return this.redis.del(...keyList);
    }
    /**
     * Check whether a key exists in the cache.
     */
    async exists(key) {
        const count = await this.redis.exists(key);
        return count > 0;
    }
    // ---------------------------------------------------------------------------
    // Multi-key operations
    // ---------------------------------------------------------------------------
    /**
     * Retrieve multiple values in a single round-trip.
     * Returns `null` for each key that does not exist.
     */
    async mget(keys) {
        if (keys.length === 0)
            return [];
        const raws = await this.redis.mget(...keys);
        return raws.map((raw) => (raw === null ? null : JSON.parse(raw)));
    }
    /**
     * Store multiple key-value pairs. Each entry may specify its own TTL.
     * Entries without a TTL are set without expiry using a pipeline for
     * efficiency; entries with a TTL are set via individual SETEX commands
     * in the same pipeline.
     */
    async mset(keyValuePairs) {
        if (keyValuePairs.length === 0)
            return;
        const pipeline = this.redis.pipeline();
        for (const { key, value, ttlSeconds } of keyValuePairs) {
            const serialised = JSON.stringify(value);
            if (ttlSeconds !== undefined) {
                pipeline.set(key, serialised, 'EX', ttlSeconds);
            }
            else {
                pipeline.set(key, serialised);
            }
        }
        await pipeline.exec();
    }
    // ---------------------------------------------------------------------------
    // Pattern-based operations
    // ---------------------------------------------------------------------------
    /**
     * Delete all keys matching `pattern` (e.g. `"user:*"`).
     *
     * Uses a cursor-based SCAN to avoid blocking the server on large keyspaces.
     * Returns the total number of deleted keys.
     */
    async invalidatePattern(pattern) {
        let cursor = '0';
        let deleted = 0;
        do {
            const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                deleted += await this.redis.del(...keys);
            }
        } while (cursor !== '0');
        return deleted;
    }
}
exports.CacheService = CacheService;
/**
 * Create a `CacheService` instance backed by the provided ioredis client.
 */
function createCacheService(redis) {
    return new CacheService(redis);
}
//# sourceMappingURL=cache-service.js.map