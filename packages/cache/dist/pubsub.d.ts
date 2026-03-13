import Redis from 'ioredis';
import type { RedisConfig, PubSubChannel, SubscriberCallback } from './types.js';
/**
 * Manages Redis Pub/Sub channels.
 *
 * A dedicated subscriber connection is required (ioredis blocks a connection
 * once it enters subscribe mode). This class maintains a separate connection
 * for subscribers and reuses the caller-provided publisher client.
 *
 * ### Supported channels
 * - `test-progress`  — real-time test run status updates
 * - `agent-status`   — agent online/offline notifications
 * - `test-result`    — new test result available
 */
export declare class PubSubManager {
    private readonly publisher;
    private readonly subscriber;
    private readonly callbacks;
    /**
     * @param publisher   An active ioredis client used for PUBLISH commands
     * @param redisConfig Configuration used to create the dedicated subscriber connection
     */
    constructor(publisher: Redis, redisConfig: RedisConfig);
    /** Connect the internal subscriber client. */
    connect(): Promise<void>;
    /**
     * Subscribe to a channel and register a callback.
     *
     * Multiple callbacks can be registered for the same channel. The underlying
     * Redis SUBSCRIBE command is only issued once per channel.
     *
     * @param channel  One of the platform pub/sub channels
     * @param callback Invoked for every message received on `channel`
     */
    subscribe<T>(channel: PubSubChannel, callback: SubscriberCallback<T>): Promise<void>;
    /**
     * Remove a previously registered callback.
     *
     * If no callbacks remain for the channel the underlying Redis UNSUBSCRIBE
     * command is issued automatically.
     *
     * @param channel  Channel to remove the callback from
     * @param callback The exact callback reference passed to `subscribe`
     */
    unsubscribe<T>(channel: PubSubChannel, callback: SubscriberCallback<T>): Promise<void>;
    /**
     * Publish a message to `channel`.
     *
     * The message is wrapped in a `PubSubMessage` envelope that includes a
     * timestamp before being JSON-serialised.
     *
     * @param channel Channel to publish on
     * @param data    Payload to deliver to subscribers
     * @returns Number of subscribers that received the message
     */
    publish<T>(channel: PubSubChannel, data: T): Promise<number>;
    private handleMessage;
    /**
     * Unsubscribe from all channels and close the subscriber connection.
     * Should be called during graceful application shutdown.
     */
    disconnect(): Promise<void>;
}
/**
 * Create a `PubSubManager`. Connects the internal subscriber client before
 * returning, so the instance is immediately ready for `subscribe` calls.
 *
 * @param publisher   Active ioredis client used for publishing
 * @param redisConfig Configuration used to open the dedicated subscriber connection
 */
export declare function createPubSubManager(publisher: Redis, redisConfig: RedisConfig): Promise<PubSubManager>;
//# sourceMappingURL=pubsub.d.ts.map