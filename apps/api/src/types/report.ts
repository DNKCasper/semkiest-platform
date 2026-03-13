import { z } from 'zod';

// ─── Enumerations ─────────────────────────────────────────────────────────────

/** Report detail level controls how much data is included in the response. */
export type ReportDetailLevel = 'summary' | 'detailed';

/** Severity levels for test results, ordered by impact. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Execution status for an individual test or test run. */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'error';

/** Category types for grouping test results. */
export type TestCategory =
  | 'functional'
  | 'visual'
  | 'accessibility'
  | 'performance'
  | 'security'
  | 'api'
  | 'e2e';

// ─── Severity weights for quality score calculation ───────────────────────────

/** Points deducted per failed test by severity. */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

// ─── Core data structures ─────────────────────────────────────────────────────

/**
 * An evidence link associated with a test result (screenshot, video, log).
 */
export interface EvidenceLink {
  /** Unique identifier for this evidence item. */
  id: string;
  /** Type of evidence artifact. */
  type: 'screenshot' | 'video' | 'log' | 'har' | 'diff';
  /** Human-readable label for the evidence. */
  label: string;
  /** Public URL to access the evidence artifact. */
  url: string;
  /** MIME type of the artifact (e.g. "image/png"). */
  mimeType: string;
  /** Size of the artifact in bytes, if known. */
  sizeBytes?: number;
}

/**
 * Execution result for a single test case.
 */
export interface TestResult {
  /** Unique identifier for the test result record. */
  id: string;
  /** Identifier of the test case definition. */
  testCaseId: string;
  /** Human-readable test name. */
  name: string;
  /** Category this test belongs to. */
  category: TestCategory;
  /** Logical grouping within the category (e.g. "login flow"). */
  testType: string;
  /** Pass/fail outcome. */
  status: TestStatus;
  /** Severity of the test (impacts quality score when failed). */
  severity: Severity;
  /** Wall-clock execution time in milliseconds. */
  durationMs: number;
  /** Error message if the test failed or errored. */
  errorMessage?: string;
  /** Stack trace if available. */
  stackTrace?: string;
  /** Evidence artifacts collected during the run. */
  evidence: EvidenceLink[];
  /** Identifier of the agent that executed this test. */
  agentId: string;
  /** Whether the agent attempted self-healing on failure. */
  selfHealingAttempted: boolean;
  /** Whether self-healing resolved the failure. */
  selfHealingSucceeded: boolean;
  /** ISO 8601 timestamp when the test started. */
  startedAt: string;
  /** ISO 8601 timestamp when the test completed. */
  completedAt: string;
}

/**
 * Aggregated results for a single test category.
 */
export interface CategoryResult {
  /** Category name. */
  category: TestCategory;
  /** Total number of tests in this category. */
  total: number;
  /** Number of tests that passed. */
  passed: number;
  /** Number of tests that failed. */
  failed: number;
  /** Number of tests that were skipped. */
  skipped: number;
  /** Number of tests that errored (infrastructure issues). */
  errored: number;
  /** Pass rate as a percentage (0–100). */
  passRate: number;
  /** Total execution time in milliseconds across all tests in this category. */
  totalDurationMs: number;
  /** Evidence links collected from tests in this category. */
  evidence: EvidenceLink[];
  /** Individual test results (only in 'detailed' level). */
  tests?: TestResult[];
}

/**
 * Performance metrics for a single agent type over the run.
 */
export interface AgentPerformanceMetrics {
  /** Identifier for the agent type. */
  agentType: string;
  /** Total number of test executions by this agent. */
  totalExecutions: number;
  /** Number of tests the agent reported as passed. */
  passedCount: number;
  /** Accuracy as a percentage (passedCount / totalExecutions * 100). */
  accuracyPercent: number;
  /** Average execution time per test in milliseconds. */
  avgExecutionTimeMs: number;
  /** Total number of self-healing attempts. */
  selfHealingAttempts: number;
  /** Number of successful self-healing resolutions. */
  selfHealingSuccesses: number;
  /**
   * Self-healing success rate as a percentage.
   * 0 if no attempts were made.
   */
  selfHealingSuccessRate: number;
}

/**
 * Breakdown of the quality score calculation.
 */
