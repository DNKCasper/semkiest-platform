/**
 * Sentry integration for the worker process.
 *
 * Call `initWorkerSentry()` at the very start of the worker entry point,
 * before any BullMQ workers or other modules are initialised.
 */

import * as Sentry from '@sentry/node';

export interface WorkerSentryOptions {
  /** Sentry DSN. No-op when falsy — safe in development/test. */
  dsn: string | undefined;
  /** Environment tag attached to every event. */
  environment: string;
  /** Release identifier (e.g. git SHA). Links errors to source maps. */
  release?: string;
  /**
   * Fraction of job executions to sample for performance tracing (0.0–1.0).
   * Default: 0.1 in production, 1.0 otherwise.
   */
  tracesSampleRate?: number;
}

/** Whether Sentry has been initialised for this process. */
let initialised = false;

/**
 * Initialise Sentry for the BullMQ worker process.
 *
 * Also registers `uncaughtException` and `unhandledRejection` handlers so
 * that crashes are captured before the process exits.
 */
export function initWorkerSentry(options: WorkerSentryOptions): void {
  if (!options.dsn) return;
  if (initialised) return;

  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    tracesSampleRate:
      options.tracesSampleRate ?? (options.environment === 'production' ? 0.1 : 1.0),
  });

  process.on('uncaughtException', (err) => {
    Sentry.captureException(err, { extra: { source: 'uncaughtException' } });
    // Flush Sentry events before the process exits.
    void Sentry.close(2_000).finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    Sentry.captureException(reason, { extra: { source: 'unhandledRejection' } });
  });

  initialised = true;
}

/**
 * Capture a job-processing error with BullMQ job context attached.
 *
 * @param err     - The error thrown during job processing.
 * @param jobId   - BullMQ job ID.
 * @param jobName - BullMQ job / queue name.
 * @param data    - Job data payload (serialisable).
 */
export function captureJobError(
  err: unknown,
  jobId: string,
  jobName: string,
  data?: unknown,
): string {
  return Sentry.captureException(err, {
    tags: { jobName },
    extra: { jobId, jobName, jobData: data },
  });
}

/**
 * Flush all pending Sentry events and close the transport.
 * Call this during graceful shutdown to ensure events are delivered.
 */
export async function flushSentry(timeoutMs = 5_000): Promise<void> {
  await Sentry.close(timeoutMs);
}

/**
 * Capture a plain message (non-error) event.
 */
export function captureWorkerMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>,
): string {
  return Sentry.captureMessage(message, { level, extra: context });
}
