import type { Request, Response, NextFunction } from 'express';

export interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: unknown;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express requires 4-argument signature to identify error middleware
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      message: err.message,
      ...(err.code !== undefined && { code: err.code }),
      ...(err.details !== undefined && { details: err.details }),
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected error — log and return 500
  process.stderr.write(
    JSON.stringify({ level: 'error', message: 'Unhandled error', error: String(err) }) + '\n',
  );

  res.status(500).json({ message: 'Internal server error' });
}
