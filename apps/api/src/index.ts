import express, { type Request, type Response, type NextFunction } from 'express';
import { Redis } from 'ioredis';
import { parseApiEnv, parseRedisEnv } from '@semkiest/shared-config';
import { schedulerService } from './services/scheduler';
import schedulesRouter from './routes/schedules';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------
const apiEnv = parseApiEnv();
const redisEnv = parseRedisEnv();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

app.use(express.json());

// Basic CORS middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  const origins = apiEnv.CORS_ORIGINS;
  const origin = Array.isArray(origins) ? origins.join(',') : origins;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-API-Key');
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/schedules', schedulesRouter);

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = 500;
  res.status(status).json({ message });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start(): Promise<void> {
  // Initialise Redis connection and scheduler
  const redis = new Redis(redisEnv.REDIS_URL, {
    maxRetriesPerRequest: null,
    keyPrefix: redisEnv.REDIS_KEY_PREFIX,
  });

  schedulerService.initialize(redis);

  // Recover any missed scheduled runs before accepting traffic
  try {
    await schedulerService.handleMissedSchedules();
  } catch (err) {
    console.error('[scheduler] Failed to handle missed schedules:', err);
  }

  const server = app.listen(apiEnv.PORT, apiEnv.HOST, () => {
    console.info(
      `[api] Server listening on http://${apiEnv.HOST}:${apiEnv.PORT} (${apiEnv.NODE_ENV})`,
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.info(`[api] Received ${signal}, shutting down…`);
    server.close(async () => {
      await schedulerService.shutdown();
      await redis.quit();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[api] Fatal startup error:', err);
  process.exit(1);
});

export default app;
