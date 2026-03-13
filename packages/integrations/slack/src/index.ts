/**
 * @semkiest/slack — Slack integration for the SemkiEst platform.
 *
 * Provides:
 * - SlackClient: low-level Slack Web API wrapper
 * - NotificationBuilder: sends typed notifications (test runs, bugs, quality)
 * - DigestBuilder: sends scheduled daily/weekly quality digest messages
 * - Block Kit templates: pure functions that build Slack Block Kit blocks
 * - Shared types
 */

export { SlackClient } from './slack-client';
export { NotificationBuilder } from './notification-builder';
export {
  DigestBuilder,
  dailyCronExpression,
  weeklyCronExpression,
  getDailyDigestPeriod,
  getWeeklyDigestPeriod,
} from './digest-builder';
export type { DigestSentEvent } from './digest-builder';
export {
  buildTestRunBlocks,
  buildCriticalBugBlocks,
  buildQualityScoreChangeBlocks,
  buildDigestBlocks,
} from './block-kit-templates';
export type {
  TestRunResult,
  CriticalBug,
  QualityScoreChange,
  ProjectChannelConfig,
  SlackClientConfig,
  DigestConfig,
  DigestSummary,
  ProjectDigestItem,
  SlackNotificationResult,
} from './types';
