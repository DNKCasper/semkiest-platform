import { z } from 'zod';
import { databaseEnvSchema } from './database';
import { redisEnvSchema } from './redis';

/**
 * Environment variable schema for the BullMQ worker process.
 * Extends database and Redis schemas since workers process jobs and persist results.
 */
export const workerEnvSchema = databaseEnvSchema.merge(redisEnvSchema).merge(
  z.object({
    /**
     * Node.js environment.
     * Controls error verbosity, logging level, and other environment-specific behavior.
     * Default: "development"
     */
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),

    /**
     * Log level for the worker logger.
     * Default: "info"
     */
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /**
     * Number of concurrent job processors per worker instance.
     * Higher concurrency increases throughput but also memory/CPU usage.
     * Default: 5
     */
    WORKER_CONCURRENCY: z
      .string()
      .regex(/^\d+$/, 'WORKER_CONCURRENCY must be a positive integer')
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .default('5'),

    /**
     * Comma-separated list of queue names this worker instance processes.
     * Example: "email,notifications,exports"
     * Default: processes all queues
     */
    WORKER_QUEUES: z
      .string()
      .min(1)
      .transform((v) => v.split(',').map((q) => q.trim()))
      .optional(),

    /**
     * Internal API base URL for workers that need to call back into the API.
     * Example: http://api:3001
     */
    API_BASE_URL: z
      .string()
      .url('API_BASE_URL must be a valid URL')
      .optional(),

    /**
     * Internal API key for worker-to-API authentication.
     * Must match INTERNAL_API_KEY in the API server config.
     */
    INTERNAL_API_KEY: z.string().min(16).optional(),
  }),
);

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/**
 * Validates and returns typed worker environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 * Call this once at process startup before initializing BullMQ workers.
 */
export function parseWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = workerEnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `[shared-config] Invalid worker environment variables:\n${messages}\n` +
        `Please check your .env file or environment configuration.`,
    );
  }

  return result.data;
}
