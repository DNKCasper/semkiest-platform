import { z } from 'zod';

/**
 * Environment variable schema for the Jira integration.
 * Used by services that create or update Jira issues (API server, workers).
 */
export const jiraEnvSchema = z.object({
  /**
   * Atlassian base URL for the Jira instance.
   * Example: https://your-domain.atlassian.net
   */
  JIRA_BASE_URL: z
    .string()
    .url('JIRA_BASE_URL must be a valid URL')
    .regex(/atlassian\.net|jira\./, 'JIRA_BASE_URL should be an Atlassian or Jira URL')
    .optional(),

  /**
   * Atlassian account email used for Basic auth with the API token.
   * Example: admin@example.com
   */
  JIRA_EMAIL: z
    .string()
    .email('JIRA_EMAIL must be a valid email address')
    .optional(),

  /**
   * Jira API token (generated at id.atlassian.com/manage/api-tokens).
   * REQUIRED when JIRA_BASE_URL and JIRA_EMAIL are set.
   * NEVER commit the real value.
   */
  JIRA_API_TOKEN: z
    .string()
    .min(1, 'JIRA_API_TOKEN must not be empty')
    .optional(),

  /**
   * Default Jira project key used when no per-workspace key is configured.
   * Example: SEM
   */
  JIRA_DEFAULT_PROJECT_KEY: z
    .string()
    .regex(/^[A-Z][A-Z0-9]+$/, 'JIRA_DEFAULT_PROJECT_KEY must be uppercase alphanumeric')
    .optional(),

  /**
   * 64-character (256-bit) hex-encoded key used to encrypt Jira API tokens
   * before storing them in the database.
   * Generate with: openssl rand -hex 32
   * NEVER commit the real value.
   */
  JIRA_TOKEN_ENCRYPTION_KEY: z
    .string()
    .length(64, 'JIRA_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (256-bit key)')
    .regex(/^[0-9a-f]+$/i, 'JIRA_TOKEN_ENCRYPTION_KEY must be a hex string')
    .optional(),
});

export type JiraEnv = z.infer<typeof jiraEnvSchema>;

/**
 * Validates and returns typed Jira environment variables.
 * Returns an empty (all-optional) object when no Jira variables are set.
 * Throws a descriptive error if any provided variable is invalid.
 */
export function parseJiraEnv(env: NodeJS.ProcessEnv = process.env): JiraEnv {
  const result = jiraEnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `[shared-config] Invalid Jira environment variables:\n${messages}\n` +
        `Please check your .env file or environment configuration.`,
    );
  }

  return result.data;
}
