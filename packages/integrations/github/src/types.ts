/**
 * Shared types for the SemkiEst GitHub integration.
 * Used by both the platform-side library (pr-check, comment-builder) and API consumers.
 */

/** Status of a SemkiEst test run */
export type TestRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/** Source that triggered the test run */
export type TriggerSource = 'github_pr' | 'github_push' | 'manual';

/** Metadata about the GitHub context that triggered the run */
export interface GitHubTriggerMetadata {
  commitSha?: string;
  prNumber?: number;
  branch?: string;
  repository?: string;
}

/** Request payload to trigger a SemkiEst test run */
export interface TriggerTestRunRequest {
  projectId: string;
  testProfile?: string;
  triggerSource: TriggerSource;
  metadata?: GitHubTriggerMetadata;
}

/** Response from the SemkiEst API when triggering a test run */
export interface TriggerTestRunResponse {
  runId: string;
  status: TestRunStatus;
  createdAt: string;
}

/** Summary statistics for a completed test run */
export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  errorMessage?: string;
}

/** Full test run result returned from polling the SemkiEst API */
export interface TestRunResult {
  runId: string;
  projectId: string;
  status: TestRunStatus;
  testProfile: string | null;
  summary: TestRunSummary | null;
  reportUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** Options for creating or updating a GitHub commit status check */
export interface PRCheckOptions {
  /** GitHub token with `repo:status` scope */
  token: string;
  /** Repository owner (user or org) */
  owner: string;
  /** Repository name */
  repo: string;
  /** Full commit SHA to attach the status to */
  commitSha: string;
  /** GitHub commit status state */
  state: 'pending' | 'success' | 'failure' | 'error';
  /** Short description displayed in the PR checks UI (max 140 chars) */
  description: string;
  /** Link target for the status check (e.g., report URL) */
  targetUrl?: string;
  /** Unique context label for this check (default: 'semkiest/test-run') */
  context?: string;
}

/** Options for posting a comment on a GitHub Pull Request */
export interface PRCommentOptions {
  /** GitHub token with `pull_requests:write` scope */
  token: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Pull Request number */
  prNumber: number;
  /** Markdown comment body */
  body: string;
}

/** Options for triggering a test run via the SemkiEst API */
export interface TriggerTestRunOptions {
  /** SemkiEst API base URL */
  apiUrl: string;
  /** SemkiEst API authentication token */
  apiToken: string;
  /** Request payload */
  request: TriggerTestRunRequest;
}

/** Options for polling a test run until completion */
export interface PollTestRunOptions {
  /** SemkiEst API base URL */
  apiUrl: string;
  /** SemkiEst API authentication token */
  apiToken: string;
  /** Test run ID returned from triggering */
  runId: string;
  /** Polling interval in milliseconds (default: 5000) */
  intervalMs?: number;
  /** Maximum total wait time in milliseconds (default: 600000 = 10 min) */
  timeoutMs?: number;
}

/** Options for fetching the current status of a single test run */
export interface GetTestRunStatusOptions {
  apiUrl: string;
  apiToken: string;
  runId: string;
}
