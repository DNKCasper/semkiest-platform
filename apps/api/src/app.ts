import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { qualityTrendsRouter } from './routes/quality-trends';

export function createApp(): Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/quality-trends', qualityTrendsRouter);

  // Generic error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: message });
  });

  return app;
}
