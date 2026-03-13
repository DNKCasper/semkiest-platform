/**
 * Sentry integration for the API server.
 *
 * Call `initSentry()` at process startup BEFORE creating the Express app.
 * Then register `sentryErrorMiddleware()` AFTER all route handlers so that it
 * captures any unhandled errors propagated via `next(err)`.
 */

import * as Sentry from '@sentry/node';
import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';

export interface SentryInitOptions {
  /** Sentry DSN. When undefined or empty, Sentry is not initialized (safe in development). */
  dsn: string | undefined;
  /** Application environment tag sent with every event. */
  environment: string;
  /** Release version string (e.g. git SHA). Used to associate errors with source maps. */
  release?: string;
  /**
   * Fraction of transactions to sample for performance tracing (0.0–1.0).
   * Default: 0.2 in production, 1.0 otherwise.
   */
  tracesSampleRate?: number;
}

/**
 * Initialize Sentry SDK.
 *
 * Must be called before any other `@sentry/node` imports are used.
 * No-ops when `options.dsn` is falsy — safe to call in all environments.
 */
export function initSentry(options: SentryInitOptions): void {
  if (!options.dsn) return;

  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    tracesSampleRate:
      options.tracesSampleRate ?? (options.environment === 'production' ? 0.2 : 1.0),
  });
}

/**
 * Express error-handling middleware that captures exceptions in Sentry.
 *
 * Register this AFTER all routes and other middleware:
 * ```ts
 * app.use(routes);
 * app.use(sentryErrorMiddleware());
 * app.use(errorHandler);
 * ```
 */
export function sentryErrorMiddleware(): ErrorRequestHandler {
  // Four-argument signature is required for Express to recognise this as an error handler.
  return (err: unknown, _req: Request, _res: Response, next: NextFunction): void => {
    Sentry.captureException(err);
    next(err);
  };
}

/**
 * Capture an exception manually outside of the request lifecycle.
 *
 * @param err     - The error or value to report.
 * @param context - Optional extra key-value pairs attached to the event.
 * @returns The Sentry event ID.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): string {
  return Sentry.captureException(err, { extra: context });
}

/**
 * Set the authenticated user on the current Sentry scope.
 * Attach as route middleware after your authentication middleware.
 */
export function setSentryUser(
  req: Request & { user?: { id: string; email?: string } },
  _res: Response,
  next: NextFunction,
): void {
  if (req.user?.id) {
    Sentry.setUser({ id: req.user.id, email: req.user.email });
  }
  next();
}
