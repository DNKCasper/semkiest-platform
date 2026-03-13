/**
 * Quality Trends Service (SEM-96)
 *
 * Provides:
 *  - Rolling average calculations for 7d, 30d, and 90d windows
 *  - Dashboard-friendly trend data retrieval with timezone support
 *  - Fast retrieval from pre-aggregated DailyQualityMetric rows (<500 ms SLA)
 */

import prisma from '@semkiest/db';
import { toLocalDateString, parseLocalDateString } from './metrics-aggregator';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TrendWindow = 7 | 30 | 90;

/** A single data point in a quality trend series. */
export interface TrendDataPoint {
  date: string;           // YYYY-MM-DD in the requested timezone
  passRate: number;       // 0.0 – 1.0
  bugCount: number;
  criticalBugs: number;
  highBugs: number;
  mediumBugs: number;
  lowBugs: number;
  coverage: number | null;
  runCount: number;
  totalTests: number;
}

/** Rolling average values computed over a window. */
export interface RollingAverage {
  windowDays: TrendWindow;
  avgPassRate: number;
  avgBugCount: number;
  avgCriticalBugs: number;
  avgCoverage: number | null;
  trend: 'improving' | 'degrading' | 'stable';
}

export interface QualityTrendReport {
  projectId: string;
  startDate: string;
  endDate: string;
  timezone: string;
  dataPoints: TrendDataPoint[];
  rollingAverages: {
    sevenDay: RollingAverage | null;
    thirtyDay: RollingAverage | null;
    ninetyDay: RollingAverage | null;
  };
  summary: TrendSummary;
}

export interface TrendSummary {
  latestPassRate: number | null;
  latestBugCount: number | null;
  totalRunsInPeriod: number;
  averagePassRate: number | null;
  peakPassRate: number | null;
  lowestPassRate: number | null;
}

export interface GetTrendOptions {
  /** IANA timezone identifier, e.g. "America/New_York". Defaults to "UTC". */
  timezone?: string;
  /**
   * Convenience shorthand: fetch data for the last N days ending today.
   * If provided, startDate/endDate are derived from this value.
   */
  windowDays?: TrendWindow;
  /** ISO date string or Date for start of range (inclusive). */
  startDate?: Date | string;
  /** ISO date string or Date for end of range (inclusive). */
  endDate?: Date | string;
}

// ─── Rolling Average Calculation ─────────────────────────────────────────────

/**
 * Computes a rolling average over the most recent `windowDays` data points.
 * Returns null when there is insufficient data (fewer than 2 points).
 *
 * Also classifies the trend direction by comparing the first half of the
 * window to the second half.
 */
export function calculateRollingAverage(
  points: TrendDataPoint[],
  windowDays: TrendWindow,
): RollingAverage | null {
  if (points.length < 2) return null;

  const window = points.slice(-windowDays);
  if (window.length === 0) return null;

  const avgPassRate = avg(window.map((p) => p.passRate));
  const avgBugCount = avg(window.map((p) => p.bugCount));
  const avgCriticalBugs = avg(window.map((p) => p.criticalBugs));

  const coveragePoints = window
    .map((p) => p.coverage)
    .filter((c): c is number => c !== null);
  const avgCoverage = coveragePoints.length > 0 ? avg(coveragePoints) : null;

  // Trend direction: compare first half vs second half pass rate
  const mid = Math.floor(window.length / 2);
  const firstHalf = window.slice(0, mid);
  const secondHalf = window.slice(mid);

  const firstAvg = firstHalf.length > 0 ? avg(firstHalf.map((p) => p.passRate)) : avgPassRate;
  const secondAvg = secondHalf.length > 0 ? avg(secondHalf.map((p) => p.passRate)) : avgPassRate;
  const delta = secondAvg - firstAvg;

  let trend: RollingAverage['trend'];
  if (delta > 0.02) {
    trend = 'improving';
  } else if (delta < -0.02) {
    trend = 'degrading';
  } else {
    trend = 'stable';
  }

  return { windowDays, avgPassRate, avgBugCount, avgCriticalBugs, avgCoverage, trend };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ─── Data Retrieval ───────────────────────────────────────────────────────────

/**
 * Resolves the effective date range from options.
 * Falls back to last 30 days if nothing is provided.
 */
function resolveDateRange(
  options: GetTrendOptions,
  now: Date,
): { start: Date; end: Date } {
  const timezone = options.timezone ?? 'UTC';
  const todayStr = toLocalDateString(now, timezone);
  const end = parseLocalDateString(todayStr);

  if (options.startDate !== undefined && options.endDate !== undefined) {
    const start =
      typeof options.startDate === 'string'
        ? parseLocalDateString(options.startDate.slice(0, 10))
        : options.startDate;
    const resolvedEnd =
      typeof options.endDate === 'string'
        ? parseLocalDateString(options.endDate.slice(0, 10))
        : options.endDate;
    return { start, end: resolvedEnd };
  }

  const windowDays = options.windowDays ?? 30;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - windowDays + 1);
  return { start, end };
}

