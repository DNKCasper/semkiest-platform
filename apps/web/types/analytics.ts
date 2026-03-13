/**
 * Analytics domain types for the Quality Intelligence Dashboard.
 */

/** Preset date range options for analytics views. */
export type DateRangeOption = '7d' | '30d' | '90d' | 'custom';

/** Date range with optional preset label. */
export interface DateRange {
  start: Date;
  end: Date;
  option: DateRangeOption;
}

// ---------------------------------------------------------------------------
// Quality Trends
// ---------------------------------------------------------------------------

/** A single data point in a quality trend time series. */
export interface QualityTrendPoint {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Pass rate as a decimal 0–1. */
  passRate: number;
  /** 7-day rolling average pass rate. */
  rollingAvg: number;
  /** Total number of tests run on this date. */
  totalTests: number;
  /** Number of failing tests. */
  failedTests: number;
}

/** Quality trend data for a single project. */
export interface QualityTrend {
  projectId: string;
  projectName: string;
  data: QualityTrendPoint[];
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/** Trend direction for leaderboard scores. */
export type TrendDirection = 'up' | 'down' | 'stable';

/** A single project entry in the quality leaderboard. */
export interface LeaderboardEntry {
  projectId: string;
  projectName: string;
  /** Weighted composite quality score (0–100). */
  score: number;
  passRate: number;
  bugsPerSprint: number;
  coverageRate: number;
  regressionRate: number;
  rank: number;
  trend: TrendDirection;
  team?: string;
}

/**
 * Configurable scoring weights for the leaderboard.
 * Values are relative weights (they will be normalised before scoring).
 */
export interface LeaderboardWeights {
  passRate: number;
  bugRate: number;
  coverage: number;
  regressionRate: number;
}

// ---------------------------------------------------------------------------
// Performance Trends (Core Web Vitals + Lighthouse)
// ---------------------------------------------------------------------------

/** A single data point in a performance trend time series. */
export interface PerformanceTrendPoint {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Largest Contentful Paint in milliseconds. */
  lcp: number;
  /** First Input Delay in milliseconds. */
  fid: number;
  /** Cumulative Layout Shift (unitless). */
  cls: number;
  /** Lighthouse performance score 0–100. */
  lighthousePerformance: number;
  /** Lighthouse accessibility score 0–100. */
  lighthouseAccessibility: number;
  /** Lighthouse best-practices score 0–100. */
  lighthouseBestPractices: number;
  /** Lighthouse SEO score 0–100. */
  lighthouseSeo: number;
}

/** Performance trend data for a single project. */
export interface PerformanceTrend {
  projectId: string;
  projectName: string;
  data: PerformanceTrendPoint[];
}

// ---------------------------------------------------------------------------
// Development Quality Metrics
// ---------------------------------------------------------------------------

/** A data point for development quality over time. */
export interface DevQualityPoint {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Sprint label e.g. "Sprint 14". */
  sprint: string;
  bugs: number;
  regressions: number;
  coveragePercent: number;
}

/** Development quality metrics for a single project. */
export interface DevQualityMetrics {
  projectId: string;
  projectName: string;
  /** Average bugs per sprint. */
  avgBugsPerSprint: number;
  /** Regression rate as a decimal 0–1. */
  regressionRate: number;
  /** Current test coverage percentage (0–100). */
  currentCoverage: number;
  data: DevQualityPoint[];
}

// ---------------------------------------------------------------------------
// AI Credit Usage
// ---------------------------------------------------------------------------

/** A single data point for AI credit consumption. */
export interface CreditUsagePoint {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  totalCredits: number;
  /** Credits consumed by test-generation agent. */
  testGeneration: number;
  /** Credits consumed by code-review agent. */
  codeReview: number;
  /** Credits consumed by bug-analysis agent. */
  bugAnalysis: number;
  /** Credits consumed by other agents. */
  other: number;
}

/** Credit usage breakdown for a single project. */
export interface ProjectCreditUsage {
  projectId: string;
  projectName: string;
  /** Total credits consumed in the selected period. */
  totalCredits: number;
  /** Credits consumed per day (burn rate). */
  burnRate: number;
  /** Projected monthly spend at current burn rate. */
  projectedMonthly: number;
  data: CreditUsagePoint[];
}

/** Summary of credit usage across all agent types. */
export interface AgentTypeSummary {
  agentType: string;
  totalCredits: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Analytics API Response types
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  totalProjects: number;
  avgPassRate: number;
  totalCreditsUsed: number;
  criticalIssues: number;
}
