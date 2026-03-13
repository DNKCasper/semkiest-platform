import { z } from 'zod';

/**
 * Environment variable schema for Redis connection.
 * Used by BullMQ workers and any service that requires caching or pub/sub.
 */
export const redisEnvSchema = z.object({
  /**
   * Redis connection URL.
   * Format: redis://[:password@]HOST[:PORT][/DATABASE]
   * Example: redis://localhost:6379
   * With auth: redis://:mypassword@localhost:6379
   */
  REDIS_URL: z
    .string()
    .url('REDIS_URL must be a valid URL')
    .regex(/^rediss?:\/\//, 'REDIS_URL must use the redis:// or rediss:// protocol'),

  /**
   * Redis key prefix to namespace keys and avoid collisions.
   * Useful when sharing a Redis instance across environments.
   * Default: "semkiest"
   */
  REDIS_KEY_PREFIX: z.string().min(1).default('semkiest'),

  /**
   * Maximum number of retries when a Redis command fails.
   * Default: 3
   */
  REDIS_MAX_RETRIES: z
    .string()
    .regex(/^\d+$/, 'REDIS_MAX_RETRIES must be a positive integer')
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default('3'),
});

export type RedisEnv = z.infer<typeof redisEnvSchema>;

/**
 * Validates and returns typed Redis environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
export function parseRedisEnv(env: NodeJS.ProcessEnv = process.env): RedisEnv {
  const result = redisEnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `[shared-config] Invalid Redis environment variables:\n${messages}\n` +
        `Please check your .env file or environment configuration.`,
    );
  }

  return result.data;
}
