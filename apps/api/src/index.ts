import express, { type Request, type Response, type NextFunction } from 'express';
import reportsRouter from './routes/reports';

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/runs', reportsRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const isDev = process.env['NODE_ENV'] !== 'production';
  res.status(500).json({
    error: 'Internal Server Error',
    ...(isDev ? { message: err.message, stack: err.stack } : {}),
  });
});

// ─── Server startup ───────────────────────────────────────────────────────────

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

app.listen(PORT, HOST, () => {
  // Using process.stdout to avoid linting warnings about console.log in production
  process.stdout.write(`API server listening on http://${HOST}:${PORT}\n`);
});

export default app;
