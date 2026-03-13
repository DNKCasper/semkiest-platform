import { parseWorkerEnv } from '@semkiest/shared-config/env/worker';
import type { AgentJobType } from './jobs/types';

/**
 * Parse and validate environment variables once at startup.
 * The process exits with a descriptive error if any required variable is missing.
 */
const env = parseWorkerEnv();

/**
 * Resolved, type-safe worker configuration.
 * Imported by queue, worker, and processor modules — never call `process.env` directly.
 */
export const config = {
  /** Node environment */
  env: env.NODE_ENV,

  /** Structured logger level */
  logLevel: env.LOG_LEVEL,

  redis: {
    /** Full Redis connection URL (redis:// or rediss://) */
    url: env.REDIS_URL,
    /** Key namespace prefix; prevents collisions when sharing a Redis instance */
    keyPrefix: env.REDIS_KEY_PREFIX,
    /** Max command retries before giving up */
    maxRetries: env.REDIS_MAX_RETRIES,
  },

  worker: {
    /** Total concurrent jobs across all queues on this process */
    concurrency: env.WORKER_CONCURRENCY,
    /**
     * Queues this worker instance handles.
     * `undefined` means the worker processes every registered queue.
     */
    queues: env.WORKER_QUEUES as string[] | undefined,
  },

  api: {
    /** Base URL for worker→API callbacks (e.g. http://api:3001) */
    baseUrl: env.API_BASE_URL as string | undefined,
    /** Shared secret for worker→API authentication */
    internalApiKey: env.INTERNAL_API_KEY as string | undefined,
  },

  /**
   * Per-agent-type concurrency limits.
   * Browser-driving agents (ui-test, visual-test) are capped lower because
   * they consume significantly more memory per concurrent job.
   */
  concurrencyByType: {
    explore: Math.max(1, Math.floor(env.WORKER_CONCURRENCY / 2)),
    'spec-read': Math.max(1, Math.floor(env.WORKER_CONCURRENCY / 2)),
    'ui-test': Math.max(1, Math.floor(env.WORKER_CONCURRENCY / 4)),
    'visual-test': Math.max(1, Math.floor(env.WORKER_CONCURRENCY / 4)),
  } satisfies Record<AgentJobType, number>,
};

export type WorkerConfig = typeof config;
