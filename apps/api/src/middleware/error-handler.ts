/**
 * Global Express error-handling middleware.
 *
 * Formats unhandled errors into a consistent JSON response and prevents
 * leaking internal stack traces to clients in production.
 *
 * Registration order (apps/api/src/index.ts):
 *   1. sentryErrorMiddleware()  ← captures the error in Sentry
 *   2. errorHandler             ← this file; sends the HTTP response
 */

import type { Request, Response, NextFunction } from 'express';

/** Shape of every error response body returned by the API. */
export interface ApiErrorResponse {
  error: {
    message: string;
    code: string;
    /** Only present when NODE_ENV !== 'production'. */
    stack?: string;
  };
}

/** Base class for domain errors that carry an HTTP status code and machine-readable code. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** 400 Bad Request */
export class BadRequestError extends ApiError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
    this.name = 'BadRequestError';
  }
}

/** 401 Unauthorized */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/** 403 Forbidden */
export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/** 404 Not Found */
export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Catch-all error handler.
 *
 * Must be registered as the LAST middleware (after Sentry's error handler).
 * Four arguments are required so Express treats this as an error handler.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isDev = process.env['NODE_ENV'] !== 'production';

  if (err instanceof ApiError) {
    const body: ApiErrorResponse = {
      error: {
        message: err.message,
        code: err.code,
        ...(isDev && { stack: err.stack }),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected / untyped error — log it and return a generic 500.
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  const stack = err instanceof Error ? err.stack : undefined;

  const body: ApiErrorResponse = {
    error: {
      message: isDev ? message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(isDev && stack && { stack }),
    },
  };
  res.status(500).json(body);
}
