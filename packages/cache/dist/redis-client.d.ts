import Redis from 'ioredis';
import type { RedisConfig, RedisHealthStatus } from './types.js';
/**
 * Manages a single Redis connection with automatic reconnection using
 * exponential backoff. Provides health-check utilities and graceful shutdown.
 */
export declare class RedisClient {
    private readonly client;
    private lastPingAt;
    constructor(config: RedisConfig);
    private registerEventListeners;
    /** Establish the Redis connection. */
    connect(): Promise<void>;
    /**
     * Perform a PING command and measure round-trip latency.
     * Updates the internal `lastPingAt` timestamp on success.
     */
    ping(): Promise<number>;
    /**
     * Return the current connection health including latency.
     * A failed PING results in `isAlive: false` and `latencyMs: null`.
     */
    getHealth(): Promise<RedisHealthStatus>;
    /**
     * Gracefully close the connection, waiting for in-flight commands to finish.
     */
    disconnect(): Promise<void>;
    /**
     * Forcefully close the connection without waiting for pending commands.
     * Use only during emergency shutdown.
     */
    forceDisconnect(): void;
    /** Expose the underlying ioredis instance for advanced usage. */
    get native(): Redis;
}
/**
 * Create and connect the process-wide default Redis client.
 * Calling this function more than once returns the existing client.
 *
 * @param config Redis configuration. Defaults to `REDIS_URL` environment variable.
 */
export declare function createRedisClient(config?: Partial<RedisConfig>): Promise<RedisClient>;
/**
 * Retrieve the existing default client without creating a new one.
 * Throws if `createRedisClient()` has not been called yet.
 */
export declare function getRedisClient(): RedisClient;
//# sourceMappingURL=redis-client.d.ts.map