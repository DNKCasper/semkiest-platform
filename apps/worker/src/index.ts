import { parseWorkerEnv } from '@semkiest/shared-config/env/worker';
import { initWorkerSentry, flushSentry } from './sentry';
import { WorkerPool } from './crash-recovery';

const env = parseWorkerEnv();

// Initialise Sentry before any workers start.
initWorkerSentry({
  dsn: process.env['SENTRY_DSN'],
  environment: env.NODE_ENV,
  release: process.env['SENTRY_RELEASE'],
});

const [redisHost, redisPort] = (() => {
  try {
    const url = new URL(env.REDIS_URL);
    return [url.hostname, Number(url.port) || 6379] as const;
  } catch {
    return ['localhost', 6379] as const;
  }
})();

const pool = new WorkerPool({
  connection: { host: redisHost, port: redisPort },
  maxRestarts: 3,
  restartDelayMs: 5_000,
  onRestart: (queueName, attempt) => {
    // eslint-disable-next-line no-console
    console.warn(`[worker] Restarting processor for queue "${queueName}" (attempt ${attempt})`);
  },
  onFatalCrash: (queueName, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker] Fatal crash in queue "${queueName}":`, err);
  },
});

// ── Queue registrations go here ──────────────────────────────────────────────
// pool.add('my-queue', async (job) => { ... });

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] Received ${signal}, shutting down…`);
  await pool.closeAll();
  await flushSentry();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// eslint-disable-next-line no-console
console.log(`[worker] Started [${env.NODE_ENV}] — concurrency: ${env.WORKER_CONCURRENCY}`);
