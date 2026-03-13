import { z } from 'zod';

/**
 * Environment variable schema for the Figma integration.
 * Used by services that communicate with the Figma REST API.
 *
 * Token storage options (mutually exclusive, encrypted takes precedence):
 *   - FIGMA_ACCESS_TOKEN_ENCRYPTED + FIGMA_ENCRYPTION_KEY  (recommended for production)
 *   - FIGMA_ACCESS_TOKEN  (plain-text, suitable for local development only)
 */
export const figmaEnvSchema = z
  .object({
    /**
     * Plain-text Figma personal access token.
     * Generate at: https://www.figma.com/settings → Personal access tokens.
     *
     * NOT recommended for production. Prefer FIGMA_ACCESS_TOKEN_ENCRYPTED.
     */
    FIGMA_ACCESS_TOKEN: z.string().min(1).optional(),

    /**
     * AES-256-GCM encrypted Figma access token (JSON produced by encryptToken).
     * Must be used together with FIGMA_ENCRYPTION_KEY.
     */
    FIGMA_ACCESS_TOKEN_ENCRYPTED: z.string().min(1).optional(),

    /**
     * 32-byte hex-encoded encryption key used to decrypt FIGMA_ACCESS_TOKEN_ENCRYPTED.
     * REQUIRED when FIGMA_ACCESS_TOKEN_ENCRYPTED is set.
     * Generate with: openssl rand -hex 32
     * NEVER commit the real value.
     */
    FIGMA_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'FIGMA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
      .optional(),

    /**
     * Figma API base URL override.
     * Leave unset to use the default: https://api.figma.com/v1
     */
    FIGMA_API_BASE_URL: z
      .string()
      .url('FIGMA_API_BASE_URL must be a valid URL')
      .default('https://api.figma.com/v1'),

    /**
     * HTTP request timeout for Figma API calls, in milliseconds.
     * Default: 30000 (30 seconds)
     */
    FIGMA_API_TIMEOUT_MS: z
      .string()
      .regex(/^\d+$/, 'FIGMA_API_TIMEOUT_MS must be a positive integer')
      .transform(Number)
      .pipe(z.number().int().min(1000).max(120_000))
      .default('30000'),

    /**
     * Maximum number of retry attempts for rate-limited (429) or transient (5xx) errors.
     * Default: 3
     */
    FIGMA_API_MAX_RETRIES: z
      .string()
      .regex(/^\d+$/, 'FIGMA_API_MAX_RETRIES must be a non-negative integer')
      .transform(Number)
      .pipe(z.number().int().min(0).max(10))
      .default('3'),
  })
  .refine(
    (data) => {
      // At least one token form must be provided.
      return Boolean(data.FIGMA_ACCESS_TOKEN ?? data.FIGMA_ACCESS_TOKEN_ENCRYPTED);
    },
    {
      message:
        'Either FIGMA_ACCESS_TOKEN or FIGMA_ACCESS_TOKEN_ENCRYPTED must be set',
      path: ['FIGMA_ACCESS_TOKEN'],
    },
  )
  .refine(
    (data) => {
      // Encryption key is required when encrypted token is present.
      if (data.FIGMA_ACCESS_TOKEN_ENCRYPTED && !data.FIGMA_ENCRYPTION_KEY) {
        return false;
      }
      return true;
    },
    {
      message:
        'FIGMA_ENCRYPTION_KEY is required when FIGMA_ACCESS_TOKEN_ENCRYPTED is set',
      path: ['FIGMA_ENCRYPTION_KEY'],
    },
  );

export type FigmaEnv = z.infer<typeof figmaEnvSchema>;

/**
 * Validates and returns typed Figma environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 * Call this once at application startup before initialising the Figma client.
 */
export function parseFigmaEnv(env: NodeJS.ProcessEnv = process.env): FigmaEnv {
  const result = figmaEnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formErrors = result.error.flatten().formErrors;

    const fieldMessages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    const formMessages = formErrors.map((m) => `  - ${m}`).join('\n');
    const allMessages = [fieldMessages, formMessages].filter(Boolean).join('\n');

    throw new Error(
      `[shared-config] Invalid Figma environment variables:\n${allMessages}\n` +
        `Please check your .env file or environment configuration.`,
    );
  }

  return result.data;
}
