import { z } from 'zod';

/**
 * Environment variable schema for the Slack integration.
 * Used by services that send Slack notifications (API, Worker).
 */
export const slackEnvSchema = z.object({
  /**
   * Slack Bot OAuth token (xoxb-...).
   * Required to send messages via the Slack Web API.
   * Store encrypted at rest; decrypt before constructing SlackClient.
   * NEVER commit the real value.
   */
  SLACK_BOT_TOKEN: z
    .string()
    .startsWith('xoxb-', 'SLACK_BOT_TOKEN must start with "xoxb-"')
    .optional(),

  /**
   * Slack app signing secret used to verify incoming webhook payloads.
   * Required when using Slack interactive components or slash commands.
   */
  SLACK_SIGNING_SECRET: z.string().min(16).optional(),

  /**
   * Default Slack channel ID for platform-wide notifications.
   * Individual projects can override this via per-project channel config.
   * Example: "C012AB3CD"
   */
  SLACK_DEFAULT_CHANNEL: z.string().min(1).optional(),
});

export type SlackEnv = z.infer<typeof slackEnvSchema>;

/**
 * Validates and returns typed Slack environment variables.
 * All Slack variables are optional; integration is disabled when absent.
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
