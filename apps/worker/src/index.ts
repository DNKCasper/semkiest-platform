import { Worker, Queue } from 'bullmq';
import type IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Placeholder queue — replace with real queues in later stories */
export const defaultQueue = new Queue('default', {
  connection: { url: REDIS_URL } as unknown as IORedis,
});

/** Placeholder worker — replace with real job handlers in later stories */
const worker = new Worker(
  'default',
  async (job) => {
    console.info(`[worker] Processing job ${job.id} of type ${job.name}`);
  },
  { connection: { url: REDIS_URL } as unknown as IORedis }
);

worker.on('completed', (job) => {
  console.info(`[worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err);
});

console.info('[worker] Worker process started');
