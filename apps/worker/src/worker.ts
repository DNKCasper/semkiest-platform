import { Worker, type Job, type Processor } from 'bullmq';
import { config } from './config';
import {
  redisConnection,
  deadLetterQueue,
  publishProgress,
  queueRegistry,
} from './queue';
import {
  exploreProcessor,
  specReadProcessor,
  uiTestProcessor,
  visualTestProcessor,
} from './processors';
import { Logger } from './logger';
import type { JobResult, AgentJobType } from './jobs/types';
import type { ExploreJobPayload } from './jobs/explore';
import type { SpecReadJobPayload } from './jobs/spec-read';
import type { UiTestJobPayload } from './jobs/ui-test';
import type { VisualTestJobPayload } from './jobs/visual-test';
import type { AgentQueueName } from './jobs/index';

const logger = new Logger(config.logLevel, { service: 'worker' });

// ---------------------------------------------------------------------------
// Dead-letter helper
// ---------------------------------------------------------------------------

/**
 * Move a permanently-failed job to the dead letter queue for later inspection.
 * Only called once all retry attempts have been exhausted.
 */
async function sendToDeadLetter(job: Job, error: Error): Promise<void> {
  try {
    await deadLetterQueue.add(
      `dlq:${job.queueName}:${job.name}`,
      {
        originalQueue: job.queueName,
        originalJobId: job.id,
        originalJobName: job.name,
        jobData: job.data,
        failedAt: new Date().toISOString(),
        errorMessage: error.message,
        errorStack: error.stack,
        attemptsMade: job.attemptsMade,
      },
      { removeOnFail: false },
    );
    logger.warn('Job moved to dead letter queue', {
      jobId: job.id,
      queue: job.queueName,
      error: error.message,
    });
  } catch (dlqError) {
    logger.error('Failed to send job to dead letter queue', {
      jobId: job.id,
      queue: job.queueName,
      dlqError: dlqError instanceof Error ? dlqError.message : String(dlqError),
    });
  }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

/**
 * Options for creating a typed agent worker.
 */
interface CreateWorkerOptions<T> {
  queueName: AgentQueueName;
  processor: (job: Job<T>) => Promise<JobResult>;
  concurrency: number;
}

/**
 * Create a BullMQ Worker with standard event handlers.
 * Each worker:
 * - Processes jobs with the provided `processor` function
 * - Publishes `JobProgressUpdate` events via Redis pub/sub
 * - Routes permanently-failed jobs to the dead letter queue
 * - Logs lifecycle events for observability
 */
function createWorker<T>({ queueName, processor, concurrency }: CreateWorkerOptions<T>): Worker<T> {
  const workerLogger = logger.child({ queue: queueName });

  const wrappedProcessor: Processor<T, JobResult> = async (job) => {
    workerLogger.info('Job started', { jobId: job.id, attempt: job.attemptsMade + 1 });
    const result = await processor(job);
    workerLogger.info('Job completed', { jobId: job.id, status: result.status });
    return result;
  };

  const worker = new Worker<T, JobResult>(queueName, wrappedProcessor, {
    connection: redisConnection,
    concurrency,
    prefix: config.redis.keyPrefix,
  });

  worker.on('completed', (job) => {
    workerLogger.debug('Job succeeded', {
      jobId: job.id,
      durationMs: job.returnvalue?.durationMs,
    });
  });

  worker.on('failed', async (job, error) => {
    if (!job) return;

    const attemptsRemaining = (job.opts.attempts ?? 3) - job.attemptsMade;

    workerLogger.warn('Job failed', {
      jobId: job.id,
      attempt: job.attemptsMade,
      attemptsRemaining,
      error: error.message,
    });

    // Publish failure progress so subscribers know the job stopped
    await publishProgress({
      jobId: job.id ?? '',
      jobType: queueName as AgentJobType,
      percentage: -1,
      message: `Job failed: ${error.message}`,
      timestamp: Date.now(),
    });

    // All retries exhausted — move to DLQ
    if (attemptsRemaining <= 0) {
      await sendToDeadLetter(job, error);
    }
  });

  worker.on('error', (error) => {
    workerLogger.error('Worker error', { error: error.message });
  });

  worker.on('stalled', (jobId) => {
    workerLogger.warn('Job stalled', { jobId });
  });

  return worker;
}

// ---------------------------------------------------------------------------
// Worker registry
// ---------------------------------------------------------------------------

/** All active workers, keyed by queue name */
const workers: Map<AgentQueueName, Worker> = new Map();

/**
 * Spawn BullMQ workers for all (or a subset of) agent queues.
 *
 * @param queues - Which queues to activate; defaults to all agent queues
 */
export function startWorkers(queues?: AgentQueueName[]): void {
  const activeQueues: AgentQueueName[] =
    queues ??
    (Object.keys(queueRegistry) as AgentQueueName[]).filter((q) =>
      config.worker.queues ? config.worker.queues.includes(q) : true,
    );

  for (const queueName of activeQueues) {
    if (workers.has(queueName)) {
      logger.warn('Worker already running for queue — skipping', { queue: queueName });
      continue;
    }

    const concurrency = config.concurrencyByType[queueName as AgentJobType];

    let worker: Worker;

    switch (queueName) {
      case 'explore':
        worker = createWorker<ExploreJobPayload>({
          queueName,
          processor: exploreProcessor,
          concurrency,
        });
        break;
      case 'spec-read':
        worker = createWorker<SpecReadJobPayload>({
          queueName,
          processor: specReadProcessor,
          concurrency,
        });
        break;
      case 'ui-test':
        worker = createWorker<UiTestJobPayload>({
          queueName,
          processor: uiTestProcessor,
          concurrency,
        });
        break;
      case 'visual-test':
        worker = createWorker<VisualTestJobPayload>({
          queueName,
          processor: visualTestProcessor,
          concurrency,
        });
        break;
      default: {
        // Exhaustive check — TypeScript will warn if a new queue name is added
        // without updating this switch statement
        const _exhaustive: never = queueName;
        logger.error('Unknown queue name — cannot create worker', { queue: _exhaustive });
        continue;
      }
    }

    workers.set(queueName, worker);
    logger.info('Worker started', { queue: queueName, concurrency });
  }
}

/**
 * Gracefully stop all workers.
 * Waits for in-flight jobs to complete before closing connections.
 *
 * @param force - When `true`, jobs are abandoned immediately without waiting
 */
export async function stopWorkers(force = false): Promise<void> {
  const shutdownPromises = Array.from(workers.values()).map((worker) => worker.close(force));
  await Promise.all(shutdownPromises);
  workers.clear();
  logger.info('All workers stopped');
}

/** Return the set of currently active queue names */
export function getActiveQueues(): AgentQueueName[] {
  return Array.from(workers.keys());
}
