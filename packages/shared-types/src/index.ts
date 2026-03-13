/**
 * Shared TypeScript types for the SemkiEst platform.
 * Profile domain types support SEM-99: Advanced Test Profile Configuration.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type ProfileTemplateType =
  | 'smoke-test'
  | 'full-regression'
  | 'performance-only'
  | 'accessibility-audit';

export type WcagLevel = 'A' | 'AA' | 'AAA';

export type BrowserName = 'chromium' | 'firefox' | 'webkit';

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export interface EmailNotificationConfig {
  enabled: boolean;
  /** List of recipient email addresses */
  recipients: string[];
  onSuccess: boolean;
  onFailure: boolean;
}

export interface SlackNotificationConfig {
  enabled: boolean;
  webhookUrl: string;
  channel: string;
  onSuccess: boolean;
  onFailure: boolean;
}

export interface WebhookNotificationConfig {
  enabled: boolean;
  url: string;
  /** Optional HMAC secret for payload signing */
  secret?: string;
  onSuccess: boolean;
  onFailure: boolean;
}

export interface NotificationPreferences {
  email: EmailNotificationConfig;
  slack: SlackNotificationConfig;
  webhooks: WebhookNotificationConfig[];
}

// ---------------------------------------------------------------------------
// Auto-run triggers
// ---------------------------------------------------------------------------

export interface AutoRunTriggers {
  /** Trigger test run on deployment */
  onDeploy: boolean;
  /** Trigger test run on pull request */
  onPullRequest: boolean;
  /** Trigger test run on cron schedule */
  onSchedule: boolean;
  /** Which deployment environments activate this trigger */
  deployEnvironments: string[];
  /** Which PR target branches activate this trigger */
  pullRequestBranches: string[];
}

// ---------------------------------------------------------------------------
// Test category configurations
// ---------------------------------------------------------------------------

export interface Viewport {
  width: number;
  height: number;
  /** Human-readable label, e.g. "desktop", "mobile" */
  name: string;
}

export interface SmokeTestConfig {
  enabled: boolean;
}

export interface RegressionTestConfig {
  enabled: boolean;
  browsers: BrowserName[];
  viewports: Viewport[];
}

export interface PerformanceThresholds {
  p95ResponseTimeMs: number;
  errorRatePercent: number;
  requestsPerSecond: number;
}

export interface PerformanceTestConfig {
  enabled: boolean;
  concurrentUsers: number;
  rampUpSeconds: number;
  holdSeconds: number;
  thresholds: PerformanceThresholds;
}

export interface AccessibilityTestConfig {
  enabled: boolean;
  wcagLevel: WcagLevel;
  includeWarnings: boolean;
}

export interface TestCategoryConfig {
  smoke: SmokeTestConfig;
  regression: RegressionTestConfig;
  performance: PerformanceTestConfig;
  accessibility: AccessibilityTestConfig;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isTemplate: boolean;
  templateType: ProfileTemplateType | null;
  tags: string[];
  testCategories: TestCategoryConfig;
  /** Cron expression for scheduled runs, e.g. "0 2 * * *" */
  cronExpression: string | null;
  notificationPreferences: NotificationPreferences | null;
  autoRunTriggers: AutoRunTriggers | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Profile version history
// ---------------------------------------------------------------------------

/** Immutable snapshot of profile settings recorded on each update */
export type ProfileSettingsSnapshot = Omit<
  Profile,
  'id' | 'createdAt' | 'updatedAt' | 'version'
>;

export interface ProfileVersion {
  id: string;
  profileId: string;
  version: number;
  settings: ProfileSettingsSnapshot;
  changedBy: string | null;
  changeNote: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Input / mutation types
// ---------------------------------------------------------------------------

export interface CreateProfileInput {
  projectId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  isTemplate?: boolean;
  templateType?: ProfileTemplateType;
  tags?: string[];
  testCategories?: Partial<TestCategoryConfig>;
  cronExpression?: string;
  notificationPreferences?: Partial<NotificationPreferences>;
  autoRunTriggers?: Partial<AutoRunTriggers>;
  /** Optional note describing why this profile was created */
  changeNote?: string;
}

export interface UpdateProfileInput {
  name?: string;
  description?: string | null;
  isDefault?: boolean;
  tags?: string[];
  testCategories?: Partial<TestCategoryConfig>;
  cronExpression?: string | null;
  notificationPreferences?: Partial<NotificationPreferences> | null;
  autoRunTriggers?: Partial<AutoRunTriggers> | null;
  /** Optional note describing the change */
  changeNote?: string;
}

export interface DuplicateProfileInput {
  targetProjectId: string;
  /** Override name for the duplicated profile */
  name?: string;
  /**
   * Key-value map of variable substitutions applied to notification URLs,
   * webhook endpoints, etc. e.g. { "staging.example.com": "prod.example.com" }
   */
  variableSubstitutions?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Query / response types
// ---------------------------------------------------------------------------

export interface ProfileQueryParams {
  projectId?: string;
  search?: string;
  /** Comma-separated list of tags to filter by */
  tags?: string;
  templateType?: ProfileTemplateType;
  isTemplate?: boolean;
  isDefault?: boolean;
  page?: number;
  limit?: number;
}

export interface ProfileListResponse {
  profiles: Profile[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Re-export project types (from previous story SEM-63)
// ---------------------------------------------------------------------------

export type ProjectEnvironment = 'development' | 'staging' | 'production';
export type ProjectStatus = 'active' | 'inactive' | 'archived';

export interface ProjectStats {
  totalRuns: number;
  passRate: number;
  totalTests: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  urls: string[];
  environment: ProjectEnvironment;
  status: ProjectStatus;
  tags: string[];
  owner?: string;
  team?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  stats: ProjectStats;
}
