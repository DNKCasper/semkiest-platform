import { parseApiEnv } from '@semkiest/shared-config/env/api';
import { initSentry, sentryErrorMiddleware } from './middleware/sentry';
import { errorHandler } from './middleware/error-handler';
import express from 'express';

const env = parseApiEnv();

// Sentry must be initialised before the app handles any requests.
initSentry({
  dsn: process.env['SENTRY_DSN'],
  environment: env.NODE_ENV,
  release: process.env['SENTRY_RELEASE'],
});

const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api' });
});

// ── Routes go here ──────────────────────────────────────────────────────────

// ── Error handling (must come after all routes) ──────────────────────────────
app.use(sentryErrorMiddleware());
app.use(errorHandler);

app.listen(env.PORT, env.HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on ${env.HOST}:${env.PORT} [${env.NODE_ENV}]`);
});

export default app;
