import type {
  AgentPerformanceMetrics,
  CategoryResult,
  EvidenceLink,
  QualityScoreBreakdown,
  ReportData,
  ReportFilters,
  ReportOptions,
  ReportSummary,
  ReportSummaryOnly,
  Severity,
  TestCategory,
  TestResult,
} from '../types/report';
import { SEVERITY_WEIGHTS } from '../types/report';

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  report: ReportData;
  expiresAt: number;
}

/** In-memory report cache. Keyed by runId. */
const reportCache = new Map<string, CacheEntry>();

function getCached(runId: string): ReportData | null {
  const entry = reportCache.get(runId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    reportCache.delete(runId);
    return null;
  }
  return entry.report;
}

function setCache(runId: string, report: ReportData): void {
  reportCache.set(runId, { report, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Clears the entire report cache. Useful in tests. */
export function clearReportCache(): void {
  reportCache.clear();
}

// ─── Quality score ────────────────────────────────────────────────────────────

/**
 * Calculates a quality score (0–100) from test results using severity weighting.
 *
 * Algorithm:
 *   score = clamp(100 - Σ(SEVERITY_WEIGHT[sev] * failCount[sev]), 0, 100)
 *
 * Grade thresholds:
 *   A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F < 40
 */
export function calculateQualityScore(
  tests: TestResult[],
): QualityScoreBreakdown {
  const deductionsBySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const test of tests) {
    if (test.status === 'failed' || test.status === 'error') {
      const weight = SEVERITY_WEIGHTS[test.severity];
      deductionsBySeverity[test.severity] += weight;
    }
  }

  const totalDeductions = Object.values(deductionsBySeverity).reduce(
    (sum, d) => sum + d,
    0,
  );
  const finalScore = Math.max(0, Math.min(100, 100 - totalDeductions));

  const grade =
    finalScore >= 90
      ? 'A'
      : finalScore >= 75
        ? 'B'
        : finalScore >= 60
          ? 'C'
          : finalScore >= 40
            ? 'D'
            : 'F';

  return {
    baseScore: 100,
    totalDeductions,
    deductionsBySeverity,
    finalScore,
    grade,
  };
}

// ─── Agent metrics ────────────────────────────────────────────────────────────

/**
 * Aggregates per-agent performance metrics from raw test results.
 */
export function calculateAgentMetrics(
  tests: TestResult[],
): AgentPerformanceMetrics[] {
  const byAgent = new Map<
    string,
    {
      executions: number;
      passed: number;
      totalDurationMs: number;
      healingAttempts: number;
      healingSuccesses: number;
    }
  >();

  for (const test of tests) {
    const existing = byAgent.get(test.agentId) ?? {
      executions: 0,
      passed: 0,
      totalDurationMs: 0,
      healingAttempts: 0,
      healingSuccesses: 0,
    };

    existing.executions += 1;
    if (test.status === 'passed') existing.passed += 1;
    existing.totalDurationMs += test.durationMs;
    if (test.selfHealingAttempted) {
      existing.healingAttempts += 1;
      if (test.selfHealingSucceeded) existing.healingSuccesses += 1;
    }

    byAgent.set(test.agentId, existing);
  }

  return Array.from(byAgent.entries()).map(([agentType, metrics]) => ({
    agentType,
    totalExecutions: metrics.executions,
    passedCount: metrics.passed,
    accuracyPercent:
      metrics.executions > 0
        ? Math.round((metrics.passed / metrics.executions) * 100 * 10) / 10
        : 0,
    avgExecutionTimeMs:
      metrics.executions > 0
        ? Math.round(metrics.totalDurationMs / metrics.executions)
        : 0,
    selfHealingAttempts: metrics.healingAttempts,
    selfHealingSuccesses: metrics.healingSuccesses,
    selfHealingSuccessRate:
      metrics.healingAttempts > 0
        ? Math.round(
            (metrics.healingSuccesses / metrics.healingAttempts) * 100 * 10,
          ) / 10
        : 0,
  }));
}

// ─── Category aggregation ─────────────────────────────────────────────────────

/**
 * Groups test results by category and computes per-category aggregate metrics.
 */
export function buildCategoryResults(
  tests: TestResult[],
  includeTests: boolean,
): CategoryResult[] {
  const byCategory = new Map<TestCategory, TestResult[]>();

  for (const test of tests) {
    const existing = byCategory.get(test.category) ?? [];
    existing.push(test);
    byCategory.set(test.category, existing);
  }

  return Array.from(byCategory.entries()).map(([category, categoryTests]) => {
    const passed = categoryTests.filter((t) => t.status === 'passed').length;
    const failed = categoryTests.filter((t) => t.status === 'failed').length;
    const skipped = categoryTests.filter((t) => t.status === 'skipped').length;
    const errored = categoryTests.filter((t) => t.status === 'error').length;
    const totalDurationMs = categoryTests.reduce(
      (sum, t) => sum + t.durationMs,
      0,
    );
    const evidence: EvidenceLink[] = categoryTests.flatMap((t) => t.evidence);

    return {
      category,
      total: categoryTests.length,
      passed,
      failed,
      skipped,
      errored,
      passRate:
        categoryTests.length > 0
          ? Math.round((passed / categoryTests.length) * 100 * 10) / 10
          : 0,
      totalDurationMs,
      evidence,
      ...(includeTests ? { tests: categoryTests } : {}),
    };
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * Computes the high-level run summary from individual test results.
 */
export function buildSummary(
  tests: TestResult[],
  runStartedAt: string,
  runCompletedAt: string,
  qualityScore: QualityScoreBreakdown,
  hasPartialResults: boolean,
): ReportSummary {
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  const errored = tests.filter((t) => t.status === 'error').length;
  const totalDurationMs = tests.reduce((sum, t) => sum + t.durationMs, 0);

  return {
    totalTests: tests.length,
    passed,
    failed,
    skipped,
    errored,
    passRate:
      tests.length > 0
        ? Math.round((passed / tests.length) * 100 * 10) / 10
        : 0,
    totalDurationMs,
    startedAt: runStartedAt,
    completedAt: runCompletedAt,
    qualityScore: qualityScore.finalScore,
    qualityGrade: qualityScore.grade,
    hasPartialResults,
  };
}

// ─── Filtering ────────────────────────────────────────────────────────────────

/**
 * Applies optional filters to the raw test result set.
 */
export function applyFilters(
  tests: TestResult[],
  filters: Partial<ReportFilters> | undefined,
): TestResult[] {
  if (!filters) return tests;

  return tests.filter((t) => {
    if (filters.category && t.category !== filters.category) return false;
    if (filters.testType && t.testType !== filters.testType) return false;
    if (filters.severity && t.severity !== filters.severity) return false;
    return true;
  });
}

// ─── Data fetching stub ───────────────────────────────────────────────────────

/**
 * Raw test run record from the data layer.
 * Replace the body of `fetchTestRunData` to connect to a real database.
 */
export interface RawTestRun {
  id: string;
  projectId: string;
  label: string;
  environment: string;
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'partial' | 'failed';
  tests: TestResult[];
}

/**
 * Fetches raw test run data from the database.
 *
 * This stub returns `null` for unknown run IDs. In production, replace the
 * body with an actual database query (e.g. via Prisma):
 *
 * ```ts
 * const run = await prisma.testRun.findUnique({ where: { id: runId }, include: { results: true } });
 * return run ? mapPrismaRunToRaw(run) : null;
 * ```
 */
export async function fetchTestRunData(
  runId: string,
): Promise<RawTestRun | null> {
  // Production implementation should query the database here.
  // Returning null signals a 404 to the route handler.
  void runId;
  return null;
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Generates a complete report from a raw test run record.
 * Does NOT hit the cache — call `getOrGenerateReport` for cached access.
 */
export function buildReport(raw: RawTestRun, options: ReportOptions): ReportData {
  const filteredTests = applyFilters(raw.tests, options.filters);
  const hasPartialResults =
    raw.status !== 'completed' ||
    raw.tests.some((t) => t.status === 'error');

  const qualityScore = calculateQualityScore(filteredTests);
  const summary = buildSummary(
    filteredTests,
    raw.startedAt,
    raw.completedAt,
    qualityScore,
    hasPartialResults,
  );
  const categoryResults = buildCategoryResults(
    filteredTests,
    options.detailLevel === 'detailed',
  );
  const evidenceLinks: EvidenceLink[] = filteredTests.flatMap(
    (t) => t.evidence,
  );
  const agentPerformance = calculateAgentMetrics(filteredTests);

  return {
    runId: raw.id,
    projectId: raw.projectId,
    runLabel: raw.label,
    environment: raw.environment,
    summary,
    categoryResults,
    evidenceLinks,
    qualityScore,
    agentPerformance,
    runStatus: raw.status,
  };
}

/**
 * Returns a summary-only view of report data, omitting category test details
 * and full evidence link arrays.
 */
export function toSummaryOnly(report: ReportData): ReportSummaryOnly {
  return {
    runId: report.runId,
    projectId: report.projectId,
    runLabel: report.runLabel,
    environment: report.environment,
    summary: report.summary,
    qualityScore: report.qualityScore,
    agentPerformance: report.agentPerformance,
    runStatus: report.runStatus,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Result returned by `getOrGenerateReport`. */
export interface GetReportResult {
  report: ReportData;
  fromCache: boolean;
}

/**
 * Returns report data for the given run, using the in-memory cache to avoid
 * regenerating identical reports.
 *
 * Filters are applied AFTER the cached full report is retrieved, so a cached
 * full report can serve multiple filtered requests without re-querying.
 *
 * @throws {ReportNotFoundError} when no run exists for `runId`
 * @throws {ReportGenerationError} when report generation fails unexpectedly
 */
export async function getOrGenerateReport(
  runId: string,
  options: ReportOptions,
  fetcher: (id: string) => Promise<RawTestRun | null> = fetchTestRunData,
): Promise<GetReportResult> {
  // Always fetch the full (unfiltered) report for caching purposes,
  // then apply filters to the in-memory result.
  let fromCache = false;
  let fullReport = getCached(runId);

  if (!fullReport) {
    const raw = await fetcher(runId);
    if (!raw) {
      throw new ReportNotFoundError(runId);
    }

    // Build the full unfiltered report and cache it.
    const unfilteredOptions: ReportOptions = {
      ...options,
      filters: undefined,
      detailLevel: 'detailed', // cache the most detailed version
    };
    try {
      fullReport = buildReport(raw, unfilteredOptions);
    } catch (err) {
      throw new ReportGenerationError(runId, err);
    }
    setCache(runId, fullReport);
  } else {
    fromCache = true;
  }

  // Apply filters and detail level to the cached full report.
  let result: ReportData = fullReport;
  if (options.filters && Object.keys(options.filters).length > 0) {
    const raw: RawTestRun = {
      id: fullReport.runId,
      projectId: fullReport.projectId,
      label: fullReport.runLabel,
      environment: fullReport.environment,
      startedAt: fullReport.summary.startedAt,
      completedAt: fullReport.summary.completedAt,
      status: fullReport.runStatus,
      tests: fullReport.categoryResults.flatMap((cr) => cr.tests ?? []),
    };
    result = buildReport(raw, options);
  } else if (options.detailLevel === 'summary') {
    // Re-use cached data but strip detailed fields.
    result = fullReport;
  }

  return { report: result, fromCache };
}

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when no test run exists for the requested ID. */
export class ReportNotFoundError extends Error {
  public readonly runId: string;

  constructor(runId: string) {
    super(`Test run not found: ${runId}`);
    this.name = 'ReportNotFoundError';
    this.runId = runId;
  }
}

/** Thrown when report generation fails due to an unexpected error. */
export class ReportGenerationError extends Error {
  public readonly runId: string;
  public readonly cause: unknown;

  constructor(runId: string, cause: unknown) {
    super(`Failed to generate report for run: ${runId}`);
    this.name = 'ReportGenerationError';
    this.runId = runId;
    this.cause = cause;
  }
}
