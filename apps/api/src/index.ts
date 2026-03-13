import express from 'express';
import cors from 'cors';
import { profilesRouter } from './routes/profiles';
import { errorHandler } from './middleware/error-handler';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(
  cors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  }),
);

app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: '@semkiest/api', timestamp: new Date().toISOString() });
});

app.use('/api/profiles', profilesRouter);

// ---------------------------------------------------------------------------
// Error handling (must be last)
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';

app.listen(port, host, () => {
  process.stdout.write(
    JSON.stringify({ level: 'info', message: `API server listening on ${host}:${port}` }) + '\n',
  );
});

export { app };
