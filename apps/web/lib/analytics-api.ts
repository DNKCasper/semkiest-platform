/**
 * Analytics API client for the Quality Intelligence Dashboard.
 *
 * When a real backend endpoint is available at NEXT_PUBLIC_API_URL/api/analytics,
 * requests are forwarded there. Until then, realistic mock data is returned so
 * the dashboard can be developed and demoed independently of the backend.
 */

import type {
  DateRange,
  QualityTrend,
  QualityTrendPoint,
  LeaderboardEntry,
  LeaderboardWeights,
  PerformanceTrend,
  PerformanceTrendPoint,
  DevQualityMetrics,
  DevQualityPoint,
  ProjectCreditUsage,
  CreditUsagePoint,
  AgentTypeSummary,
  AnalyticsSummary,
} from '../types/analytics';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function datesBetween(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

/** Seeded pseudo-random to produce consistent demo data. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

const MOCK_PROJECTS = [
  { id: 'proj-1', name: 'Checkout Flow', team: 'Commerce' },
  { id: 'proj-2', name: 'User Auth Service', team: 'Platform' },
  { id: 'proj-3', name: 'Product Catalog', team: 'Commerce' },
  { id: 'proj-4', name: 'Payment Gateway', team: 'Finance' },
  { id: 'proj-5', name: 'Notification Service', team: 'Platform' },
  { id: 'proj-6', name: 'Search Engine', team: 'Discovery' },
  { id: 'proj-7', name: 'Analytics Pipeline', team: 'Data' },
  { id: 'proj-8', name: 'Mobile API', team: 'Mobile' },
];

function generateQualityTrend(
  project: (typeof MOCK_PROJECTS)[number],
  dates: string[],
): QualityTrend {
  const rand = seededRandom(project.id.charCodeAt(5));
  let passRate = 0.75 + rand() * 0.2;
  const points: QualityTrendPoint[] = [];
  const window: number[] = [];

  for (const date of dates) {
    passRate = clamp(passRate + (rand() - 0.48) * 0.04, 0.4, 1);
    window.push(passRate);
    if (window.length > 7) window.shift();
    const rollingAvg = window.reduce((a, b) => a + b, 0) / window.length;
    const totalTests = Math.floor(50 + rand() * 150);
    points.push({
      date,
      passRate: Math.round(passRate * 1000) / 1000,
      rollingAvg: Math.round(rollingAvg * 1000) / 1000,
      totalTests,
      failedTests: Math.round(totalTests * (1 - passRate)),
    });
  }
  return { projectId: project.id, projectName: project.name, data: points };
}

function generateLeaderboard(
  weights: LeaderboardWeights,
): LeaderboardEntry[] {
  const totalWeight =
    weights.passRate + weights.bugRate + weights.coverage + weights.regressionRate;

  return MOCK_PROJECTS.map((project, i) => {
    const rand = seededRandom(project.id.charCodeAt(5) + 1);
    const passRate = Math.round((0.6 + rand() * 0.38) * 100) / 100;
    const bugsPerSprint = Math.round(rand() * 12 + 1);
    const coverageRate = Math.round((0.5 + rand() * 0.45) * 100) / 100;
    const regressionRate = Math.round(rand() * 0.2 * 100) / 100;

    const score = Math.round(
      ((passRate * weights.passRate +
        (1 - bugsPerSprint / 15) * weights.bugRate +
        coverageRate * weights.coverage +
        (1 - regressionRate) * weights.regressionRate) /
        totalWeight) *
        100,
    );

    const trends: Array<'up' | 'down' | 'stable'> = ['up', 'down', 'stable'];
    return {
      projectId: project.id,
      projectName: project.name,
      score,
      passRate,
      bugsPerSprint,
      coverageRate,
      regressionRate,
      rank: i + 1,
      trend: trends[i % 3],
      team: project.team,
    };
  })
    .sort((a, b) => b.score - a.score)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

function generatePerformanceTrend(
  project: (typeof MOCK_PROJECTS)[number],
  dates: string[],
): PerformanceTrend {
  const rand = seededRandom(project.id.charCodeAt(5) + 2);
  let lcp = 2000 + rand() * 1500;
  let lighthousePerf = 70 + rand() * 25;

  const points: PerformanceTrendPoint[] = dates.map((date) => {
    lcp = clamp(lcp + (rand() - 0.5) * 100, 800, 4500);
    lighthousePerf = clamp(lighthousePerf + (rand() - 0.48) * 2, 40, 100);
    return {
      date,
      lcp: Math.round(lcp),
      fid: Math.round(10 + rand() * 90),
      cls: Math.round(rand() * 0.25 * 1000) / 1000,
      lighthousePerformance: Math.round(lighthousePerf),
      lighthouseAccessibility: Math.round(80 + rand() * 18),
      lighthouseBestPractices: Math.round(75 + rand() * 23),
      lighthouseSeo: Math.round(85 + rand() * 13),
    };
  });

  return { projectId: project.id, projectName: project.name, data: points };
}

function generateDevQuality(
  project: (typeof MOCK_PROJECTS)[number],
  dates: string[],
): DevQualityMetrics {
  const rand = seededRandom(project.id.charCodeAt(5) + 3);
  let coverage = 60 + rand() * 30;
  let bugCount = 5 + rand() * 8;
  const sprintLength = 14;
  const data: DevQualityPoint[] = [];
  let sprintNum = 1;

  for (let i = 0; i < dates.length; i++) {
    if (i % sprintLength === 0) {
      bugCount = clamp(bugCount + (rand() - 0.5) * 4, 0, 20);
      coverage = clamp(coverage + (rand() - 0.45) * 2, 30, 100);
      data.push({
        date: dates[i],
        sprint: `Sprint ${sprintNum++}`,
        bugs: Math.round(bugCount),
        regressions: Math.round(bugCount * (0.1 + rand() * 0.2)),
        coveragePercent: Math.round(coverage * 10) / 10,
      });
    }
  }

  const avgBugs =
    data.reduce((s, d) => s + d.bugs, 0) / Math.max(data.length, 1);
  const regressionRate =
    data.reduce((s, d) => s + d.regressions / Math.max(d.bugs, 1), 0) /
    Math.max(data.length, 1);

  return {
    projectId: project.id,
    projectName: project.name,
    avgBugsPerSprint: Math.round(avgBugs * 10) / 10,
    regressionRate: Math.round(regressionRate * 1000) / 1000,
    currentCoverage: data.at(-1)?.coveragePercent ?? 0,
    data,
  };
}

function generateCreditUsage(
  project: (typeof MOCK_PROJECTS)[number],
  dates: string[],
): ProjectCreditUsage {
  const rand = seededRandom(project.id.charCodeAt(5) + 4);
  let dailyTotal = 800 + rand() * 1200;

  const data: CreditUsagePoint[] = dates.map((date) => {
    dailyTotal = clamp(dailyTotal + (rand() - 0.48) * 100, 200, 3000);
    const testGen = Math.round(dailyTotal * (0.4 + rand() * 0.1));
    const review = Math.round(dailyTotal * (0.2 + rand() * 0.1));
    const bugAnalysis = Math.round(dailyTotal * (0.15 + rand() * 0.1));
    const other = Math.round(dailyTotal - testGen - review - bugAnalysis);
    return {
      date,
      totalCredits: Math.round(dailyTotal),
      testGeneration: testGen,
      codeReview: review,
      bugAnalysis,
      other: Math.max(other, 0),
    };
  });

  const totalCredits = data.reduce((s, d) => s + d.totalCredits, 0);
  const burnRate = totalCredits / Math.max(data.length, 1);

  return {
    projectId: project.id,
    projectName: project.name,
    totalCredits,
    burnRate: Math.round(burnRate),
    projectedMonthly: Math.round(burnRate * 30),
    data,
  };
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

async function tryFetch<T>(path: string, fallback: () => T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return fallback();
    return (await res.json()) as T;
  } catch {
    return fallback();
  }
}

function dateRangeDates(range: DateRange): string[] {
  return datesBetween(range.start, range.end);
}

/** Fetch quality trends for all projects within the given date range. */
export async function fetchQualityTrends(
  range: DateRange,
): Promise<QualityTrend[]> {
  const dates = dateRangeDates(range);
  return tryFetch<QualityTrend[]>(
    `/api/analytics/quality-trends?start=${dates[0]}&end=${dates.at(-1)}`,
    () => MOCK_PROJECTS.map((p) => generateQualityTrend(p, dates)),
  );
}

/** Fetch the cross-project leaderboard with configurable scoring weights. */
export async function fetchLeaderboard(
  weights: LeaderboardWeights,
): Promise<LeaderboardEntry[]> {
  return tryFetch<LeaderboardEntry[]>(
    `/api/analytics/leaderboard?passRate=${weights.passRate}&bugRate=${weights.bugRate}&coverage=${weights.coverage}&regressionRate=${weights.regressionRate}`,
    () => generateLeaderboard(weights),
  );
}

/** Fetch performance trends (Core Web Vitals + Lighthouse) for all projects. */
export async function fetchPerformanceTrends(
  range: DateRange,
): Promise<PerformanceTrend[]> {
  const dates = dateRangeDates(range);
  return tryFetch<PerformanceTrend[]>(
    `/api/analytics/performance-trends?start=${dates[0]}&end=${dates.at(-1)}`,
    () => MOCK_PROJECTS.map((p) => generatePerformanceTrend(p, dates)),
  );
}

/** Fetch development quality metrics for all projects. */
export async function fetchDevQualityMetrics(
  range: DateRange,
): Promise<DevQualityMetrics[]> {
  const dates = dateRangeDates(range);
  return tryFetch<DevQualityMetrics[]>(
    `/api/analytics/dev-quality?start=${dates[0]}&end=${dates.at(-1)}`,
    () => MOCK_PROJECTS.map((p) => generateDevQuality(p, dates)),
  );
}

/** Fetch AI credit usage analytics for all projects. */
export async function fetchCreditUsage(
  range: DateRange,
): Promise<ProjectCreditUsage[]> {
  const dates = dateRangeDates(range);
  return tryFetch<ProjectCreditUsage[]>(
    `/api/analytics/credit-usage?start=${dates[0]}&end=${dates.at(-1)}`,
    () => MOCK_PROJECTS.map((p) => generateCreditUsage(p, dates)),
  );
}

/** Aggregate agent-type credit breakdown across all projects. */
export function computeAgentTypeSummary(
  projects: ProjectCreditUsage[],
): AgentTypeSummary[] {
  const totals = { testGeneration: 0, codeReview: 0, bugAnalysis: 0, other: 0 };
  for (const p of projects) {
    for (const point of p.data) {
      totals.testGeneration += point.testGeneration;
      totals.codeReview += point.codeReview;
      totals.bugAnalysis += point.bugAnalysis;
      totals.other += point.other;
    }
  }
  const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return [
    {
      agentType: 'Test Generation',
      totalCredits: totals.testGeneration,
      percentage: Math.round((totals.testGeneration / grand) * 100),
    },
    {
      agentType: 'Code Review',
      totalCredits: totals.codeReview,
      percentage: Math.round((totals.codeReview / grand) * 100),
    },
    {
      agentType: 'Bug Analysis',
      totalCredits: totals.bugAnalysis,
      percentage: Math.round((totals.bugAnalysis / grand) * 100),
    },
    {
      agentType: 'Other',
      totalCredits: totals.other,
      percentage: Math.round((totals.other / grand) * 100),
    },
  ];
}

/** Compute high-level summary KPIs. */
export function computeAnalyticsSummary(
  leaderboard: LeaderboardEntry[],
  credits: ProjectCreditUsage[],
): AnalyticsSummary {
  const avgPassRate =
    leaderboard.reduce((s, e) => s + e.passRate, 0) /
    Math.max(leaderboard.length, 1);
  const totalCredits = credits.reduce((s, p) => s + p.totalCredits, 0);
  const criticalIssues = leaderboard.filter((e) => e.passRate < 0.7).length;

  return {
    totalProjects: leaderboard.length,
    avgPassRate: Math.round(avgPassRate * 1000) / 1000,
    totalCreditsUsed: totalCredits,
    criticalIssues,
  };
}

// ---------------------------------------------------------------------------
// CSV export utility
// ---------------------------------------------------------------------------

type CsvRow = Record<string, string | number | boolean | null | undefined>;

/** Convert an array of objects to a CSV string. */
export function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}

/** Trigger a CSV file download in the browser. */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
