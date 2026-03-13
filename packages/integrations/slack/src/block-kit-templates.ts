/**
 * Slack Block Kit template builders.
 *
 * All functions return arrays of Slack Block Kit blocks suitable for use
 * in `chat.postMessage` calls. No network I/O happens here — these are
 * pure data-transformation functions.
 *
 * @see https://api.slack.com/block-kit
 */

import type { KnownBlock } from '@slack/web-api';
import type {
  TestRunResult,
  CriticalBug,
  QualityScoreChange,
  DigestSummary,
  ProjectDigestItem,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a duration given in milliseconds as a human-readable string.
 * e.g. 90123 → "1m 30s"
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Formats a Date as a short locale string.
 * e.g. 2024-03-15T10:30:00Z → "Mar 15, 2024, 10:30 AM"
 */
function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Returns a pass-rate emoji indicator based on the ratio of passed to total.
 */
function passRateEmoji(passed: number, total: number): string {
  if (total === 0) return ':white_circle:';
  const rate = passed / total;
  if (rate === 1) return ':white_check_mark:';
  if (rate >= 0.9) return ':large_yellow_circle:';
  if (rate >= 0.7) return ':large_orange_circle:';
  return ':red_circle:';
}

/**
 * Returns an emoji indicator for a quality score (0–100).
 */
function qualityScoreEmoji(score: number): string {
  if (score >= 90) return ':trophy:';
  if (score >= 75) return ':large_green_circle:';
  if (score >= 60) return ':large_yellow_circle:';
  if (score >= 40) return ':large_orange_circle:';
  return ':red_circle:';
}

/**
 * Returns a trend arrow emoji and sign for a numeric change.
 */
function trendEmoji(change: number): string {
  if (change > 0) return ':arrow_up_small:';
  if (change < 0) return ':arrow_down_small:';
  return ':left_right_arrow:';
}

/**
 * Returns a severity emoji for a bug severity level.
 */
function severityEmoji(severity: CriticalBug['severity']): string {
  switch (severity) {
    case 'critical':
      return ':rotating_light:';
    case 'high':
      return ':warning:';
    case 'medium':
      return ':large_yellow_circle:';
    case 'low':
      return ':information_source:';
  }
}

// ---------------------------------------------------------------------------
// Test Run Completion Template
// ---------------------------------------------------------------------------

/**
 * Builds Block Kit blocks for a test run completion notification.
 *
 * @example
 * const blocks = buildTestRunBlocks(result);
 * await client.chat.postMessage({ channel, blocks });
 */
export function buildTestRunBlocks(result: TestRunResult): KnownBlock[] {
  const {
    projectName,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
    duration,
    qualityScore,
    timestamp,
    dashboardUrl,
  } = result;

  const passRate =
    totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  const statusEmoji = passRateEmoji(passedTests, totalTests);
  const qEmoji = qualityScoreEmoji(qualityScore);
  const hasFailures = failedTests > 0;

  const headerText = hasFailures
    ? `${statusEmoji} Test Run Completed — *${failedTests} failure${failedTests !== 1 ? 's' : ''}* in *${projectName}*`
    : `${statusEmoji} Test Run Completed — All tests passed in *${projectName}*`;

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Test Run: ${projectName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: headerText,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Tests*\n${totalTests.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `*Pass Rate*\n${passRate}%`,
        },
        {
          type: 'mrkdwn',
          text: `:white_check_mark: *Passed*\n${passedTests.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `:x: *Failed*\n${failedTests.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `:fast_forward: *Skipped*\n${skippedTests.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `:stopwatch: *Duration*\n${formatDuration(duration)}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${qEmoji} *Quality Score:* ${qualityScore}/100`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:calendar: Completed at ${formatDate(timestamp)}`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Full Report', emoji: true },
          url: dashboardUrl,
          action_id: 'view_test_run_report',
          style: hasFailures ? 'danger' : 'primary',
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Critical Bug Alert Template
// ---------------------------------------------------------------------------

/**
 * Builds Block Kit blocks for a critical bug discovery alert.
 */
export function buildCriticalBugBlocks(bug: CriticalBug): KnownBlock[] {
  const {
    projectName,
    title,
    severity,
    description,
    discoveredAt,
    dashboardUrl,
  } = bug;

  const sEmoji = severityEmoji(severity);
  const severityLabel =
    severity.charAt(0).toUpperCase() + severity.slice(1);

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${sEmoji} ${severityLabel} Bug Discovered`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `A *${severityLabel.toLowerCase()} severity* bug was found in *${projectName}*.\n\n*${title}*`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Project*\n${projectName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Severity*\n${sEmoji} ${severityLabel}`,
        },
        {
          type: 'mrkdwn',
          text: `*Discovered At*\n${formatDate(discoveredAt)}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Description*\n${description}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Investigate Bug', emoji: true },
          url: dashboardUrl,
          action_id: 'view_critical_bug',
          style: 'danger',
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Quality Score Change Template
// ---------------------------------------------------------------------------

/**
 * Builds Block Kit blocks for a quality score change notification.
 */
export function buildQualityScoreChangeBlocks(
  change: QualityScoreChange,
): KnownBlock[] {
  const {
    projectName,
    previousScore,
    currentScore,
    changeAmount,
    changePercent,
    timestamp,
    dashboardUrl,
  } = change;

  const direction = changeAmount >= 0 ? 'improved' : 'declined';
  const trendIcon = trendEmoji(changeAmount);
  const qEmoji = qualityScoreEmoji(currentScore);
  const absChange = Math.abs(changeAmount);
  const absPercent = Math.abs(changePercent).toFixed(1);
  const changeSign = changeAmount >= 0 ? '+' : '-';

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${trendIcon} Quality Score ${direction.charAt(0).toUpperCase() + direction.slice(1)}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `The quality score for *${projectName}* has *${direction}* by ${changeSign}${absChange} points (${changeSign}${absPercent}%).`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Previous Score*\n${qualityScoreEmoji(previousScore)} ${previousScore}/100`,
        },
        {
          type: 'mrkdwn',
          text: `*Current Score*\n${qEmoji} ${currentScore}/100`,
        },
        {
          type: 'mrkdwn',
          text: `*Change*\n${trendIcon} ${changeSign}${absChange} pts (${changeSign}${absPercent}%)`,
        },
        {
          type: 'mrkdwn',
          text: `*Recorded At*\n${formatDate(timestamp)}`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Quality Report',
            emoji: true,
          },
          url: dashboardUrl,
          action_id: 'view_quality_report',
          style: changeAmount >= 0 ? 'primary' : 'danger',
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Digest Templates
// ---------------------------------------------------------------------------

/**
 * Builds a single project row section for use within a digest message.
 */
function buildDigestProjectRow(item: ProjectDigestItem): KnownBlock {
  const {
    projectName,
    testRuns,
    passedTests,
    failedTests,
    qualityScore,
    qualityScoreTrend,
    dashboardUrl,
  } = item;

  const trendIcon =
    qualityScoreTrend === 'up'
      ? ':arrow_up_small:'
      : qualityScoreTrend === 'down'
        ? ':arrow_down_small:'
        : ':left_right_arrow:';
  const qEmoji = qualityScoreEmoji(qualityScore);

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text:
        `*<${dashboardUrl}|${projectName}>*\n` +
        `${qEmoji} Score: *${qualityScore}/100* ${trendIcon}  ` +
        `:white_check_mark: ${passedTests.toLocaleString()} passed  ` +
        `:x: ${failedTests.toLocaleString()} failed  ` +
        `:bar_chart: ${testRuns} run${testRuns !== 1 ? 's' : ''}`,
    },
  };
}

/**
 * Builds Block Kit blocks for a daily or weekly quality digest message.
 */
export function buildDigestBlocks(summary: DigestSummary): KnownBlock[] {
  const {
    period,
    startDate,
    endDate,
    projects,
    totalTestRuns,
    totalPassedTests,
    totalFailedTests,
    overallQualityScore,
    dashboardUrl,
  } = summary;

  const periodLabel = period === 'daily' ? 'Daily' : 'Weekly';
  const dateRange =
    period === 'daily'
      ? formatDate(startDate).split(',')[0] // e.g. "Mar 15, 2024"
      : `${formatDate(startDate).split(',')[0]} – ${formatDate(endDate).split(',')[0]}`;

  const qEmoji = qualityScoreEmoji(overallQualityScore);
  const totalTests = totalPassedTests + totalFailedTests;
  const passRate =
    totalTests > 0 ? Math.round((totalPassedTests / totalTests) * 100) : 0;

  const projectRows: KnownBlock[] = projects.map(buildDigestProjectRow);

  const noProjectsBlock: KnownBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '_No projects had test runs during this period._',
    },
  };

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `:bar_chart: SemkiEst ${periodLabel} Quality Digest`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Period:* ${dateRange}`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `${qEmoji} *Overall Quality Score*\n${overallQualityScore}/100`,
        },
        {
          type: 'mrkdwn',
          text: `:bar_chart: *Total Test Runs*\n${totalTestRuns.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `:white_check_mark: *Passed Tests*\n${totalPassedTests.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `:x: *Failed Tests*\n${totalFailedTests.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `:chart_with_upwards_trend: *Pass Rate*\n${passRate}%`,
        },
        {
          type: 'mrkdwn',
          text: `:file_folder: *Projects*\n${projects.length}`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Project Breakdown*',
      },
    },
    ...(projects.length > 0 ? projectRows : [noProjectsBlock]),
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `View ${periodLabel} Report`,
            emoji: true,
          },
          url: dashboardUrl,
          action_id: 'view_digest_report',
          style: 'primary',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:robot_face: Sent by SemkiEst · <${dashboardUrl}|Open Dashboard>`,
        },
      ],
    },
  ];
}
