/**
 * Test run domain types for the SemkiEst platform.
 */

export type RunStatus = 'passed' | 'failed' | 'mixed' | 'running' | 'cancelled';

export type TriggerType = 'manual' | 'ci' | 'scheduled';

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
  /** Pass rate as a value between 0 and 1 */
  passRate: number;
  /** Duration in seconds */
  duration: number;
  startedAt: string;
  completedAt?: string;
  triggeredBy?: string;
  branch?: string;
  commitSha?: string;
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

/** Test result within a run */
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

/** Summary statistics for a test run */
export interface RunSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  passRate: number;
  duration: number | null;
}

/** A live test result update from WebSocket */
export interface TestResult {
  id: string;
  testName: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR' | 'RUNNING' | 'PENDING';
  errorMessage?: string;
  category?: string;
}

/** Discriminated union of all WebSocket message types */
export type RunUpdateMessage =
  | { type: 'run.status'; runId: string; status: RunStatus }
  | { type: 'run.result'; runId: string; result: TestResult }
  | { type: 'run.summary'; runId: string; summary: RunSummary }
  | { type: 'run.complete'; runId: string; run: { status: RunStatus; summary: RunSummary } };
