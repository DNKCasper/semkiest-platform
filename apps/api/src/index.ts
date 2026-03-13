import express from 'express';
import Redis from 'ioredis';
import { parseApiEnv } from '@semkiest/shared-config';
import {
  createHelmetMiddleware,
  createCorsMiddleware,
  createTlsEnforcementMiddleware,
  requestIdMiddleware,
} from './middleware/security-headers';
import { createOrgRateLimiter } from './middleware/rate-limiter';

const env = parseApiEnv();

const app = express();

// ─── Infrastructure ───────────────────────────────────────────────────────────

const redis = new Redis(env.REDIS_URL, {
  keyPrefix: env.REDIS_KEY_PREFIX,
  maxRetriesPerRequest: env.REDIS_MAX_RETRIES,
  enableOfflineQueue: false,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  // Log but don't crash – rate limiter falls back to in-memory
  process.stderr.write(`[redis] connection error: ${err.message}\n`);
});

// ─── Global Middleware ────────────────────────────────────────────────────────

const isProduction = env.NODE_ENV === 'production';
const securityOptions = { corsOrigins: env.CORS_ORIGINS, isProduction };

// Request ID must be first so all downstream middleware can read req.id
app.use(requestIdMiddleware);

// TLS enforcement before any processing (redirect HTTP → HTTPS in prod)
app.use(createTlsEnforcementMiddleware({ isProduction }));

// Security headers
app.use(createHelmetMiddleware(securityOptions));

// CORS
app.use(createCorsMiddleware(securityOptions));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Per-organization rate limiting (applied globally; override per-route as needed)
app.use(
  createOrgRateLimiter(redis, {
    points: env.RATE_LIMIT_POINTS,
    duration: env.RATE_LIMIT_DURATION,
  }),
);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(env.PORT, env.HOST, () => {
  process.stdout.write(`[api] listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})\n`);
});

export { app };
