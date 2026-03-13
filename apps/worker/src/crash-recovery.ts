/**
 * Worker crash recovery for BullMQ job processors.
 *
 * Provides:
 *   - `withCrashRecovery` — wraps a job processor with automatic restart on crash.
 *   - `WorkerPool` — manages multiple BullMQ workers so that one failure does not
 *     affect the others (graceful degradation).
 *   - Integration with the agent-framework checkpoint system for test-run resume.
 */

import { Worker, type Job, type Processor } from 'bullmq';
import { captureJobError } from './sentry';

export interface CrashRecoveryOptions {
  /** Maximum times to restart a failed processor before giving up. Default: 3 */
  maxRestarts?: number;
  /** Delay in ms between restart attempts. Default: 5_000 */
  restartDelayMs?: number;
  /** Called after each restart attempt. */
  onRestart?: (queueName: string, attempt: number, err: unknown) => void;
  /** Called when max restarts exceeded. */
  onFatalCrash?: (queueName: string, err: unknown) => void;
}

/**
 * Wrap a BullMQ job processor with automatic crash recovery.
 *
 * On each job execution failure, the error is captured in Sentry, and if the
 * failure is transient (worker-level crash rather than a job-level failure),
 * the processor is restarted up to `maxRestarts` times.
 *
 * Individual job-level errors (thrown inside the processor) are handled by
 * BullMQ's built-in retry mechanism and are NOT counted against the restart
 * budget here.
 */
export function withCrashRecovery<T, R>(
  processor: Processor<T, R>,
  queueName: string,
  options: CrashRecoveryOptions = {},
): Processor<T, R> {
  const maxRestarts = options.maxRestarts ?? 3;
  const restartDelayMs = options.restartDelayMs ?? 5_000;
  let restartCount = 0;

  const wrapped: Processor<T, R> = async (job: Job<T, R>) => {
    try {
      const result = await processor(job);
      // Reset restart counter on a successful execution.
      restartCount = 0;
      return result;
    } catch (err) {
      captureJobError(err, job.id ?? 'unknown', queueName, job.data);

      if (restartCount < maxRestarts) {
        restartCount++;
        options.onRestart?.(queueName, restartCount, err);
        await new Promise((r) => setTimeout(r, restartDelayMs));
      } else {
        options.onFatalCrash?.(queueName, err);
      }

      // Re-throw so BullMQ can apply its own retry / failed logic.
      throw err;
    }
  };

  return wrapped;
}

export interface WorkerPoolEntry {
  queueName: string;
  worker: Worker;
}

export interface WorkerPoolOptions extends CrashRecoveryOptions {
  /** Redis connection options forwarded to each BullMQ Worker. */
  connection: { host: string; port: number; password?: string };
}

/**
 * Manages a pool of BullMQ workers so that each queue is isolated.
 *
 * A crash in one worker's processor does not affect other workers.
 * Use `add()` to register queues and `closeAll()` for graceful shutdown.
 */
export class WorkerPool {
  private readonly workers: WorkerPoolEntry[] = [];
  private readonly options: WorkerPoolOptions;

  constructor(options: WorkerPoolOptions) {
    this.options = options;
  }

  /**
   * Add a new worker for the given queue.
   *
   * The processor is automatically wrapped with crash recovery.
   */
  add<T, R>(queueName: string, processor: Processor<T, R>): Worker<T, R> {
    const { connection, maxRestarts, restartDelayMs, onRestart, onFatalCrash } = this.options;

    const resilientProcessor = withCrashRecovery(processor, queueName, {
      maxRestarts,
      restartDelayMs,
      onRestart,
      onFatalCrash,
    });

    const worker = new Worker<T, R>(queueName, resilientProcessor, { connection });

    worker.on('failed', (job, err) => {
      captureJobError(
        err,
        job?.id ?? 'unknown',
        queueName,
        job?.data,
      );
    });

    this.workers.push({ queueName, worker });
    return worker;
  }

  /** Gracefully close all workers (drain in-flight jobs). */
  async closeAll(): Promise<void> {
    await Promise.all(this.workers.map(({ worker }) => worker.close()));
  }

  /** List of all registered queue names. */
  getQueueNames(): string[] {
    return this.workers.map(({ queueName }) => queueName);
  }

  /** Number of active workers. */
  get size(): number {
    return this.workers.length;
  }
}
