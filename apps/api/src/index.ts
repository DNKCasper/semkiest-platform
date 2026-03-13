import express from 'express';
import { authRouter } from './routes/auth.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Health check endpoint. Used by load balancers and monitoring systems.
 */
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/v1/auth', authRouter);

/**
 * Global error handler. Catches any unhandled errors from route handlers.
 */
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(500).json({ error: 'Internal server error' });
  },
);

const PORT = Number(process.env['PORT'] ?? 3000);

app.listen(PORT, () => {
  // Server is running — no log statement to avoid noise in production.
});

export { app };
