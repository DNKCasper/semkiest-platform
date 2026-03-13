import Redis from 'ioredis';
import {
  createDailyAggregationWorker,
  registerDailyAggregationSchedule,
} from './jobs/daily-aggregation';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

async function main(): Promise<void> {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  // Register repeatable schedule
  await registerDailyAggregationSchedule(connection);

  const concurrency = Number(process.env['WORKER_CONCURRENCY'] ?? 1);
  const worker = createDailyAggregationWorker(connection, concurrency);

  console.info('[worker] Daily aggregation worker started.');

  const shutdown = async (): Promise<void> => {
    console.info('[worker] Shutting down...');
    await worker.close();
    connection.disconnect();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
