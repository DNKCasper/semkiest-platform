/**
 * Coordinate Queue Client — enqueues test-run orchestration jobs from the API.
 *
 * Uses ioredis directly to add jobs to the BullMQ-compatible coordinate queue.
 * This avoids requiring the bullmq package in the API at build time — the
 * worker process handles actual job consumption via its BullMQ Worker instance.
 *
 * At runtime on the server, bullmq IS available (it's in the monorepo) so we
 * dynamically import it. If the import fails (e.g. during typecheck), we fall
 * back to raw Redis commands that are compatible with BullMQ's data format.
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Queue constants
// ---------------------------------------------------------------------------

const COORDINATE_QUEUE = 'coordinate';
const REDIS_PREFIX = process.env['REDIS_KEY_PREFIX'] || 'semkiest';

// ---------------------------------------------------------------------------
// Payload type (mirrors apps/worker/src/jobs/coordinate.ts)
// ---------------------------------------------------------------------------

export interface CoordinateJobPayload {
  metadata: {
    projectId: string;
    testRunId: string;
    correlationId?: string;
  };
  baseUrl: string;
  profileId: string;
  agents?: string[];
  failureStrategy?: 'fail-fast' | 'continue-on-error' | 'retry-then-continue';
  globalTimeout?: number;
  priority?: number;
}

// ---------------------------------------------------------------------------
// BullMQ dynamic import (available at runtime in monorepo)
// ---------------------------------------------------------------------------

let _bullmqQueue: any = null;

async function getBullMQQueue(): Promise<any | null> {
  if (_bullmqQueue) return _bullmqQueue;

  try {
    // Dynamic import avoids hard TS dependency on bullmq
    const bullmq = await (Function('return import("bullmq")')() as Promise<any>);
    const Queue = bullmq.Queue;
    _bullmqQueue = new Queue(COORDINATE_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
    return _bullmqQueue;
  } catch {
    // bullmq not available — fall back to raw Redis
    return null;
  }
}

// ---------------------------------------------------------------------------
// Enqueue helper
// ---------------------------------------------------------------------------

/**
 * Enqueue a coordinate job for a test run.
 *
 * Tries to use BullMQ's Queue.add() for full compatibility. Falls back to
 * raw Redis commands if BullMQ is not importable.
 *
 * @returns The job ID
 */
export async function enqueueCoordinateJob(
  payload: CoordinateJobPayload,
): Promise<string> {
  // Try BullMQ first (preferred — handles all internal data structures correctly)
  const queue = await getBullMQQueue();
  if (queue) {
    const job = await queue.add('coordinate', payload, {
      priority: payload.priority ?? 3,
    });
    return job.id ?? '';
  }

  // Fallback: raw Redis commands compatible with BullMQ format
  return enqueueViaRedis(payload);
}

/**
 * Fallback: enqueue using raw Redis commands matching BullMQ's data format.
 */
async function enqueueViaRedis(payload: CoordinateJobPayload): Promise<string> {
  const redis = getRedis();
  const jobId = randomUUID();
  const queueKey = `${REDIS_PREFIX}:${COORDINATE_QUEUE}`;
  const timestamp = Date.now();

  const jobHash = {
    data: JSON.stringify(payload),
    opts: JSON.stringify({
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
      priority: payload.priority ?? 3,
    }),
    name: 'coordinate',
    timestamp: String(timestamp),
    delay: '0',
    priority: String(payload.priority ?? 3),
    processedOn: '0',
    attemptsMade: '0',
  };

  const pipeline = redis.pipeline();
  pipeline.hmset(`${queueKey}:${jobId}`, jobHash);
  pipeline.lpush(`${queueKey}:wait`, jobId);
  pipeline.publish(`${queueKey}:waiting@null`, jobId);
  await pipeline.exec();

  return jobId;
}

/**
 * Close queue and Redis connections (for graceful shutdown).
 */
export async function closeCoordinateQueue(): Promise<void> {
  if (_bullmqQueue) {
    try {
      await _bullmqQueue.close();
    } catch { /* ignore */ }
    _bullmqQueue = null;
  }
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
