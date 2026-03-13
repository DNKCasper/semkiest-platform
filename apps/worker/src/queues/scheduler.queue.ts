import { Queue, type ConnectionOptions } from 'bullmq';
import type { ScheduledTestJobData } from '@semkiest/shared-types';

/** Canonical queue name shared between the API scheduler and this worker. */
export const SCHEDULER_QUEUE_NAME = 'scheduled-tests';

/**
 * Creates and returns a BullMQ Queue instance for scheduled test jobs.
 *
 * @param connection - ioredis connection instance or connection options.
 */
export function createSchedulerQueue(connection: ConnectionOptions): Queue<ScheduledTestJobData> {
  return new Queue<ScheduledTestJobData>(SCHEDULER_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });
}
