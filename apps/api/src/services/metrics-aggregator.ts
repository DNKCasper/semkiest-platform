/**
 * Metrics Aggregation Service (SEM-96)
 *
 * Responsible for:
 *  - Rolling up raw TestRun records into DailyQualityMetric rows
 *  - Enforcing data-retention policy (raw: 90 days, aggregated: 2 years)
 *  - Providing a pipeline entry point suitable for BullMQ job invocation
 *
 * Timezone awareness:
 *   Each metric bucket is keyed by (projectId, metricDate, timezone).
 *   "metricDate" is the calendar date in the target timezone — a run at
 *   23:30 UTC may belong to the next calendar day in UTC+1.
 */

import prisma from '@semkiest/db';
import {
  detectRegression,
  resolveThresholdConfig,
  buildAlertPayloads,
} from './regression-detector';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Raw test-run records are purged after this many days. */
const RAW_RETENTION_DAYS = 90;

/** Aggregated daily metrics are retained for this many days (~2 years). */
const AGGREGATED_RETENTION_DAYS = 730;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a UTC Date to a YYYY-MM-DD string in the given IANA timezone.
 * Uses the built-in Intl API — no external dependencies required.
 */
export function toLocalDateString(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    // Fall back to UTC date if timezone is invalid
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Parses a YYYY-MM-DD string into a UTC-midnight Date, suitable for
 * storing in a Postgres DATE column without timezone drift.
 */
export function parseLocalDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

// ─── Core Aggregation ────────────────────────────────────────────────────────

export interface AggregationResult {
  projectId: string;
  metricDate: string; // YYYY-MM-DD
  timezone: string;
  runCount: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  passRate: number;
  bugCount: number;
  criticalBugs: number;
  highBugs: number;
  mediumBugs: number;
  lowBugs: number;
  avgCoverage: number | null;
  avgDurationMs: number | null;
}

/**
 * Aggregates all TestRun records for a project on a given calendar date
 * (expressed in `timezone`) into a DailyQualityMetric row.
 *
 * Returns null when there are no test runs for the given date.
 */
export async function aggregateDailyMetrics(
  projectId: string,
  date: Date,
  timezone: string = 'UTC',
): Promise<AggregationResult | null> {
  const dateStr = toLocalDateString(date, timezone);

  // Determine UTC window that covers the full local calendar day
  // We fetch a 27-hour window centred on UTC noon to cover any UTC offset
  const startUtc = new Date(`${dateStr}T00:00:00Z`);
  startUtc.setUTCHours(startUtc.getUTCHours() - 14); // UTC-14 earliest offset
  const endUtc = new Date(`${dateStr}T00:00:00Z`);
  endUtc.setUTCHours(endUtc.getUTCHours() + 38); // UTC+14 latest offset + 24h day

  const runs = await prisma.testRun.findMany({
    where: {
      projectId,
      runAt: { gte: startUtc, lt: endUtc },
    },
    include: { bugReports: true },
  });

  // Filter to runs that actually belong to this calendar day in the timezone
  const runsForDay = runs.filter(
    (r) => toLocalDateString(r.runAt, timezone) === dateStr,
  );

  if (runsForDay.length === 0) return null;

  // Accumulate totals
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;
  let bugCount = 0;
  let criticalBugs = 0;
  let highBugs = 0;
  let mediumBugs = 0;
  let lowBugs = 0;
  let coverageSum = 0;
  let coverageCount = 0;
  let durationSum = 0;

  for (const run of runsForDay) {
    totalTests += run.totalTests;
    passedTests += run.passedTests;
    failedTests += run.failedTests;
    skippedTests += run.skippedTests;
    durationSum += run.durationMs;

    if (run.coverage !== null) {
      coverageSum += run.coverage;
      coverageCount++;
    }

    bugCount += run.bugReports.length;
    for (const bug of run.bugReports) {
      switch (bug.severity) {
        case 'CRITICAL':
          criticalBugs++;
          break;
        case 'HIGH':
          highBugs++;
          break;
        case 'MEDIUM':
          mediumBugs++;
          break;
        case 'LOW':
          lowBugs++;
          break;
        default:
          break;
      }
    }
  }

  const passRate = totalTests > 0 ? passedTests / totalTests : 0;
  const avgCoverage = coverageCount > 0 ? coverageSum / coverageCount : null;
  const avgDurationMs = runsForDay.length > 0 ? durationSum / runsForDay.length : null;

  const result: AggregationResult = {
    projectId,
    metricDate: dateStr,
    timezone,
    runCount: runsForDay.length,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
    passRate,
    bugCount,
    criticalBugs,
    highBugs,
    mediumBugs,
    lowBugs,
    avgCoverage,
    avgDurationMs,
  };

  // Upsert into DailyQualityMetric
  await prisma.dailyQualityMetric.upsert({
    where: {
      projectId_metricDate_timezone: {
        projectId,
        metricDate: parseLocalDateString(dateStr),
        timezone,
      },
    },
    create: {
      projectId,
      metricDate: parseLocalDateString(dateStr),
      timezone,
      ...buildMetricPayload(result),
    },
    update: buildMetricPayload(result),
  });

  return result;
}

function buildMetricPayload(result: AggregationResult): {
  runCount: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  passRate: number;
  bugCount: number;
  criticalBugs: number;
  highBugs: number;
  mediumBugs: number;
  lowBugs: number;
  avgCoverage: number | null;
  avgDurationMs: number | null;
} {
  return {
    runCount: result.runCount,
    totalTests: result.totalTests,
    passedTests: result.passedTests,
    failedTests: result.failedTests,
    skippedTests: result.skippedTests,
    passRate: result.passRate,
    bugCount: result.bugCount,
    criticalBugs: result.criticalBugs,
    highBugs: result.highBugs,
    mediumBugs: result.mediumBugs,
    lowBugs: result.lowBugs,
    avgCoverage: result.avgCoverage,
    avgDurationMs: result.avgDurationMs,
  };
}

// ─── Regression Detection Trigger ────────────────────────────────────────────

/**
 * After aggregating today's metrics, runs the regression detector and
 * persists any new alerts. Skips projects with no historical data.
 */
export async function detectAndPersistRegressions(
  projectId: string,
  metricDate: Date,
  timezone: string = 'UTC',
): Promise<number> {
  const dateStr = toLocalDateString(metricDate, timezone);
  const targetDate = parseLocalDateString(dateStr);

  // Fetch the metric we just aggregated
  const todayMetric = await prisma.dailyQualityMetric.findUnique({
    where: {
      projectId_metricDate_timezone: { projectId, metricDate: targetDate, timezone },
    },
  });
  if (todayMetric === null) return 0;

  // Fetch last 90 days of historical metrics (excluding today) for baseline
  const ninetyDaysAgo = new Date(targetDate);
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);

  const historical = await prisma.dailyQualityMetric.findMany({
    where: {
      projectId,
      timezone,
      metricDate: { gte: ninetyDaysAgo, lt: targetDate },
    },
    orderBy: { metricDate: 'asc' },
  });

  // Resolve threshold config (project overrides org)
  const [projectThreshold, project] = await Promise.all([
    prisma.qualityThreshold.findFirst({
      where: { projectId },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    }),
  ]);

  const orgThreshold = project
    ? await prisma.qualityThreshold.findFirst({
        where: { organizationId: project.organizationId, projectId: null },
      })
    : null;

  const config = resolveThresholdConfig(orgThreshold, projectThreshold);
  const result = detectRegression(todayMetric, historical, config);

  if (!result.hasRegression) return 0;

  const payloads = buildAlertPayloads(result);
  await prisma.regressionAlert.createMany({ data: payloads });

  return payloads.length;
}

