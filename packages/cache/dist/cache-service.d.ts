import type { Redis } from 'ioredis';
import type { CacheSetOptions, KeyValuePair } from './types.js';
/**
 * Generic cache service wrapping an ioredis client.
 * All values are JSON-serialised before storage and deserialised on retrieval,
 * providing type-safe access with full generic support.
 */
export declare class CacheService {
    private readonly redis;
    constructor(redis: Redis);
    /**
     * Retrieve a cached value by key.
     * Returns `null` when the key does not exist or has expired.
     */
    get<T>(key: string): Promise<T | null>;
    /**
     * Store a value under `key`.
     *
     * @param key    Cache key
     * @param value  Value to store (will be JSON-serialised)
     * @param options Optional TTL and existence constraints
     */
    set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>;
    /**
     * Store a value with an explicit TTL (seconds).
     * Convenience wrapper around `set` with `{ ttlSeconds }`.
     */
    setWithTTL<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
    /**
     * Delete one or more keys.
     * Returns the number of keys that were removed.
     */
    del(keys: string | string[]): Promise<number>;
    /**
     * Check whether a key exists in the cache.
     */
    exists(key: string): Promise<boolean>;
    /**
     * Retrieve multiple values in a single round-trip.
     * Returns `null` for each key that does not exist.
     */
    mget<T>(keys: string[]): Promise<(T | null)[]>;
    /**
     * Store multiple key-value pairs. Each entry may specify its own TTL.
     * Entries without a TTL are set without expiry using a pipeline for
     * efficiency; entries with a TTL are set via individual SETEX commands
     * in the same pipeline.
     */
    mset<T>(keyValuePairs: KeyValuePair<T>[]): Promise<void>;
    /**
     * Delete all keys matching `pattern` (e.g. `"user:*"`).
     *
     * Uses a cursor-based SCAN to avoid blocking the server on large keyspaces.
     * Returns the total number of deleted keys.
     */
    invalidatePattern(pattern: string): Promise<number>;
}
/**
 * Create a `CacheService` instance backed by the provided ioredis client.
 */
export declare function createCacheService(redis: Redis): CacheService;
//# sourceMappingURL=cache-service.d.ts.map