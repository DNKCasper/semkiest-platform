import { z } from 'zod';

/**
 * Environment variable schema for Slack integration.
 * Required for both the slash command handler and interactive message handler.
 */
export const slackEnvSchema = z.object({
  /**
   * Slack Bot OAuth token (starts with xoxb-).
   * Used to authenticate API calls to Slack (posting messages, etc.).
   * Obtain from: https://api.slack.com/apps → OAuth & Permissions → Bot User OAuth Token
   */
  SLACK_BOT_TOKEN: z
    .string()
    .min(1, 'SLACK_BOT_TOKEN is required')
    .regex(/^xoxb-/, 'SLACK_BOT_TOKEN must start with xoxb-'),

  /**
   * Slack Signing Secret used to verify that requests originate from Slack.
   * Obtain from: https://api.slack.com/apps → Basic Information → Signing Secret
   * NEVER commit the real value.
   */
  SLACK_SIGNING_SECRET: z
    .string()
    .min(1, 'SLACK_SIGNING_SECRET is required'),

  /**
   * Internal API base URL that the Slack integration uses to trigger test runs.
   * Example: http://localhost:3001 or http://api:3001 (Docker internal hostname)
   * Default: http://localhost:3001
   */
  SEMKIEST_API_URL: z.string().url().default('http://localhost:3001'),

  /**
   * Internal API key for authenticating requests from the Slack integration to the API server.
   * Must match INTERNAL_API_KEY set on the API server.
   * Leave blank to disable internal key auth.
   */
  SEMKIEST_INTERNAL_API_KEY: z.string().min(16).optional(),
});

export type SlackEnv = z.infer<typeof slackEnvSchema>;

/**
 * Validates and returns typed Slack environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
export function parseSlackEnv(env: NodeJS.ProcessEnv = process.env): SlackEnv {
  const result = slackEnvSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `[shared-config] Invalid Slack environment variables:\n${messages}\n` +
        `Please check your .env file or environment configuration.`,
    );
  }

  return result.data;
}
