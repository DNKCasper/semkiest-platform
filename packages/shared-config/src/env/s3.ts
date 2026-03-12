import { z } from 'zod';

/**
 * Environment variable schema for S3-compatible object storage (AWS S3 or MinIO).
 * Used by services that need file storage (uploads, exports, etc.).
 */
export const s3EnvSchema = z.object({
  /**
   * S3 bucket name for storing application files.
   * Example: semkiest-uploads
   */
  S3_BUCKET: z.string().min(3, 'S3_BUCKET must be at least 3 characters').max(63, 'S3_BUCKET must be at most 63 characters'),

  /**
   * AWS region where the S3 bucket resides.
   * For MinIO local development, use a dummy value like "us-east-1".
   * Example: us-east-1
   */
  S3_REGION: z.string().min(1, 'S3_REGION is required'),

  /**
   * AWS/MinIO access key ID for authentication.
   */
  S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID is required'),

  /**
   * AWS/MinIO secret access key for authentication.
   * NEVER commit this value.
   */
  S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY is required'),

  /**
   * Custom S3-compatible endpoint URL.
   * Use this for MinIO or other S3-compatible services in local/staging environments.
   * Leave unset to use the default AWS S3 endpoint.
   * Example (MinIO): http://localhost:9000
   */
  S3_ENDPOINT: z
    .string()
    .url('S3_ENDPOINT must be a valid URL')
    .optional(),

  /**
   * Whether to force path-style S3 URLs (required for MinIO).
   * Set to "true" for MinIO, leave unset or "false" for AWS S3.
   * Default: false
   */
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),

  /**
   * Optional CDN or public base URL for serving S3 assets.
   * When set, public asset URLs use this base instead of the S3 URL.
   * Example: https://cdn.semkiest.com
   */
  S3_PUBLIC_URL: z
    .string()
    .url('S3_PUBLIC_URL must be a valid URL')
    .optional(),
});

export type S3Env = z.infer<typeof s3EnvSchema>;

/**
 * Validates and returns typed S3 environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
export function parseS3Env(env: NodeJS.ProcessEnv = process.env): S3Env {
  const result = s3EnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `[shared-config] Invalid S3 environment variables:\n${messages}\n` +
        `Please check your .env file or environment configuration.`,
    );
  }

  return result.data;
}
