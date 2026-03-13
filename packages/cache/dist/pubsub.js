"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PubSubManager = void 0;
exports.createPubSubManager = createPubSubManager;
const ioredis_1 = __importDefault(require("ioredis"));
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
class PubSubManager {
    publisher;
    subscriber;
    callbacks = new Map();
    /**
     * @param publisher   An active ioredis client used for PUBLISH commands
     * @param redisConfig Configuration used to create the dedicated subscriber connection
     */
    constructor(publisher, redisConfig) {
        this.publisher = publisher;
        // Subscriber must be a separate connection — ioredis does not allow mixing
        // commands and subscribe mode on the same client.
        this.subscriber = new ioredis_1.default(redisConfig.url, {
            lazyConnect: true,
            retryStrategy: (times) => {
                const maxRetries = redisConfig.maxRetries ?? 10;
                if (times > maxRetries)
                    return null;
                const delay = Math.min((redisConfig.retryDelayMs ?? 100) * 2 ** (times - 1), redisConfig.maxRetryDelayMs ?? 30_000);
                return delay;
            },
        });
        this.subscriber.on('message', (channel, rawMessage) => {
            this.handleMessage(channel, rawMessage);
        });
        this.subscriber.on('error', (err) => {
            console.error('[PubSubManager] Subscriber error:', err.message);
        });
    }
    /** Connect the internal subscriber client. */
    async connect() {
        await this.subscriber.connect();
    }
    // ---------------------------------------------------------------------------
    // Subscribe / unsubscribe
    // ---------------------------------------------------------------------------
    /**
     * Subscribe to a channel and register a callback.
     *
     * Multiple callbacks can be registered for the same channel. The underlying
     * Redis SUBSCRIBE command is only issued once per channel.
     *
     * @param channel  One of the platform pub/sub channels
     * @param callback Invoked for every message received on `channel`
     */
    async subscribe(channel, callback) {
        const existing = this.callbacks.get(channel);
        if (existing === undefined) {
            this.callbacks.set(channel, new Set([callback]));
            await this.subscriber.subscribe(channel);
            console.info(`[PubSubManager] Subscribed to channel "${channel}".`);
        }
        else {
            existing.add(callback);
        }
    }
    /**
     * Remove a previously registered callback.
     *
     * If no callbacks remain for the channel the underlying Redis UNSUBSCRIBE
     * command is issued automatically.
     *
     * @param channel  Channel to remove the callback from
     * @param callback The exact callback reference passed to `subscribe`
     */
    async unsubscribe(channel, callback) {
        const callbacks = this.callbacks.get(channel);
        if (callbacks === undefined)
            return;
        callbacks.delete(callback);
        if (callbacks.size === 0) {
            this.callbacks.delete(channel);
            await this.subscriber.unsubscribe(channel);
            console.info(`[PubSubManager] Unsubscribed from channel "${channel}".`);
        }
    }
    // ---------------------------------------------------------------------------
    // Publish
    // ---------------------------------------------------------------------------
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
    async publish(channel, data) {
        const message = {
            channel,
            data,
            publishedAt: new Date().toISOString(),
        };
        return this.publisher.publish(channel, JSON.stringify(message));
    }
    // ---------------------------------------------------------------------------
    // Internal message dispatch
    // ---------------------------------------------------------------------------
    handleMessage(channel, rawMessage) {
        const callbacks = this.callbacks.get(channel);
        if (callbacks === undefined || callbacks.size === 0)
            return;
        let parsed;
        try {
            parsed = JSON.parse(rawMessage);
        }
        catch (err) {
            console.error(`[PubSubManager] Failed to parse message on channel "${channel}":`, err);
            return;
        }
        for (const cb of callbacks) {
            void Promise.resolve(cb(parsed)).catch((err) => {
                console.error(`[PubSubManager] Callback error on channel "${channel}":`, err);
            });
        }
    }
    // ---------------------------------------------------------------------------
    // Shutdown
    // ---------------------------------------------------------------------------
    /**
     * Unsubscribe from all channels and close the subscriber connection.
     * Should be called during graceful application shutdown.
     */
    async disconnect() {
        const channels = [...this.callbacks.keys()];
        if (channels.length > 0) {
            await this.subscriber.unsubscribe(...channels);
        }
        this.callbacks.clear();
        await this.subscriber.quit();
        console.info('[PubSubManager] Subscriber connection closed.');
    }
}
exports.PubSubManager = PubSubManager;
/**
 * Create a `PubSubManager`. Connects the internal subscriber client before
 * returning, so the instance is immediately ready for `subscribe` calls.
 *
 * @param publisher   Active ioredis client used for publishing
 * @param redisConfig Configuration used to open the dedicated subscriber connection
 */
async function createPubSubManager(publisher, redisConfig) {
    const manager = new PubSubManager(publisher, redisConfig);
    await manager.connect();
    return manager;
}
//# sourceMappingURL=pubsub.js.map