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
