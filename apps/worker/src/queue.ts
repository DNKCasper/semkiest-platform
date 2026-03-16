import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config';
import {
  AGENT_QUEUES,
  DEAD_LETTER_QUEUE,
  COORDINATE_QUEUE,
  buildJobOptions,
  JobPriority,
  type AgentQueueName,
  type CoordinateJobPayload,
  type ExploreJobPayload,
  type SpecReadJobPayload,
  type UiTestJobPayload,
  type VisualTestJobPayload,
  type JobProgressUpdate,
  type RetryConfig,
  DEFAULT_RETRY_CONFIG,
} from './jobs';

// ---------------------------------------------------------------------------
// Redis connections
// ---------------------------------------------------------------------------

/**
 * Shared IORedis connection used by BullMQ queues and workers.
 * `maxRetriesPerRequest: null` is required by BullMQ for blocking commands.
 */
export const redisConnection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),
});

/**
 * Separate IORedis connection dedicated to Redis pub/sub publishing.
 * BullMQ connections enter subscriber mode, so a distinct client is needed.
 */
export const redisPubSub = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),
});

// ---------------------------------------------------------------------------
// Queue factory helpers
// ---------------------------------------------------------------------------

/** Options applied to every queue by default */
const SHARED_QUEUE_OPTIONS = {
  connection: redisConnection,
  prefix: config.redis.keyPrefix,
} as const;

function makeQueue<T>(name: string, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG): Queue<T> {
  return new Queue<T>(name, {
    ...SHARED_QUEUE_OPTIONS,
    defaultJobOptions: buildJobOptions(JobPriority.P3, retryConfig),
  });
}

// ---------------------------------------------------------------------------
// Agent queues
// ---------------------------------------------------------------------------

export const coordinateQueue = makeQueue<CoordinateJobPayload>(COORDINATE_QUEUE);
export const exploreQueue = makeQueue<ExploreJobPayload>('explore');
export const specReadQueue = makeQueue<SpecReadJobPayload>('spec-read');
export const uiTestQueue = makeQueue<UiTestJobPayload>('ui-test');
export const visualTestQueue = makeQueue<VisualTestJobPayload>('visual-test');

/**
 * All agent queues indexed by queue name.
 * Use `getQueue(name)` for safe access with a type-narrowed return.
 */
export const queueRegistry = {
  coordinate: coordinateQueue,
  explore: exploreQueue,
  'spec-read': specReadQueue,
  'ui-test': uiTestQueue,
  'visual-test': visualTestQueue,
} as Record<string, Queue>;

// ---------------------------------------------------------------------------
// Dead letter queue
// ---------------------------------------------------------------------------

/**
 * Dead letter queue for jobs that have permanently failed (all retries exhausted).
 * Failed jobs are preserved indefinitely for inspection and manual replay.
 */
export const deadLetterQueue = new Queue(DEAD_LETTER_QUEUE, {
  ...SHARED_QUEUE_OPTIONS,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false,
  },
});

// ---------------------------------------------------------------------------
// Enqueue helpers
// ---------------------------------------------------------------------------

/**
 * Enqueue a coordinate job (orchestrates a full multi-agent test run).
 *
 * @param payload - Job data including metadata, baseUrl, and profileId
 * @param retryConfig - Optional override for retry/backoff policy
 */
export async function enqueueCoordinateJob(
  payload: CoordinateJobPayload,
  retryConfig?: RetryConfig,
): Promise<string> {
  const job = await coordinateQueue.add(
    'coordinate',
    payload,
    buildJobOptions(payload.priority, retryConfig),
  );
  return job.id ?? '';
}

/**
 * Enqueue an explore job.
 *
 * @param payload - Job data including metadata and priority
 * @param retryConfig - Optional override for retry/backoff policy
 */
export async function enqueueExploreJob(
  payload: ExploreJobPayload,
  retryConfig?: RetryConfig,
): Promise<void> {
  await exploreQueue.add('explore', payload, buildJobOptions(payload.priority, retryConfig));
}

/**
 * Enqueue a spec-read job.
 */
export async function enqueueSpecReadJob(
  payload: SpecReadJobPayload,
  retryConfig?: RetryConfig,
): Promise<void> {
  await specReadQueue.add('spec-read', payload, buildJobOptions(payload.priority, retryConfig));
}

/**
 * Enqueue a ui-test job.
 */
export async function enqueueUiTestJob(
  payload: UiTestJobPayload,
  retryConfig?: RetryConfig,
): Promise<void> {
  await uiTestQueue.add('ui-test', payload, buildJobOptions(payload.priority, retryConfig));
}

/**
 * Enqueue a visual-test job.
 */
export async function enqueueVisualTestJob(
  payload: VisualTestJobPayload,
  retryConfig?: RetryConfig,
): Promise<void> {
  await visualTestQueue.add('visual-test', payload, buildJobOptions(payload.priority, retryConfig));
}

// ---------------------------------------------------------------------------
// Progress pub/sub
// ---------------------------------------------------------------------------

/**
 * Redis channel pattern for job progress: `{prefix}:progress:{queueName}:{jobId}`
 * Consumers subscribe to `{prefix}:progress:*` to receive all updates, or filter
 * by queue or job ID for finer-grained subscriptions.
 */
export function progressChannel(queueName: string, jobId: string): string {
  return `${config.redis.keyPrefix}:progress:${queueName}:${jobId}`;
}

/**
 * Publish a progress update to Redis pub/sub.
 * Listeners (e.g. the API gateway) receive structured `JobProgressUpdate` payloads.
 */
export async function publishProgress(update: JobProgressUpdate): Promise<void> {
  const channel = progressChannel(update.jobType, update.jobId);
  await redisPubSub.publish(channel, JSON.stringify(update));
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/**
 * Close all queue connections cleanly.
 * Call this during process shutdown to avoid hanging connections.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    ...AGENT_QUEUES.map((name) => queueRegistry[name]?.close()).filter(Boolean),
    deadLetterQueue.close(),
    redisConnection.quit(),
    redisPubSub.quit(),
  ]);
}
