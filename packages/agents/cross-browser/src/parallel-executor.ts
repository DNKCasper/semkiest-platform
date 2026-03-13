/**
 * ParallelExecutor — lightweight concurrency-limited task runner.
 *
 * Executes an arbitrary list of async tasks in parallel while honouring a
 * maximum concurrency limit. Each task result is captured individually so
 * one failure does not abort the remaining tasks.
 */

/** A single unit of work to be executed */
export interface ExecutionTask<TResult> {
  /** Unique identifier for this task (used to correlate results) */
  id: string;
  /** The async work to perform */
  execute: () => Promise<TResult>;
}

/** Outcome of a single {@link ExecutionTask} */
export interface ExecutionResult<TResult> {
  /** Mirrors {@link ExecutionTask.id} */
  id: string;
  /** Populated when the task completed successfully */
  result?: TResult;
  /** Populated when the task threw */
  error?: Error;
  /** Wall-clock duration of this task in milliseconds */
  durationMs: number;
}

/**
 * Runs a list of async tasks with a bounded concurrency window.
 *
 * Tasks are dispatched in arrival order; once a slot opens (a running task
 * resolves or rejects) the next pending task is started immediately.
 * Individual task failures are captured inside {@link ExecutionResult} and do
 * not prevent remaining tasks from running.
 */
export class ParallelExecutor {
  private readonly concurrency: number;

  /**
   * @param concurrency - Maximum number of tasks running simultaneously (default: 3)
   */
  constructor(concurrency: number = 3) {
    if (concurrency < 1) {
      throw new RangeError('concurrency must be at least 1');
    }
    this.concurrency = concurrency;
  }

  /**
   * Execute all supplied tasks with bounded parallelism.
   *
   * @param tasks - Tasks to run
   * @returns Results in the same order as the input task array
   */
  async execute<TResult>(
    tasks: ExecutionTask<TResult>[],
  ): Promise<ExecutionResult<TResult>[]> {
    if (tasks.length === 0) return [];

    const results: ExecutionResult<TResult>[] = new Array(tasks.length);
    let nextIndex = 0;

    /**
     * Worker loop: picks the next available task, runs it, and loops until the
     * queue is exhausted. Each worker corresponds to one concurrency slot.
     */
    const worker = async (): Promise<void> => {
      while (nextIndex < tasks.length) {
        const taskIndex = nextIndex;
        nextIndex += 1;

        const task = tasks[taskIndex];
        const start = Date.now();

        try {
          const result = await task.execute();
          results[taskIndex] = { id: task.id, result, durationMs: Date.now() - start };
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          results[taskIndex] = { id: task.id, error, durationMs: Date.now() - start };
        }
      }
    };

    // Spin up min(concurrency, tasks.length) workers and wait for all to finish
    const workers = Array.from(
      { length: Math.min(this.concurrency, tasks.length) },
      worker,
    );

    await Promise.all(workers);
    return results;
  }
}
