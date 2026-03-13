import Redis from 'ioredis';
import { DeadLetterQueue } from './dead-letter';
import type {
  AgentEvent,
  EventBusMetrics,
  EventHandler,
  EventType,
  SocketServer,
} from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface EventBusOptions {
  /** Redis connection URL (e.g. "redis://localhost:6379"). */
  redisUrl: string;
  /** Key prefix used for Redis channels and DLQ key (default: "semkiest"). */
  keyPrefix?: string;
  /** Dead-letter TTL in seconds (default: 86400 = 24 h). */
  deadLetterTtl?: number;
  /** Maximum retry attempts for DLQ events (default: 3). */
  maxRetries?: number;
  /**
   * Optional Socket.IO–compatible server for real-time dashboard streaming.
   * Accepts any object implementing the `SocketServer` interface so the
   * package has no hard runtime dependency on `socket.io`.
   */
  socketServer?: SocketServer;
}

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

/**
 * Central event bus for inter-agent communication.
 *
 * Internally uses two separate Redis connections (one for publishing,
 * one exclusively for subscribing) as required by the Redis pub/sub protocol.
 * Events are serialised as JSON over Redis channels named:
 *   `{keyPrefix}:events:{EventType}`
 *
 * Features:
 *  - Publish / subscribe with multiple handlers per event type.
 *  - Typed, validated events with correlation-ID propagation.
 *  - Dead-letter queue for failed handler invocations.
 *  - Optional Socket.IO streaming for real-time dashboard updates.
 *  - Runtime metrics (published, received, handled, failed, dead-letter).
 *  - Dynamic handler registration and deregistration.
 */
export class EventBus {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly handlers: Map<EventType, Set<EventHandler<AgentEvent>>>;
  private readonly deadLetterQueue: DeadLetterQueue;
  private readonly keyPrefix: string;
  private socketServer?: SocketServer;
  private subscribedChannels = new Set<string>();
  private messageListenerAttached = false;
  private metrics: EventBusMetrics;

  constructor(options: EventBusOptions) {
    this.keyPrefix = options.keyPrefix ?? 'semkiest';

    this.publisher = new Redis(options.redisUrl, { lazyConnect: true });
    this.subscriber = new Redis(options.redisUrl, { lazyConnect: true });

    this.handlers = new Map();
    this.socketServer = options.socketServer;

    this.deadLetterQueue = new DeadLetterQueue(
      this.publisher,
      this.keyPrefix,
      options.deadLetterTtl,
      options.maxRetries,
    );

    this.metrics = {
      publishedCount: 0,
      receivedCount: 0,
      handledCount: 0,
      failedCount: 0,
      deadLetterCount: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Open both Redis connections. Must be called before publish/subscribe. */
  async connect(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
  }

  /** Gracefully close both Redis connections. */
  async disconnect(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  /**
   * Publish an event to all subscribers.
   *
   * Serialises the event as JSON, sends it over the corresponding Redis
   * pub/sub channel, and (if configured) streams it to Socket.IO rooms.
   */
  async publish(event: AgentEvent): Promise<void> {
    const channel = this.getChannel(event.type);
    await this.publisher.publish(channel, JSON.stringify(event));
    this.metrics.publishedCount += 1;

    if (this.socketServer) {
      this.streamToSocket(event);
    }
  }

  // -------------------------------------------------------------------------
  // Subscribe
  // -------------------------------------------------------------------------

  /**
   * Register a handler for an event type.
   *
   * Multiple handlers can be registered for the same type; they are all
   * invoked in insertion order.  The returned function deregisters the
   * handler when called.
   *
   * @returns Unsubscribe function.
   */
  subscribe<T extends AgentEvent>(
    eventType: T['type'],
    handler: EventHandler<T>,
  ): () => void {
    const type = eventType as EventType;

    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    (this.handlers.get(type) as Set<EventHandler<AgentEvent>>).add(
      handler as EventHandler<AgentEvent>,
    );

    void this.ensureSubscribed(type);

    return () => {
      (this.handlers.get(type) as Set<EventHandler<AgentEvent>> | undefined)?.delete(
        handler as EventHandler<AgentEvent>,
      );
    };
  }

  // -------------------------------------------------------------------------
  // Dead-letter queue
  // -------------------------------------------------------------------------

  /** List dead-letter entries (oldest first, up to `limit`). */
  async getDeadLetterEvents(limit = 100) {
    return this.deadLetterQueue.list(limit);
  }

  /**
   * Retry a dead-letter event at the given 0-based index.
   * @returns `true` if the event was re-published.
   */
  async retryDeadLetterEvent(index: number): Promise<boolean> {
    return this.deadLetterQueue.retry(index, (event) => this.publish(event));
  }

  /** Total number of events currently in the dead-letter queue. */
  async deadLetterCount(): Promise<number> {
    return this.deadLetterQueue.count();
  }

  // -------------------------------------------------------------------------
  // Socket.IO integration
  // -------------------------------------------------------------------------

  /** Attach or replace the Socket.IO server used for real-time streaming. */
  setSocketServer(server: SocketServer): void {
    this.socketServer = server;
  }

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  /** Return a snapshot of current bus metrics. */
  getMetrics(): Readonly<EventBusMetrics> {
    return { ...this.metrics };
  }

  /** Reset all metric counters to zero. */
  resetMetrics(): void {
    this.metrics = {
      publishedCount: 0,
      receivedCount: 0,
      handledCount: 0,
      failedCount: 0,
      deadLetterCount: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getChannel(eventType: EventType): string {
    return `${this.keyPrefix}:events:${eventType}`;
  }

  private async ensureSubscribed(eventType: EventType): Promise<void> {
    const channel = this.getChannel(eventType);

    if (!this.subscribedChannels.has(channel)) {
      // Mark synchronously before awaiting to prevent duplicate subscriptions
      // when subscribe() is called multiple times before the first await resolves.
      this.subscribedChannels.add(channel);
      await this.subscriber.subscribe(channel);
    }

    if (!this.messageListenerAttached) {
      this.messageListenerAttached = true;
      this.subscriber.on('message', (ch: string, message: string) => {
        void this.handleMessage(ch, message);
      });
    }
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    this.metrics.receivedCount += 1;

    let event: AgentEvent;
    try {
      event = JSON.parse(message) as AgentEvent;
    } catch {
      this.metrics.failedCount += 1;
      return;
    }

    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        await handler(event);
        this.metrics.handledCount += 1;
      } catch (error) {
        this.metrics.failedCount += 1;
        await this.deadLetterQueue.push(event, channel, error);
        this.metrics.deadLetterCount += 1;
      }
    }
  }

  /**
   * Broadcast the event to the appropriate Socket.IO rooms.
   *
   * - `testrun:{testRunId}` room: targeted updates for clients watching a run.
   * - `agent:{EventType}` global event: clients subscribed to event type.
   */
  private streamToSocket(event: AgentEvent): void {
    if (!this.socketServer) return;

    const payload = event.payload as Record<string, unknown>;
    const testRunId = typeof payload['testRunId'] === 'string' ? payload['testRunId'] : null;

    if (testRunId) {
      this.socketServer.to(`testrun:${testRunId}`).emit('agent:event', event);
    }

    this.socketServer.emit(`agent:${event.type}`, event);
  }
}
