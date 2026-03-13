/**
 * Shared types for the Slack integration package.
 * Used across slack-client, notification-builder, and digest-builder.
 */

/**
 * Result of a test run, used to generate notifications and digests.
 */
export interface TestRunResult {
  id: string;
  projectId: string;
  projectName: string;
  timestamp: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  /** Duration of the test run in milliseconds. */
  duration: number;
  /** Overall quality score from 0–100. */
  qualityScore: number;
  /** Full URL to the test run report in the SemkiEst dashboard. */
  dashboardUrl: string;
}

/**
 * A critical bug discovered during a test run.
 */
export interface CriticalBug {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  testRunId: string;
  discoveredAt: Date;
  /** Full URL to the bug detail page in the SemkiEst dashboard. */
  dashboardUrl: string;
}

/**
 * A change in a project's quality score.
 */
export interface QualityScoreChange {
  projectId: string;
  projectName: string;
  previousScore: number;
  currentScore: number;
  /** Absolute change (currentScore - previousScore). */
  changeAmount: number;
  /** Percentage change relative to previousScore. */
  changePercent: number;
  timestamp: Date;
  /** Full URL to the project quality page in the SemkiEst dashboard. */
  dashboardUrl: string;
}

/**
 * Per-project Slack notification configuration.
 */
export interface ProjectChannelConfig {
  projectId: string;
  /** Slack channel ID (e.g. "C012AB3CD") or channel name (e.g. "#dev-alerts"). */
  channelId: string;
  notifyOnCompletion: boolean;
  notifyOnCriticalBugs: boolean;
  notifyOnQualityChange: boolean;
  /**
   * Minimum absolute quality score change required to trigger a notification.
   * Default: 5 (i.e. a change of ≥5 points triggers a notification).
   */
  qualityChangeThreshold: number;
}

/**
 * Configuration for the SlackClient.
 */
export interface SlackClientConfig {
  /** Slack Bot OAuth token (xoxb-...). Stored encrypted at rest. */
  botToken: string;
  /** Optional Slack signing secret for request verification. */
  signingSecret?: string;
}

/**
 * Configuration for a digest job (daily or weekly summary).
 */
export interface DigestConfig {
  /** Slack channel ID to post the digest to. */
  channelId: string;
  schedule: 'daily' | 'weekly';
  /** IANA timezone string for digest scheduling (e.g. "America/New_York"). */
  timezone: string;
  /** Project IDs to include in the digest. Empty array means all projects. */
  projectIds: string[];
}

/**
 * Aggregated data for a digest message covering a time period.
 */
export interface DigestSummary {
  period: 'daily' | 'weekly';
  startDate: Date;
  endDate: Date;
  projects: ProjectDigestItem[];
  totalTestRuns: number;
  totalPassedTests: number;
  totalFailedTests: number;
  /** Weighted average quality score across all projects. */
  overallQualityScore: number;
  /** Full URL to the digest report in the SemkiEst dashboard. */
  dashboardUrl: string;
}

/**
 * Per-project summary item within a digest.
 */
export interface ProjectDigestItem {
  projectId: string;
  projectName: string;
  testRuns: number;
  passedTests: number;
  failedTests: number;
  /** Current quality score for the project. */
  qualityScore: number;
  qualityScoreTrend: 'up' | 'down' | 'stable';
  /** Full URL to the project in the SemkiEst dashboard. */
  dashboardUrl: string;
}

/**
 * Result returned after posting a Slack message.
 */
export interface SlackNotificationResult {
  ok: boolean;
  /** Slack message timestamp, usable as a message identifier. */
  ts?: string;
  channel?: string;
  error?: string;
}
