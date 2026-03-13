import type Redis from 'ioredis';
import type { AgentEvent, DeadLetterEvent } from './types';

/**
 * Manages a Redis sorted-set dead-letter queue (DLQ) for events whose handlers
 * threw an error.  Score = Unix timestamp in ms so entries are ordered by
 * failure time and can expire via a single key TTL.
 */
export class DeadLetterQueue {
  private readonly key: string;
  private readonly ttl: number;
  private readonly maxRetries: number;

  /**
   * @param redis      - shared Redis client used for DLQ writes / reads.
   * @param keyPrefix  - namespace prefix (e.g. "semkiest").
   * @param ttlSeconds - how long DLQ entries are retained (default 24 h).
   * @param maxRetries - maximum retry attempts before discarding (default 3).
   */
  constructor(
    private readonly redis: Redis,
    keyPrefix: string,
    ttlSeconds = 86_400,
    maxRetries = 3,
  ) {
    this.key = `${keyPrefix}:events:dead-letter`;
    this.ttl = ttlSeconds;
    this.maxRetries = maxRetries;
  }

  /**
   * Persist a failed delivery to the DLQ.
   */
  async push(event: AgentEvent, channel: string, error: unknown): Promise<void> {
    const entry: DeadLetterEvent = {
      originalEvent: event,
      failureReason: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
      retryCount: 0,
      channel,
    };

    await this.redis.zadd(this.key, Date.now(), JSON.stringify(entry));
    await this.redis.expire(this.key, this.ttl);
  }

  /**
   * Return up to `limit` dead-letter entries ordered oldest-first.
   */
  async list(limit = 100): Promise<DeadLetterEvent[]> {
    const items = await this.redis.zrange(this.key, 0, limit - 1);
    return items.map((item) => JSON.parse(item) as DeadLetterEvent);
  }

  /**
   * Remove a dead-letter entry by its raw JSON string (as returned from
   * `zrange`).  Callers that need to retry should call `retry()` instead.
   */
  async remove(rawEntry: string): Promise<void> {
    await this.redis.zrem(this.key, rawEntry);
  }

  /**
   * Re-publish the event at position `index` (0-based, oldest-first) if it
   * has not exceeded the retry limit.
   *
   * @param index    - position in the sorted set (oldest = 0).
   * @param publish  - callback that publishes the event back into the bus.
   * @returns `true` if the event was re-published, `false` if retries exhausted.
   */
  async retry(
    index: number,
    publish: (event: AgentEvent) => Promise<void>,
  ): Promise<boolean> {
    const items = await this.redis.zrange(this.key, index, index);
    const raw = items[0];
    if (!raw) return false;

    const entry = JSON.parse(raw) as DeadLetterEvent;
    await this.redis.zrem(this.key, raw);

    if (entry.retryCount >= this.maxRetries) {
      return false;
    }

    entry.retryCount += 1;
    await publish(entry.originalEvent);
    return true;
  }

  /**
   * Total number of events currently in the DLQ.
   */
  async count(): Promise<number> {
    return this.redis.zcard(this.key);
  }
}