export interface QualityScoreBreakdown {
  /** Base score before deductions (always 100). */
  baseScore: number;
  /** Total points deducted for failed tests. */
  totalDeductions: number;
  /** Points deducted per severity level. */
  deductionsBySeverity: Record<Severity, number>;
  /** Final clamped score (0–100). */
  finalScore: number;
  /** Letter grade derived from the final score. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

/**
 * High-level summary metrics for the entire test run.
 */
export interface ReportSummary {
  /** Total number of tests executed. */
  totalTests: number;
  /** Number of tests that passed. */
  passed: number;
  /** Number of tests that failed. */
  failed: number;
  /** Number of tests that were skipped. */
  skipped: number;
  /** Number of tests that errored. */
  errored: number;
  /** Overall pass rate as a percentage (0–100). */
  passRate: number;
  /** Total wall-clock duration of the run in milliseconds. */
  totalDurationMs: number;
  /** ISO 8601 timestamp when the run started. */
  startedAt: string;
  /** ISO 8601 timestamp when the run completed. */
  completedAt: string;
  /** Computed quality score (0–100). */
  qualityScore: number;
  /** Grade letter for the quality score. */
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Whether the run included partial or failed results. */
  hasPartialResults: boolean;
}

/**
 * Full report data for a single test run.
 */
export interface ReportData {
  /** Identifier of the test run. */
  runId: string;
  /** Project the run belongs to. */
  projectId: string;
  /** Human-readable run name or label. */
  runLabel: string;
  /** Environment the run executed against. */
  environment: string;
  /** High-level summary metrics. */
  summary: ReportSummary;
  /** Per-category result breakdowns. */
  categoryResults: CategoryResult[];
  /** All evidence links collected during the run. */
  evidenceLinks: EvidenceLink[];
  /** Quality score with full breakdown. */
  qualityScore: QualityScoreBreakdown;
  /** Per-agent performance metrics. */
  agentPerformance: AgentPerformanceMetrics[];
  /** Run status at the time of report generation. */
  runStatus: 'completed' | 'partial' | 'failed';
}

/**
 * API response envelope wrapping report data with metadata.
 */
export interface ReportResponse {
  /** Report payload (shape depends on detail level). */
  data: ReportData | ReportSummaryOnly;
  /** Response metadata. */
  meta: {
    /** ISO 8601 timestamp when this report was generated. */
    generatedAt: string;
    /** Schema version for consumers to detect breaking changes. */
    dataVersion: string;
    /** Detail level used for this report. */
    detailLevel: ReportDetailLevel;
    /** Whether this response was served from cache. */
    fromCache: boolean;
    /** Active filters applied to this report. */
    filters: Partial<ReportFilters>;
  };
}

/**
 * Summary-only variant of the report (returned when detailLevel = 'summary').
 */
export interface ReportSummaryOnly {
  runId: string;
  projectId: string;
  runLabel: string;
  environment: string;
  summary: ReportSummary;
  qualityScore: QualityScoreBreakdown;
  agentPerformance: AgentPerformanceMetrics[];
  runStatus: 'completed' | 'partial' | 'failed';
}

// ─── Filter and options structures ────────────────────────────────────────────

/**
 * Filters that narrow down the data included in the report.
 */
export interface ReportFilters {
  /** Restrict results to a specific test category. */
  category: TestCategory;
  /** Restrict results to a specific test type within a category. */
  testType: string;
  /** Restrict results to tests of a specific severity. */
  severity: Severity;
}

/**
 * Options controlling report generation behavior.
 */
export interface ReportOptions {
  /** How much detail to include in the response. */
  detailLevel: ReportDetailLevel;
  /** Optional filters to narrow report data. */
  filters?: Partial<ReportFilters>;
}

// ─── Zod validation schemas for request parsing ───────────────────────────────

const severityEnum = z.enum([
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const);

const categoryEnum = z.enum([
  'functional',
  'visual',
  'accessibility',
  'performance',
  'security',
  'api',
  'e2e',
] as const);

/**
 * Zod schema for validating GET /api/v1/runs/:id/report query parameters.
 */
export const reportQuerySchema = z.object({
  /** Controls how much data is returned. Defaults to 'summary'. */
  level: z.enum(['summary', 'detailed']).optional().default('summary'),
  /** Filter by test category. */
  category: categoryEnum.optional(),
  /** Filter by test type string. */
  testType: z.string().min(1).max(100).optional(),
  /** Filter by severity level. */
  severity: severityEnum.optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
