import Redis, { type RedisOptions } from 'ioredis';
import type { RedisConfig, RedisHealthStatus } from './types.js';

const DEFAULT_MAX_RETRIES = 10;
const DEFAULT_RETRY_DELAY_MS = 100;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

/**
 * Manages a single Redis connection with automatic reconnection using
 * exponential backoff. Provides health-check utilities and graceful shutdown.
 */
export class RedisClient {
  private readonly client: Redis;
  private lastPingAt: string | null = null;

  constructor(config: RedisConfig) {
    const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const maxRetryDelayMs = config.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;

    const options: RedisOptions = {
      connectTimeout: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      commandTimeout: config.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,

      // Exponential backoff retry strategy
      retryStrategy: (times: number): number | null => {
        if (times > maxRetries) {
          return null; // Stop retrying
        }
        const delay = Math.min(retryDelayMs * 2 ** (times - 1), maxRetryDelayMs);
        return delay;
      },
    };

    if (config.password !== undefined) {
      options.password = config.password;
    }

    if (config.tls === true) {
      options.tls = {};
    }

    this.client = new Redis(config.url, options);
    this.registerEventListeners();
  }

  private registerEventListeners(): void {
    this.client.on('connect', () => {
      console.info('[RedisClient] Connection established.');
    });

    this.client.on('ready', () => {
      console.info('[RedisClient] Client ready.');
    });

    this.client.on('reconnecting', (delay: number) => {
      console.warn(`[RedisClient] Reconnecting in ${delay}ms…`);
    });

    this.client.on('error', (err: Error) => {
      console.error('[RedisClient] Error:', err.message);
    });

    this.client.on('close', () => {
      console.warn('[RedisClient] Connection closed.');
    });

    this.client.on('end', () => {
      console.warn('[RedisClient] Connection ended — no more reconnection attempts.');
    });
  }

  /** Establish the Redis connection. */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Perform a PING command and measure round-trip latency.
   * Updates the internal `lastPingAt` timestamp on success.
   */
  async ping(): Promise<number> {
    const start = Date.now();
    await this.client.ping();
    const latencyMs = Date.now() - start;
    this.lastPingAt = new Date().toISOString();
    return latencyMs;
  }

  /**
   * Return the current connection health including latency.
   * A failed PING results in `isAlive: false` and `latencyMs: null`.
   */
  async getHealth(): Promise<RedisHealthStatus> {
    const status = this.client.status as RedisHealthStatus['status'];
    let latencyMs: number | null = null;
    let isAlive = false;

    try {
      latencyMs = await this.ping();
      isAlive = true;
    } catch {
      // Connection is not healthy; latencyMs stays null
    }

    return {
      isAlive,
      status,
      latencyMs,
      lastPingAt: this.lastPingAt,
    };
  }

  /**
   * Gracefully close the connection, waiting for in-flight commands to finish.
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
    console.info('[RedisClient] Disconnected gracefully.');
  }

  /**
   * Forcefully close the connection without waiting for pending commands.
   * Use only during emergency shutdown.
   */
  forceDisconnect(): void {
    this.client.disconnect();
    console.warn('[RedisClient] Disconnected forcefully.');
  }

  /** Expose the underlying ioredis instance for advanced usage. */
  get native(): Redis {
    return this.client;
  }
}

let _defaultClient: RedisClient | undefined;

/**
 * Create and connect the process-wide default Redis client.
 * Calling this function more than once returns the existing client.
 *
 * @param config Redis configuration. Defaults to `REDIS_URL` environment variable.
 */
export async function createRedisClient(config?: Partial<RedisConfig>): Promise<RedisClient> {
  if (_defaultClient !== undefined) {
    return _defaultClient;
  }

  const redisUrl = config?.url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  _defaultClient = new RedisClient({
    url: redisUrl,
    ...config,
  });

  await _defaultClient.connect();

  // Register graceful shutdown handlers once
  const shutdown = async (): Promise<void> => {
    if (_defaultClient !== undefined) {
      await _defaultClient.disconnect();
      _defaultClient = undefined;
    }
  };

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  return _defaultClient;
}

/**
 * Retrieve the existing default client without creating a new one.
 * Throws if `createRedisClient()` has not been called yet.
 */
export function getRedisClient(): RedisClient {
  if (_defaultClient === undefined) {
    throw new Error(
      '[RedisClient] No client initialised. Call createRedisClient() first.',
    );
  }
  return _defaultClient;
}
