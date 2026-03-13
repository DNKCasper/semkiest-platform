/**
 * NotificationBuilder — high-level helper for sending Slack notifications.
 *
 * Combines the SlackClient and Block Kit templates to send typed notifications
 * with proper channel routing via per-project channel configuration.
 */

import { SlackClient } from './slack-client';
import {
  buildTestRunBlocks,
  buildCriticalBugBlocks,
  buildQualityScoreChangeBlocks,
} from './block-kit-templates';
import type {
  TestRunResult,
  CriticalBug,
  QualityScoreChange,
  ProjectChannelConfig,
  SlackNotificationResult,
} from './types';

export class NotificationBuilder {
  private readonly client: SlackClient;

  /**
   * @param client - Pre-configured SlackClient instance.
   */
  constructor(client: SlackClient) {
    this.client = client;
  }

  /**
   * Sends a test run completion notification to the configured project channel.
   *
   * The notification is only sent if `notifyOnCompletion` is enabled in the
   * project's channel config. Returns `null` if notification is suppressed.
   *
   * @param result        - The completed test run result.
   * @param channelConfig - Per-project Slack channel configuration.
   */
  async sendTestRunNotification(
    result: TestRunResult,
    channelConfig: ProjectChannelConfig,
  ): Promise<SlackNotificationResult | null> {
    if (!channelConfig.notifyOnCompletion) {
      return null;
    }

    const blocks = buildTestRunBlocks(result);
    const hasFailed = result.failedTests > 0;
    const fallbackText = hasFailed
      ? `Test run for ${result.projectName} completed with ${result.failedTests} failure(s). Quality score: ${result.qualityScore}/100.`
      : `Test run for ${result.projectName} completed successfully. All ${result.totalTests} tests passed. Quality score: ${result.qualityScore}/100.`;

    return this.client.postBlocks(channelConfig.channelId, fallbackText, blocks);
  }

  /**
   * Sends a critical bug discovery alert to the configured project channel.
   *
   * Only sends if `notifyOnCriticalBugs` is enabled and the bug severity
   * is "critical" or "high".
   *
   * @param bug           - The discovered critical bug.
   * @param channelConfig - Per-project Slack channel configuration.
   */
  async sendCriticalBugNotification(
    bug: CriticalBug,
    channelConfig: ProjectChannelConfig,
  ): Promise<SlackNotificationResult | null> {
    if (!channelConfig.notifyOnCriticalBugs) {
      return null;
    }

    // Only escalate critical and high severity bugs immediately
    if (bug.severity !== 'critical' && bug.severity !== 'high') {
      return null;
    }

    const blocks = buildCriticalBugBlocks(bug);
    const fallbackText = `${bug.severity.toUpperCase()} bug found in ${bug.projectName}: "${bug.title}"`;

    return this.client.postBlocks(channelConfig.channelId, fallbackText, blocks);
  }

  /**
   * Sends a quality score change notification to the configured project channel.
   *
   * Only sends if `notifyOnQualityChange` is enabled and the absolute change
   * meets or exceeds the configured `qualityChangeThreshold`.
   *
   * @param change        - The quality score change data.
   * @param channelConfig - Per-project Slack channel configuration.
   */
  async sendQualityScoreNotification(
    change: QualityScoreChange,
    channelConfig: ProjectChannelConfig,
  ): Promise<SlackNotificationResult | null> {
    if (!channelConfig.notifyOnQualityChange) {
      return null;
    }

    const absChange = Math.abs(change.changeAmount);
    if (absChange < channelConfig.qualityChangeThreshold) {
      return null;
    }

    const blocks = buildQualityScoreChangeBlocks(change);
    const direction = change.changeAmount >= 0 ? 'improved' : 'declined';
    const sign = change.changeAmount >= 0 ? '+' : '';
    const fallbackText =
      `Quality score for ${change.projectName} has ${direction} by ${sign}${change.changeAmount} points. ` +
      `New score: ${change.currentScore}/100.`;

    return this.client.postBlocks(channelConfig.channelId, fallbackText, blocks);
  }

  /**
   * Sends all applicable notifications for a test run, including quality
   * score change and any critical bugs found.
   *
   * @param result        - The completed test run result.
   * @param channelConfig - Per-project Slack channel configuration.
   * @param bugs          - Optional list of critical bugs found in the run.
   * @param qualityChange - Optional quality score change associated with the run.
   */
  async sendTestRunSummary(
    result: TestRunResult,
    channelConfig: ProjectChannelConfig,
    bugs: CriticalBug[] = [],
    qualityChange?: QualityScoreChange,
  ): Promise<{
    testRun: SlackNotificationResult | null;
    bugs: Array<SlackNotificationResult | null>;
    qualityChange: SlackNotificationResult | null;
  }> {
    const [testRunResult, ...bugResults] = await Promise.all([
      this.sendTestRunNotification(result, channelConfig),
      ...bugs.map((bug) => this.sendCriticalBugNotification(bug, channelConfig)),
    ]);

    const qualityChangeResult = qualityChange
      ? await this.sendQualityScoreNotification(qualityChange, channelConfig)
      : null;

    return {
      testRun: testRunResult ?? null,
      bugs: bugResults,
      qualityChange: qualityChangeResult,
    };
  }
}