/**
 * Retrieves quality trend data for a project from pre-aggregated daily metrics.
 *
 * Performance: Queries only the `daily_quality_metrics` table with indexed
 * filters on (projectId, metricDate) for sub-500 ms response times.
 */
export async function getQualityTrends(
  projectId: string,
  options: GetTrendOptions = {},
): Promise<QualityTrendReport> {
  const timezone = options.timezone ?? 'UTC';
  const { start, end } = resolveDateRange(options, new Date());

  // Fetch one extra day before start to have context for first-point trend calculation
  const fetchStart = new Date(start);
  fetchStart.setUTCDate(fetchStart.getUTCDate() - 1);

  const rawMetrics = await prisma.dailyQualityMetric.findMany({
    where: {
      projectId,
      timezone,
      metricDate: { gte: fetchStart, lte: end },
    },
    orderBy: { metricDate: 'asc' },
  });

  const dataPoints: TrendDataPoint[] = rawMetrics
    .filter((m) => m.metricDate >= start) // exclude the pre-fetch day
    .map((m) => ({
      date: toLocalDateString(m.metricDate, timezone),
      passRate: m.passRate,
      bugCount: m.bugCount,
      criticalBugs: m.criticalBugs,
      highBugs: m.highBugs,
      mediumBugs: m.mediumBugs,
      lowBugs: m.lowBugs,
      coverage: m.avgCoverage,
      runCount: m.runCount,
      totalTests: m.totalTests,
    }));

  // Rolling averages (use all fetched metrics as the baseline window)
  const allPoints: TrendDataPoint[] = rawMetrics.map((m) => ({
    date: toLocalDateString(m.metricDate, timezone),
    passRate: m.passRate,
    bugCount: m.bugCount,
    criticalBugs: m.criticalBugs,
    highBugs: m.highBugs,
    mediumBugs: m.mediumBugs,
    lowBugs: m.lowBugs,
    coverage: m.avgCoverage,
    runCount: m.runCount,
    totalTests: m.totalTests,
  }));

  const sevenDay = calculateRollingAverage(allPoints, 7);
  const thirtyDay = calculateRollingAverage(allPoints, 30);
  const ninetyDay = calculateRollingAverage(allPoints, 90);

  const summary = buildSummary(dataPoints);

  return {
    projectId,
    startDate: toLocalDateString(start, timezone),
    endDate: toLocalDateString(end, timezone),
    timezone,
    dataPoints,
    rollingAverages: { sevenDay, thirtyDay, ninetyDay },
    summary,
  };
}

function buildSummary(points: TrendDataPoint[]): TrendSummary {
  if (points.length === 0) {
    return {
      latestPassRate: null,
      latestBugCount: null,
      totalRunsInPeriod: 0,
      averagePassRate: null,
      peakPassRate: null,
      lowestPassRate: null,
    };
  }

  const last = points[points.length - 1];
  const passRates = points.map((p) => p.passRate);

  return {
    latestPassRate: last?.passRate ?? null,
    latestBugCount: last?.bugCount ?? null,
    totalRunsInPeriod: points.reduce((sum, p) => sum + p.runCount, 0),
    averagePassRate: avg(passRates),
    peakPassRate: Math.max(...passRates),
    lowestPassRate: Math.min(...passRates),
  };
}

// ─── Trend Data for Multiple Projects ────────────────────────────────────────

export interface ProjectTrendSummary {
  projectId: string;
  projectName: string;
  latestPassRate: number | null;
  sevenDayTrend: RollingAverage['trend'] | null;
  thirtyDayAvgPassRate: number | null;
}

/**
 * Returns lightweight trend summaries for all projects in an organization,
 * suitable for a leaderboard or overview dashboard widget.
 */
export async function getOrganizationTrendSummaries(
  organizationId: string,
  timezone: string = 'UTC',
): Promise<ProjectTrendSummary[]> {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });

  const summaries = await Promise.all(
    projects.map(async (project) => {
      const report = await getQualityTrends(project.id, {
        timezone,
        windowDays: 30,
      });
      return {
        projectId: project.id,
        projectName: project.name,
        latestPassRate: report.summary.latestPassRate,
        sevenDayTrend: report.rollingAverages.sevenDay?.trend ?? null,
        thirtyDayAvgPassRate: report.rollingAverages.thirtyDay?.avgPassRate ?? null,
      };
    }),
  );

  return summaries;
}
