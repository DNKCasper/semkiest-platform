import { z } from 'zod';
import { databaseEnvSchema } from './database';
import { redisEnvSchema } from './redis';

/**
 * Environment variable schema for the API server (Express/Fastify).
 * Extends database and Redis schemas since the API requires both.
 */
export const apiEnvSchema = databaseEnvSchema.merge(redisEnvSchema).merge(
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
     * TCP port the API server listens on.
     * Default: 3001
     */
    PORT: z
      .string()
      .regex(/^\d+$/, 'PORT must be a positive integer')
      .transform(Number)
      .pipe(z.number().int().min(1).max(65535))
      .default('3001'),

    /**
     * Hostname the API server binds to.
     * Use "0.0.0.0" to listen on all interfaces (required for Docker).
     * Default: "0.0.0.0"
     */
    HOST: z.string().min(1).default('0.0.0.0'),

    /**
     * Secret key used to sign and verify JWT tokens.
     * Must be a long, random string. NEVER commit the real value.
     * Minimum 32 characters.
     */
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 characters for security'),

    /**
     * JWT token expiration duration (parsed by the "ms" library).
     * Example: "7d" (7 days), "1h" (1 hour), "30m" (30 minutes)
     * Default: "7d"
     */
    JWT_EXPIRES_IN: z.string().min(1).default('7d'),

    /**
     * CORS allowed origins, comma-separated.
     * Example: "http://localhost:3000,https://app.semkiest.com"
     */
    CORS_ORIGINS: z
      .string()
      .min(1, 'CORS_ORIGINS is required')
      .transform((v) => v.split(',').map((o) => o.trim())),

    /**
     * Log level for the API server logger (pino/winston).
     * Default: "info" in production, "debug" in development.
     */
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /**
     * Optional API key for internal service-to-service authentication.
     * When set, internal endpoints require this key in the X-API-Key header.
     */
    INTERNAL_API_KEY: z.string().min(16).optional(),
  }),
);

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/**
 * Validates and returns typed API server environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 * Call this once at application startup before any other initialization.
 */
export function parseApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const result = apiEnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `[shared-config] Invalid API server environment variables:\n${messages}\n` +
        `Please check your .env file or environment configuration.`,
    );
  }

  return result.data;
}
