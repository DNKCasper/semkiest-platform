import { z } from 'zod';

/**
 * Environment variable schema for the Next.js web dashboard.
 *
 * IMPORTANT: Only include variables that are safe to expose to the browser
 * via NEXT_PUBLIC_ prefix, or server-side only variables used in
 * Next.js Server Components / API Routes.
 *
 * Never put secrets (JWT_SECRET, database passwords, etc.) here.
 */
export const webEnvSchema = z.object({
  /**
   * Node.js environment.
   * Automatically set by Next.js based on the build/start command.
   * Default: "development"
   */
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),

  /**
   * Public-facing base URL of the web application.
   * Used for generating absolute URLs in SSR, emails, and redirects.
   * Example: https://app.semkiest.com
   */
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL'),

  /**
   * Public-facing base URL of the API server.
   * Used by client-side code for API requests.
   * Example: https://api.semkiest.com  or  http://localhost:3001
   */
  NEXT_PUBLIC_API_URL: z
    .string()
    .url('NEXT_PUBLIC_API_URL must be a valid URL'),

  /**
   * Internal API base URL used only in Next.js Server Components and API Routes.
   * Can use Docker internal hostnames when running in containers.
   * Example: http://api:3001
   */
  API_INTERNAL_URL: z
    .string()
    .url('API_INTERNAL_URL must be a valid URL')
    .optional(),

  /**
   * NextAuth.js secret for signing session tokens.
   * Required when using NextAuth. NEVER commit the real value.
   * Minimum 32 characters.
   */
  NEXTAUTH_SECRET: z
    .string()
    .min(32, 'NEXTAUTH_SECRET must be at least 32 characters')
    .optional(),

  /**
   * NextAuth.js canonical URL (used in OAuth callbacks).
   * Must match NEXT_PUBLIC_APP_URL in most setups.
   * Example: https://app.semkiest.com
   */
  NEXTAUTH_URL: z
    .string()
    .url('NEXTAUTH_URL must be a valid URL')
    .optional(),

  /**
   * Public S3/CDN base URL for serving user-uploaded assets.
   * Used by the frontend to build asset URLs without calling the API.
   * Example: https://cdn.semkiest.com
   */
  NEXT_PUBLIC_ASSETS_URL: z
    .string()
    .url('NEXT_PUBLIC_ASSETS_URL must be a valid URL')
    .optional(),

  /**
   * Feature flag: enable debug tooling in non-production environments.
   * Default: false
   */
  NEXT_PUBLIC_DEBUG: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

/**
 * Validates and returns typed web dashboard environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 *
 * In Next.js, call this in a server-side module (e.g., lib/env.ts) and export
 * the result. Do NOT call this in client components — use NEXT_PUBLIC_ vars directly.
 */
export function parseWebEnv(env: NodeJS.ProcessEnv = process.env): WebEnv {
  const result = webEnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `[shared-config] Invalid web dashboard environment variables:\n${messages}\n` +
        `Please check your .env.local file or environment configuration.`,
    );
  }

  return result.data;
}
