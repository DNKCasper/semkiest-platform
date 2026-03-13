/**
 * Express application factory.
 *
 * Creates and configures the Express app.  Keeping this separate from
 * `index.ts` makes the app easily importable in tests without binding to a
 * port.
 */
import express, { Application, Request, Response, NextFunction } from 'express';
import { exportRouter } from './routes/export';

export function createApp(): Application {
  const app = express();

  app.use(express.json());

  // ---- Routes --------------------------------------------------------------
  app.use('/api/v1', exportRouter);

  // ---- Health check --------------------------------------------------------
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ---- 404 handler ---------------------------------------------------------
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // ---- Global error handler ------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(500).json({ error: message });
  });

  return app;
}
