import type {
  ProfileTemplateType,
  TestCategoryConfig,
  NotificationPreferences,
  AutoRunTriggers,
} from '@semkiest/shared-types';

// ---------------------------------------------------------------------------
// Shared defaults
// ---------------------------------------------------------------------------

const defaultNotifications: NotificationPreferences = {
  email: {
    enabled: false,
    recipients: [],
    onSuccess: false,
    onFailure: true,
  },
  slack: {
    enabled: false,
    webhookUrl: '',
    channel: '',
    onSuccess: false,
    onFailure: true,
  },
  webhooks: [],
};

const defaultAutoRunTriggers: AutoRunTriggers = {
  onDeploy: false,
  onPullRequest: false,
  onSchedule: false,
  deployEnvironments: [],
  pullRequestBranches: [],
};

// ---------------------------------------------------------------------------
// Template definition type
// ---------------------------------------------------------------------------

export interface ProfileTemplate {
  name: string;
  description: string;
  templateType: ProfileTemplateType;
  tags: string[];
  testCategories: TestCategoryConfig;
  notificationPreferences: NotificationPreferences;
  autoRunTriggers: AutoRunTriggers;
  /** Suggested cron expression for scheduled runs */
  suggestedCronExpression: string | null;
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

/**
 * Smoke Test — fast sanity check, runs on every PR against main/develop.
 * Only critical paths are enabled; performance and accessibility are skipped.
 */
const smokeTestTemplate: ProfileTemplate = {
  name: 'Smoke Test',
  description: 'Quick sanity check covering critical paths only. Ideal for PR validation.',
  templateType: 'smoke-test',
  tags: ['smoke', 'quick', 'critical', 'pr'],
  testCategories: {
    smoke: { enabled: true },
    regression: {
      enabled: false,
      browsers: ['chromium'],
      viewports: [{ width: 1280, height: 720, name: 'desktop' }],
    },
    performance: {
      enabled: false,
      concurrentUsers: 1,
      rampUpSeconds: 0,
      holdSeconds: 30,
      thresholds: { p95ResponseTimeMs: 2000, errorRatePercent: 5, requestsPerSecond: 1 },
    },
    accessibility: { enabled: false, wcagLevel: 'AA', includeWarnings: false },
  },
  notificationPreferences: {
    ...defaultNotifications,
    email: { enabled: false, recipients: [], onSuccess: false, onFailure: true },
  },
  autoRunTriggers: {
    ...defaultAutoRunTriggers,
    onPullRequest: true,
    pullRequestBranches: ['main', 'develop'],
  },
  suggestedCronExpression: null,
};

/**
 * Full Regression — exhaustive suite across all browsers, viewports, and categories.
 * Scheduled for nightly execution.
 */
const fullRegressionTemplate: ProfileTemplate = {
  name: 'Full Regression',
  description:
    'Comprehensive test suite covering all categories, browsers, and viewports. Scheduled nightly.',
  templateType: 'full-regression',
  tags: ['regression', 'comprehensive', 'nightly', 'full'],
  testCategories: {
    smoke: { enabled: true },
    regression: {
      enabled: true,
      browsers: ['chromium', 'firefox', 'webkit'],
      viewports: [
        { width: 1920, height: 1080, name: 'desktop-full' },
        { width: 1280, height: 720, name: 'desktop' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 375, height: 812, name: 'mobile' },
      ],
    },
    performance: {
      enabled: true,
      concurrentUsers: 50,
      rampUpSeconds: 30,
      holdSeconds: 300,
      thresholds: { p95ResponseTimeMs: 1000, errorRatePercent: 1, requestsPerSecond: 10 },
    },
    accessibility: { enabled: true, wcagLevel: 'AA', includeWarnings: true },
  },
  notificationPreferences: {
    ...defaultNotifications,
    email: { enabled: true, recipients: [], onSuccess: true, onFailure: true },
  },
  autoRunTriggers: {
    ...defaultAutoRunTriggers,
    onSchedule: true,
  },
  // Every day at 02:00 AM
  suggestedCronExpression: '0 2 * * *',
};

/**
 * Performance Only — load and stress testing without functional checks.
 * High concurrency with strict SLA thresholds.
 */
const performanceOnlyTemplate: ProfileTemplate = {
  name: 'Performance Only',
  description:
    'Load and stress testing focused profile. Measures throughput, latency, and error rates under load.',
  templateType: 'performance-only',
  tags: ['performance', 'load', 'stress', 'sla'],
  testCategories: {
    smoke: { enabled: false },
    regression: {
      enabled: false,
      browsers: ['chromium'],
      viewports: [{ width: 1280, height: 720, name: 'desktop' }],
    },
    performance: {
      enabled: true,
      concurrentUsers: 100,
      rampUpSeconds: 60,
      holdSeconds: 600,
      thresholds: { p95ResponseTimeMs: 500, errorRatePercent: 0.5, requestsPerSecond: 50 },
    },
    accessibility: { enabled: false, wcagLevel: 'AA', includeWarnings: false },
  },
  notificationPreferences: defaultNotifications,
  autoRunTriggers: {
    ...defaultAutoRunTriggers,
    onDeploy: true,
    deployEnvironments: ['staging', 'production'],
  },
  // Every Sunday at 03:00 AM
  suggestedCronExpression: '0 3 * * 0',
};

/**
 * Accessibility Audit — WCAG AAA compliance scanning across key breakpoints.
 */
const accessibilityAuditTemplate: ProfileTemplate = {
  name: 'Accessibility Audit',
  description:
    'WCAG compliance and accessibility-focused testing. Targets AAA level across desktop and mobile.',
  templateType: 'accessibility-audit',
  tags: ['accessibility', 'wcag', 'a11y', 'compliance'],
  testCategories: {
    smoke: { enabled: false },
    regression: {
      enabled: true,
      browsers: ['chromium'],
      viewports: [
        { width: 1280, height: 720, name: 'desktop' },
        { width: 375, height: 812, name: 'mobile' },
      ],
    },
    performance: {
      enabled: false,
      concurrentUsers: 1,
      rampUpSeconds: 0,
      holdSeconds: 30,
      thresholds: { p95ResponseTimeMs: 2000, errorRatePercent: 5, requestsPerSecond: 1 },
    },
    accessibility: { enabled: true, wcagLevel: 'AAA', includeWarnings: true },
  },
  notificationPreferences: defaultNotifications,
  autoRunTriggers: {
    ...defaultAutoRunTriggers,
    onDeploy: true,
    deployEnvironments: ['staging'],
  },
  // Every Monday at 06:00 AM
  suggestedCronExpression: '0 6 * * 1',
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PROFILE_TEMPLATES: Readonly<Record<ProfileTemplateType, ProfileTemplate>> = {
  'smoke-test': smokeTestTemplate,
  'full-regression': fullRegressionTemplate,
  'performance-only': performanceOnlyTemplate,
  'accessibility-audit': accessibilityAuditTemplate,
};

/**
 * Returns all available templates as an array (for listing endpoints).
 */
export function listProfileTemplates(): ProfileTemplate[] {
  return Object.values(PROFILE_TEMPLATES);
}

/**
 * Returns the template definition for a given type, or undefined if not found.
 */
export function getProfileTemplate(
  templateType: ProfileTemplateType,
): ProfileTemplate | undefined {
  return PROFILE_TEMPLATES[templateType];
}
