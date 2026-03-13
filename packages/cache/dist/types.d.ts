/**
 * Redis connection configuration options.
 */
export interface RedisConfig {
    /** Redis connection URL (e.g. redis://localhost:6379) */
    url: string;
    /** Maximum number of retry attempts before giving up */
    maxRetries?: number;
    /** Initial retry delay in milliseconds */
    retryDelayMs?: number;
    /** Maximum retry delay in milliseconds */
    maxRetryDelayMs?: number;
    /** Connection timeout in milliseconds */
    connectTimeoutMs?: number;
    /** Command timeout in milliseconds */
    commandTimeoutMs?: number;
    /** Optional password for authenticated Redis instances */
    password?: string;
    /** Optional TLS configuration */
    tls?: boolean;
}
/**
 * Health status of the Redis connection.
 */
export interface RedisHealthStatus {
    /** Whether the connection is currently alive */
    isAlive: boolean;
    /** Current connection state */
    status: 'connecting' | 'connect' | 'ready' | 'reconnecting' | 'close' | 'end';
    /** Latency in milliseconds (null if unavailable) */
    latencyMs: number | null;
    /** ISO timestamp of the last successful ping */
    lastPingAt: string | null;
}
/**
 * Result of a cache operation.
 */
export interface CacheSetOptions {
    /** Time to live in seconds */
    ttlSeconds?: number;
    /** Only set if key does not exist */
    onlyIfNotExists?: boolean;
}
/**
 * A key-value pair used for bulk set operations.
 */
export interface KeyValuePair<T = unknown> {
    key: string;
    value: T;
    ttlSeconds?: number;
}
/**
 * Pub/sub channel names used throughout the platform.
 */
export declare const PUBSUB_CHANNELS: {
    /** Real-time test run status updates */
    readonly TEST_PROGRESS: "test-progress";
    /** Agent online/offline notifications */
    readonly AGENT_STATUS: "agent-status";
    /** New test result available */
    readonly TEST_RESULT: "test-result";
};
/** Union type of all valid pub/sub channel names */
export type PubSubChannel = (typeof PUBSUB_CHANNELS)[keyof typeof PUBSUB_CHANNELS];
/**
 * A message published to a pub/sub channel.
 */
export interface PubSubMessage<T = unknown> {
    /** Channel this message was published on */
    channel: PubSubChannel;
    /** Message payload */
    data: T;
    /** ISO timestamp when the message was published */
    publishedAt: string;
}
/**
 * Subscriber callback invoked when a message arrives on a subscribed channel.
 */
export type SubscriberCallback<T = unknown> = (message: PubSubMessage<T>) => void | Promise<void>;
/**
 * Rate limiter result for a single check.
 */
export interface RateLimitResult {
    /** Whether the request is allowed (under the limit) */
    allowed: boolean;
    /** Remaining requests in the current window */
    remaining: number;
    /** Epoch seconds when the current window resets */
    resetAt: number;
}
//# sourceMappingURL=types.d.ts.map