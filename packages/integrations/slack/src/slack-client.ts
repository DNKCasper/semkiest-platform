/**
 * Slack API client wrapper.
 *
 * Wraps `@slack/web-api` WebClient with helpers for posting Block Kit messages
 * and plain-text notifications. Authentication uses a Bot token (xoxb-...).
 *
 * The bot token is expected to be passed in at construction time; callers are
 * responsible for decrypting the stored token before constructing this class.
 */

import { WebClient, LogLevel } from '@slack/web-api';
import type { KnownBlock } from '@slack/web-api';
import type { SlackClientConfig, SlackNotificationResult } from './types';

export class SlackClient {
  private readonly client: WebClient;

  /**
   * Creates a new SlackClient instance.
   *
   * @param config - Bot token and optional signing secret.
   */
  constructor(config: SlackClientConfig) {
    this.client = new WebClient(config.botToken, {
      logLevel:
        process.env['NODE_ENV'] === 'production'
          ? LogLevel.ERROR
          : LogLevel.WARN,
    });
  }

  /**
   * Posts a Block Kit message to a Slack channel.
   *
   * @param channel - Slack channel ID or name (e.g. "C012AB3CD" or "#alerts").
   * @param text    - Fallback plain-text shown in notifications and screenreaders.
   * @param blocks  - Block Kit blocks that form the rich message body.
   */
  async postBlocks(
    channel: string,
    text: string,
    blocks: KnownBlock[],
  ): Promise<SlackNotificationResult> {
    try {
      const response = await this.client.chat.postMessage({
        channel,
        text,
        blocks,
      });

      return {
        ok: response.ok === true,
        ts: response.ts,
        channel: response.channel,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Posts a plain-text message to a Slack channel.
   *
   * @param channel - Slack channel ID or name.
   * @param text    - Message text (supports mrkdwn formatting).
   */
  async postText(
    channel: string,
    text: string,
  ): Promise<SlackNotificationResult> {
    try {
      const response = await this.client.chat.postMessage({
        channel,
        text,
        mrkdwn: true,
      });

      return {
        ok: response.ok === true,
        ts: response.ts,
        channel: response.channel,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Verifies that the bot token is valid by calling `auth.test`.
   * Useful for validating the token at startup or during configuration.
   *
   * @returns The authenticated bot's user ID and workspace name.
   */
  async verifyAuth(): Promise<{ userId: string; teamName: string }> {
    const result = await this.client.auth.test();

    if (!result.ok) {
      throw new Error(`Slack auth.test failed: ${result.error ?? 'unknown error'}`);
    }

    return {
      userId: result.user_id ?? '',
      teamName: result.team ?? '',
    };
  }

  /**
   * Returns a list of channels the bot has joined, for use in channel
   * configuration UIs.
   */
  async listJoinedChannels(): Promise<
    Array<{ id: string; name: string; isMember: boolean }>
  > {
    const result = await this.client.conversations.list({
      exclude_archived: true,
      types: 'public_channel,private_channel',
      limit: 200,
    });

    if (!result.ok || !result.channels) {
      return [];
    }

    return result.channels
      .filter((ch) => ch.id && ch.name)
      .map((ch) => ({
        id: ch.id ?? '',
        name: ch.name ?? '',
        isMember: ch.is_member === true,
      }));
  }
}
