/**
 * DigestBuilder — builds and sends scheduled quality digest messages.
 *
 * Supports daily and weekly digests with configurable schedules.
 * Uses node-cron for scheduling. Digest data must be provided by the caller
 * (typically fetched from the database before calling these methods).
 */

import { EventEmitter } from 'events';
import { SlackClient } from './slack-client';
import { buildDigestBlocks } from './block-kit-templates';
import type {
  DigestConfig,
  DigestSummary,
  SlackNotificationResult,
} from './types';

// ---------------------------------------------------------------------------
// Cron expression helpers
// ---------------------------------------------------------------------------

/**
 * Returns a cron expression for a daily digest.
 * Fires at 09:00 every day in the server's local timezone.
 * Actual timezone handling is the caller's responsibility (use node-cron's
 * timezone option when scheduling).
 */
export function dailyCronExpression(): string {
  // "At 09:00 every day"
  return '0 9 * * *';
}

/**
 * Returns a cron expression for a weekly digest.
 * Fires at 09:00 every Monday.
 */
export function weeklyCronExpression(): string {
  // "At 09:00 on Monday"
  return '0 9 * * 1';
}

/**
 * Returns the start and end Date for a daily digest period (yesterday).
 */
export function getDailyDigestPeriod(now: Date = new Date()): {
  startDate: Date;
  endDate: Date;
} {
  const endDate = new Date(now);
  endDate.setHours(0, 0, 0, 0);

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 1);

  return { startDate, endDate };
}

/**
 * Returns the start and end Date for a weekly digest period (last 7 days).
 */
export function getWeeklyDigestPeriod(now: Date = new Date()): {
  startDate: Date;
  endDate: Date;
} {
  const endDate = new Date(now);
  endDate.setHours(0, 0, 0, 0);

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// DigestBuilder
// ---------------------------------------------------------------------------

/**
 * Fired when a digest is successfully sent.
 */
export interface DigestSentEvent {
  config: DigestConfig;
  result: SlackNotificationResult;
  summary: DigestSummary;
}

/**
 * Builds and dispatches Slack digest messages.
 *
 * @example
 * const builder = new DigestBuilder(slackClient);
 * const summary = await fetchDigestData('daily'); // your data-fetching layer
 * const result = await builder.sendDigest(config, summary);
 */
export class DigestBuilder extends EventEmitter {
  private readonly client: SlackClient;

  /**
   * @param client - Pre-configured SlackClient instance.
   */
  constructor(client: SlackClient) {
    super();
    this.client = client;
  }

  /**
   * Sends a digest message to the channel specified in `config`.
   *
   * @param config  - Digest configuration (channel, schedule, timezone, projects).
   * @param summary - Pre-fetched digest summary data.
   */
  async sendDigest(
    config: DigestConfig,
    summary: DigestSummary,
  ): Promise<SlackNotificationResult> {
    const blocks = buildDigestBlocks(summary);
    const periodLabel = summary.period === 'daily' ? 'Daily' : 'Weekly';
    const fallbackText =
      `SemkiEst ${periodLabel} Quality Digest: ` +
      `${summary.projects.length} project(s), ` +
      `${summary.totalTestRuns} test run(s), ` +
      `overall quality score ${summary.overallQualityScore}/100.`;

    const result = await this.client.postBlocks(
      config.channelId,
      fallbackText,
      blocks,
    );

    if (result.ok) {
      const event: DigestSentEvent = { config, result, summary };
      this.emit('digestSent', event);
    }

    return result;
  }

  /**
   * Sends a daily digest.
   *
   * @param config  - Digest configuration.
   * @param summary - Pre-fetched daily summary data.
   */
  async sendDailyDigest(
    config: DigestConfig,
    summary: DigestSummary,
  ): Promise<SlackNotificationResult> {
    return this.sendDigest(
      { ...config, schedule: 'daily' },
      { ...summary, period: 'daily' },
    );
  }

  /**
   * Sends a weekly digest.
   *
   * @param config  - Digest configuration.
   * @param summary - Pre-fetched weekly summary data.
   */
  async sendWeeklyDigest(
    config: DigestConfig,
    summary: DigestSummary,
  ): Promise<SlackNotificationResult> {
    return this.sendDigest(
      { ...config, schedule: 'weekly' },
      { ...summary, period: 'weekly' },
    );
  }

  /**
   * Returns the cron expression for the given digest schedule.
   *
   * Use this when registering jobs with node-cron or BullMQ repeatable jobs.
   *
   * @example
   * const cron = DigestBuilder.getCronExpression('daily'); // "0 9 * * *"
   * cron(cron, { timezone: config.timezone }, async () => { ... });
   */
  static getCronExpression(schedule: 'daily' | 'weekly'): string {
    return schedule === 'daily'
      ? dailyCronExpression()
      : weeklyCronExpression();
  }

  /**
   * Returns the date range for a digest period based on the schedule.
   *
   * @param schedule - 'daily' or 'weekly'.
   * @param now      - Reference date (defaults to current date/time).
   */
  static getDigestPeriod(
    schedule: 'daily' | 'weekly',
    now: Date = new Date(),
  ): { startDate: Date; endDate: Date } {
    return schedule === 'daily'
      ? getDailyDigestPeriod(now)
      : getWeeklyDigestPeriod(now);
  }
}
