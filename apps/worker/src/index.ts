import { Redis } from 'ioredis';
import { parseWorkerEnv, parseRedisEnv } from '@semkiest/shared-config';
import { createSchedulerWorker } from './workers/scheduler.worker';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------
const workerEnv = parseWorkerEnv();
const redisEnv = parseRedisEnv();

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------
const redis = new Redis(redisEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
  keyPrefix: redisEnv.REDIS_KEY_PREFIX,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on('connect', () => console.info('[worker] Redis connected'));
redis.on('error', (err) => console.error('[worker] Redis error:', err));

// ---------------------------------------------------------------------------
// Start workers
// ---------------------------------------------------------------------------
const concurrency = workerEnv.WORKER_CONCURRENCY;

const schedulerWorker = createSchedulerWorker(
  redis as unknown as Parameters<typeof createSchedulerWorker>[0],
  concurrency,
);

console.info(`[worker] Scheduler worker started (concurrency=${concurrency})`);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown(signal: string): Promise<void> {
  console.info(`[worker] Received ${signal}, shutting down…`);
  await schedulerWorker.close();
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[worker] Uncaught exception:', err);
  shutdown('uncaughtException').catch(() => process.exit(1));
});
