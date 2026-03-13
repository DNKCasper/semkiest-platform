import { z } from 'zod';

/**
 * Environment variable schema for PostgreSQL database connection.
 * Used by the API server and worker processes that need direct DB access.
 */
export const databaseEnvSchema = z.object({
  /**
   * Full PostgreSQL connection URL.
   * Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
   * Example: postgresql://postgres:password@localhost:5432/semkiest?schema=public
   */
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid URL')
    .startsWith('postgresql://', 'DATABASE_URL must use the postgresql:// protocol'),

  /**
   * Direct PostgreSQL connection URL (bypasses PgBouncer).
   * Required for Prisma migrations. Falls back to DATABASE_URL if not set.
   * Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
   */
  DIRECT_URL: z
    .string()
    .url('DIRECT_URL must be a valid URL')
    .startsWith('postgresql://', 'DIRECT_URL must use the postgresql:// protocol')
    .optional(),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

/**
 * Validates and returns typed database environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
export function parseDatabaseEnv(env: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  const result = databaseEnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `[shared-config] Invalid database environment variables:\n${messages}\n` +
        `Please check your .env file or environment configuration.`,
    );
  }

  return result.data;
}
