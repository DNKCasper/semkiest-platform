/**
 * Test run domain types for the SemkiEst platform.
 */

export type RunStatus =
  | 'queued'
  | 'pending'
  | 'initializing'
  | 'running'
  | 'passed'
  | 'failed'
  | 'mixed'
  | 'completed'
  | 'cancelled';

export type TriggerType = 'manual' | 'ci' | 'scheduled';

/** Canonical test category keys used throughout the platform. */
export type TestCategory =
  | 'ui'
  | 'visual'
  | 'performance'
  | 'accessibility'
  | 'security'
  | 'api';

/** Status of an individual test result. */
export type TestStatus = 'pass' | 'fail' | 'warning' | 'skip';

/** Severity level of a test result. */
export type TestSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Evidence artifact attached to a test result (screenshot, video, etc.). */
export interface Evidence {
  id: string;
  type: 'screenshot' | 'video' | 'log' | 'diff' | 'network_log';
  url: string;
  label?: string;
  timestamp?: string;
}

/** Self-healing event data attached to a result. */
export interface SelfHealingEvent {
  description: string;
  resolution: string;
  timestamp: string;
}

/** Rich test result used by ResultCard in the run-detail UI. */
export interface TestResult {
  id: string;
  name: string;
  description?: string;
  status: TestStatus;
  severity: TestSeverity;
  duration: number;
  error?: string;
  evidence?: Evidence[];
  selfHealingEvent?: SelfHealingEvent;
  category?: string;
}

/** Aggregated stats for a category section. */
export interface CategoryStats {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
}

/** Category results group for the run-detail page. */
export interface CategoryResults {
  category: TestCategory;
  stats: CategoryStats;
  results: TestResult[];
}

/** Summary statistics for a test run */
export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  duration: number;
}

export interface TestRun {
  id: string;
  projectId: string;
  status: RunStatus;
  triggerType: TriggerType;
  /** Optional test category filter applied to this run */
  category?: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  /** Number of completed tests (for progress tracking) */
  completedTests: number;
  /** Pass rate as a value between 0 and 1 */
  passRate: number;
  /** Duration in seconds */
  duration: number;
  startedAt: string;
  completedAt?: string;
  /** Alias for startedAt used by the run-detail page */
  triggeredAt: string;
  triggeredBy?: string;
  branch?: string;
  commitSha?: string;
  /** Error message if the run failed at the infrastructure level */
  error?: string;
  /** Computed summary stats */
  summary?: RunSummary;
  /** Results grouped by category for the detail page */
  categories: CategoryResults[];
  /** Test profile used for this run */
  profile?: {
    id: string;
    name: string;
  };
  /** Raw test results from the API */
  testResults?: any[];
  /** Test profile relationship from the API */
  testProfile?: any;
}

export interface RunListResponse {
  data: TestRun[];
  total: number;
  page: number;
  pageSize: number;
}

export type RunSortField = 'startedAt' | 'duration' | 'passRate' | 'totalTests';
export type SortDirection = 'asc' | 'desc';

export interface RunFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: RunStatus | 'all';
  triggerType?: TriggerType | 'all';
  category?: string;
}

export interface RunQueryParams extends RunFilters {
  page?: number;
  pageSize?: number;
  sort?: RunSortField;
  sortDir?: SortDirection;
}

/** Data point for the pass-rate trend mini-chart */
export interface RunTrendPoint {
  runId: string;
  startedAt: string;
  passRate: number;
}

export interface RunTrendResponse {
  data: RunTrendPoint[];
}

/** Simplified test profile for run trigger UI */
export interface TestProfile {
  id: string;
  name: string;
  description?: string;
  categories: string[];
  settings: Record<string, unknown>;
  isDefault?: boolean;
}

/** Input for triggering a new test run */
export interface TriggerRunInput {
  profileId: string;
}

/** Test result within a run (legacy, used by TestRunDetail) */
export interface TestResultItem {
  id: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error' | 'running' | 'pending';
  errorMessage?: string;
  duration?: number;
  category?: string;
  steps?: TestStepItem[];
}

/** Individual test step */
export interface TestStepItem {
  id: string;
  stepNumber: number;
  action: string;
  expected?: string;
  actual?: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  screenshotUrl?: string;
}

/** Detailed test run with results */
export interface TestRunDetail extends TestRun {
  results: TestResultItem[];
  profile?: {
    id: string;
    name: string;
  };
}

/** A live test result update from WebSocket (raw from server). */
export interface LiveTestResult {
  id: string;
  testName: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR' | 'RUNNING' | 'PENDING';
  errorMessage?: string;
  category?: string;
}

/** Discriminated union of all WebSocket message types */
export type RunUpdateMessage =
  | { type: 'run.status'; runId: string; status: RunStatus }
  | { type: 'run.result'; runId: string; result: LiveTestResult }
  | { type: 'run.summary'; runId: string; summary: RunSummary }
  | { type: 'run.complete'; runId: string; run: { status: RunStatus; summary: RunSummary } };