// ─── Full Pipeline ────────────────────────────────────────────────────────────

export interface PipelineRunResult {
  projectId: string;
  aggregated: boolean;
  alertsCreated: number;
  error?: string;
}

/**
 * Runs the full aggregation + regression detection pipeline for a single project.
 * Intended to be called by the BullMQ daily-aggregation job.
 */
export async function runAggregationPipeline(
  projectId: string,
  date: Date,
  timezone: string = 'UTC',
): Promise<PipelineRunResult> {
  try {
    const aggregated = await aggregateDailyMetrics(projectId, date, timezone);
    if (aggregated === null) {
      return { projectId, aggregated: false, alertsCreated: 0 };
    }

    const alertsCreated = await detectAndPersistRegressions(projectId, date, timezone);
    return { projectId, aggregated: true, alertsCreated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { projectId, aggregated: false, alertsCreated: 0, error: message };
  }
}

/**
 * Processes all active projects for a given date and timezone.
 * Returns per-project pipeline results.
 */
export async function processAllProjects(
  date: Date,
  timezone: string = 'UTC',
): Promise<PipelineRunResult[]> {
  const projects = await prisma.project.findMany({ select: { id: true } });
  const results = await Promise.all(
    projects.map((p) => runAggregationPipeline(p.id, date, timezone)),
  );
  return results;
}

// ─── Data Retention ───────────────────────────────────────────────────────────

export interface RetentionResult {
  rawRunsDeleted: number;
  aggregatedMetricsDeleted: number;
}

/**
 * Enforces data retention policies:
 *  - Raw TestRun records older than 90 days are deleted
 *  - DailyQualityMetric records older than 2 years are deleted
 *
 * Should be called once daily, after aggregation has completed.
 */
export async function applyRetentionPolicy(now: Date = new Date()): Promise<RetentionResult> {
  const rawCutoff = new Date(now);
  rawCutoff.setUTCDate(rawCutoff.getUTCDate() - RAW_RETENTION_DAYS);

  const aggregatedCutoff = new Date(now);
  aggregatedCutoff.setUTCDate(aggregatedCutoff.getUTCDate() - AGGREGATED_RETENTION_DAYS);

  const [rawResult, aggregatedResult] = await Promise.all([
    prisma.testRun.deleteMany({
      where: { runAt: { lt: rawCutoff } },
    }),
    prisma.dailyQualityMetric.deleteMany({
      where: { metricDate: { lt: aggregatedCutoff } },
    }),
  ]);

  return {
    rawRunsDeleted: rawResult.count,
    aggregatedMetricsDeleted: aggregatedResult.count,
  };
}
