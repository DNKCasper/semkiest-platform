/**
 * Core type definitions for test run reports and project summaries.
 * Used by the Excel export service to generate structured .xlsx files.
 */

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'error';

export type TestCategory =
  | 'ui'
  | 'functional'
  | 'visual'
  | 'performance'
  | 'accessibility'
  | 'security'
  | 'api';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type TrendDirection = 'improving' | 'stable' | 'degrading';

/**
 * Individual test result within a run.
 */
export interface TestResult {
  id: string;
  name: string;
  category: TestCategory;
  status: TestStatus;
  /** Duration in milliseconds */
  duration: number;
  error?: string;
  severity?: SeverityLevel;
  /** URL of the page under test */
  url?: string;
  /** Path to screenshot evidence */
  screenshot?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Complete data for a single test run report.
 */
export interface TestRunReport {
  id: string;
  projectId: string;
  projectName: string;
  runName: string;
  environment: string;
  startedAt: Date;
  completedAt: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  results: TestResult[];
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated metrics for a single project over a time period.
 */
export interface ProjectMetrics {
  projectId: string;
  projectName: string;
  totalRuns: number;
  /** Pass rate as a decimal (0–1) */
  avgPassRate: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  /** Average run duration in milliseconds */
  avgDuration: number;
  lastRunAt?: Date;
  trend: TrendDirection;
}

/**
 * Per-category breakdown of test results.
 */
export interface CategoryBreakdown {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * Summary of a single run within a project summary report.
 */
export interface RunSummary {
  id: string;
  name: string;
  startedAt: Date;
  /** Pass rate as a decimal (0–1) */
  passRate: number;
  totalTests: number;
  environment: string;
}

/**
 * Complete data for a project summary report over a configurable time period.
 */
export interface ProjectSummaryReport {
  projectId: string;
  projectName: string;
  period: {
    from: Date;
    to: Date;
  };
  metrics: ProjectMetrics;
  runs: RunSummary[];
  categoryBreakdown: Record<TestCategory, CategoryBreakdown>;
  severityBreakdown: Record<SeverityLevel, number>;
}

/**
 * Complete data for an organisation-wide cross-project comparison report.
 */
export interface OrganizationReport {
  organizationId: string;
  organizationName: string;
  period: {
    from: Date;
    to: Date;
  };
  projects: ProjectMetrics[];
  totalProjects: number;
  totalRuns: number;
  totalTests: number;
  /** Overall pass rate as a decimal (0–1) */
  overallPassRate: number;
}

/**
 * Options that control Excel file generation.
 */
export interface ExcelExportOptions {
  /** Include a print-friendly header / footer on every sheet */
  includePrintLayout?: boolean;
  /** Creator name embedded in workbook metadata */
  creator?: string;
}
