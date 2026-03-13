/** Status of an individual test result */
export type TestStatus = 'pass' | 'fail' | 'warning' | 'skip';

/** Severity level of a test */
export type TestSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Test category grouping */
export type TestCategory =
  | 'ui'
  | 'visual'
  | 'performance'
  | 'accessibility'
  | 'security'
  | 'api';

/** Overall status of a test run */
export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';

/** How the test run was triggered */
export type TriggerType = 'manual' | 'scheduled' | 'ci';

/** Screenshot or log evidence attached to a test result */
export interface Evidence {
  id: string;
  type: 'screenshot' | 'network_log' | 'video';
  url: string;
  thumbnailUrl?: string;
  label?: string;
  /** URL of the baseline/expected image for visual diff comparison */
  comparisonUrl?: string;
}

/** Auto-remediation event attached to a test result */
export interface SelfHealingEvent {
  id: string;
  description: string;
  resolution: string;
  timestamp: string;
}

/** Individual test result within a run */
export interface TestResult {
  id: string;
  runId: string;
  category: TestCategory;
  name: string;
  description: string;
  status: TestStatus;
  severity: TestSeverity;
  /** Duration in milliseconds */
  duration: number;
  evidence?: Evidence[];
  selfHealingEvent?: SelfHealingEvent;
  error?: string;
}

/** Aggregated stats for a category within a run */
export interface CategoryStats {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
}

/** Results grouped by category */
export interface CategoryResults {
  category: TestCategory;
  results: TestResult[];
  stats: CategoryStats;
}

/** Overall run summary statistics */
export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  /** Total duration in milliseconds */
  duration: number;
}

/** Full test run record */
export interface TestRun {
  id: string;
  projectId: string;
  status: RunStatus;
  triggeredAt: string;
  completedAt?: string;
  triggeredBy?: string;
  triggerType: TriggerType;
  summary: RunSummary;
  categories: CategoryResults[];
}

/** Paginated list of runs */
export interface RunListResponse {
  data: TestRun[];
  total: number;
  page: number;
  pageSize: number;
}

/** Query params for listing runs */
export interface RunQueryParams {
  page?: number;
  pageSize?: number;
  status?: RunStatus;
  triggerType?: TriggerType;
  dateFrom?: string;
  dateTo?: string;
}

/** Union of all WebSocket message types for real-time run updates */
export type RunUpdateMessage =
  | { type: 'run.status'; status: RunStatus }
  | { type: 'run.result'; result: TestResult }
  | { type: 'run.summary'; summary: RunSummary }
  | { type: 'run.complete'; run: TestRun };
