/**
 * Dashboard TypeScript type definitions.
 * All types are designed for easy API replacement — mock data uses the same shapes.
 */

/** Aggregated quality metrics across all projects */
export interface QualityMetrics {
  /** Total number of projects under management */
  totalProjects: number;
  /** Number of currently active/in-progress test runs */
  activeTestRuns: number;
  /** Aggregated pass rate across all projects (0–100) */
  overallPassRate: number;
  /** Number of tests with variable (flaky) results */
  flakyTestCount: number;
  /** Average test execution time in seconds */
  avgExecutionTimeSeconds: number;
  /** Total test coverage percentage (0–100) */
  totalCoveragePercent: number;
}

/** Type of activity event in the feed */
export type ActivityEventType =
  | 'test_run_completed'
  | 'test_run_failed'
  | 'test_run_started'
  | 'project_created'
  | 'tests_triggered'
  | 'issue_discovered';

/** A single entry in the recent activity feed */
export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string;
  timestamp: Date;
  user?: string;
  projectName?: string;
  /** Arbitrary metadata for future extensibility */
  metadata?: Record<string, unknown>;
}

/** Breakdown of AI credit usage per agent type */
export interface AgentCreditUsage {
  agentType: string;
  creditsUsed: number;
}

/** AI credit consumption summary */
export interface CreditSummary {
  /** Total credits available in the current billing period */
  totalCredits: number;
  /** Credits consumed so far this period */
  usedCredits: number;
  /** Human-readable label for the current period (e.g. "March 2026") */
  periodLabel: string;
  /** Average credits consumed per day */
  burnRatePerDay: number;
  /** Estimated date credits will be exhausted, or null if sufficient */
  estimatedDepletionDate: Date | null;
  /** Per-agent breakdown */
  byAgentType: AgentCreditUsage[];
}

/** A single project row in the quality leaderboard */
export interface LeaderboardEntry {
  id: string;
  name: string;
  /** Pass rate percentage (0–100) */
  passRate: number;
  /** Total number of tests in the project */
  totalTests: number;
  /** Number of test runs executed in the last 30 days */
  recentRuns: number;
  /** Composite health score (0–100) */
  healthScore: number;
  /** Timestamp of the most recent test run */
  lastRunAt: Date;
}

/** Sort column options for the leaderboard */
export type LeaderboardSortKey =
  | 'passRate'
  | 'totalTests'
  | 'recentRuns'
  | 'healthScore'
  | 'lastRunAt';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';
