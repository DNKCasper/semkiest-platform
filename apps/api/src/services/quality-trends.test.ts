import {
  calculateRollingAverage,
  getQualityTrends,
  type TrendDataPoint,
} from './quality-trends';

// ─── calculateRollingAverage ──────────────────────────────────────────────────

function makePoint(overrides: Partial<TrendDataPoint> = {}): TrendDataPoint {
  return {
    date: '2024-01-01',
    passRate: 0.9,
    bugCount: 2,
    criticalBugs: 0,
    highBugs: 1,
    mediumBugs: 1,
    lowBugs: 0,
    coverage: 80,
    runCount: 3,
    totalTests: 100,
    ...overrides,
  };
}

describe('calculateRollingAverage', () => {
  it('returns null for empty data', () => {
    expect(calculateRollingAverage([], 7)).toBeNull();
  });

  it('returns null for a single data point', () => {
    expect(calculateRollingAverage([makePoint()], 7)).toBeNull();
  });

  it('computes correct average pass rate for 7-day window', () => {
    const points = [
      makePoint({ passRate: 0.8 }),
      makePoint({ passRate: 0.9 }),
      makePoint({ passRate: 1.0 }),
      makePoint({ passRate: 0.85 }),
      makePoint({ passRate: 0.90 }),
      makePoint({ passRate: 0.95 }),
      makePoint({ passRate: 0.75 }),
    ];
    const avg = calculateRollingAverage(points, 7);
    expect(avg).not.toBeNull();
    expect(avg!.windowDays).toBe(7);
    expect(avg!.avgPassRate).toBeCloseTo(
      (0.8 + 0.9 + 1.0 + 0.85 + 0.9 + 0.95 + 0.75) / 7,
      5,
    );
  });

  it('uses only the last N points when more data is available', () => {
    const points = Array.from({ length: 20 }, (_, i) =>
      makePoint({ passRate: i < 15 ? 0.5 : 0.95 }),
    );
    const avg = calculateRollingAverage(points, 7);
    // Should use only the last 7 points (all 0.95)
    expect(avg!.avgPassRate).toBeCloseTo(0.95, 5);
  });

  it('classifies trend as "improving" when second half is better', () => {
    const points = [
      makePoint({ passRate: 0.6 }),
      makePoint({ passRate: 0.65 }),
      makePoint({ passRate: 0.7 }),
      makePoint({ passRate: 0.85 }),
      makePoint({ passRate: 0.88 }),
      makePoint({ passRate: 0.9 }),
      makePoint({ passRate: 0.92 }),
    ];
    const avg = calculateRollingAverage(points, 7);
    expect(avg!.trend).toBe('improving');
  });

  it('classifies trend as "degrading" when second half is worse', () => {
    const points = [
      makePoint({ passRate: 0.95 }),
      makePoint({ passRate: 0.92 }),
      makePoint({ passRate: 0.90 }),
      makePoint({ passRate: 0.7 }),
      makePoint({ passRate: 0.65 }),
      makePoint({ passRate: 0.6 }),
      makePoint({ passRate: 0.55 }),
    ];
    const avg = calculateRollingAverage(points, 7);
    expect(avg!.trend).toBe('degrading');
  });

  it('classifies trend as "stable" when halves are within 2% of each other', () => {
    const points = Array.from({ length: 7 }, () => makePoint({ passRate: 0.88 }));
    const avg = calculateRollingAverage(points, 7);
    expect(avg!.trend).toBe('stable');
  });

  it('handles null coverage values gracefully', () => {
    const points = Array.from({ length: 7 }, () => makePoint({ coverage: null }));
    const avg = calculateRollingAverage(points, 7);
    expect(avg).not.toBeNull();
    expect(avg!.avgCoverage).toBeNull();
  });

  it('computes coverage avg only from non-null values', () => {
    const points = [
      makePoint({ coverage: 80 }),
      makePoint({ coverage: null }),
      makePoint({ coverage: 90 }),
      makePoint({ coverage: null }),
      makePoint({ coverage: 70 }),
      makePoint({ coverage: 85 }),
      makePoint({ coverage: 75 }),
    ];
    const avg = calculateRollingAverage(points, 7);
    expect(avg!.avgCoverage).toBeCloseTo((80 + 90 + 70 + 85 + 75) / 5, 5);
  });
});

// ─── getQualityTrends ─────────────────────────────────────────────────────────

// Mock Prisma for service tests
jest.mock('@semkiest/db', () => ({
  __esModule: true,
  default: {
    dailyQualityMetric: {
      findMany: jest.fn(),
    },
    project: {
      findMany: jest.fn(),
    },
  },
}));

import prisma from '@semkiest/db';

function makeDbMetric(
  date: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `metric-${date}`,
    projectId: 'project-1',
    metricDate: new Date(`${date}T00:00:00Z`),
    timezone: 'UTC',
    runCount: 3,
    totalTests: 100,
    passedTests: 90,
    failedTests: 10,
    skippedTests: 0,
    passRate: 0.9,
    bugCount: 2,
    criticalBugs: 0,
    highBugs: 1,
    mediumBugs: 1,
    lowBugs: 0,
    avgCoverage: 75.0,
    avgDurationMs: 10000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('getQualityTrends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty trend for project with no data', async () => {
    (prisma.dailyQualityMetric.findMany as jest.Mock).mockResolvedValue([]);

    const report = await getQualityTrends('project-1', { timezone: 'UTC' });

    expect(report.projectId).toBe('project-1');
    expect(report.dataPoints).toHaveLength(0);
    expect(report.summary.latestPassRate).toBeNull();
    expect(report.summary.totalRunsInPeriod).toBe(0);
    expect(report.rollingAverages.sevenDay).toBeNull();
    expect(report.rollingAverages.thirtyDay).toBeNull();
    expect(report.rollingAverages.ninetyDay).toBeNull();
  });

  it('maps DB metrics to dashboard-friendly data points', async () => {
    const dbMetrics = [
      makeDbMetric('2024-01-10'),
      makeDbMetric('2024-01-11', { passRate: 0.75 }),
      makeDbMetric('2024-01-12', { passRate: 0.85 }),
    ];
    (prisma.dailyQualityMetric.findMany as jest.Mock).mockResolvedValue(dbMetrics);

    const report = await getQualityTrends('project-1', {
      timezone: 'UTC',
      startDate: '2024-01-10',
      endDate: '2024-01-12',
    });

    expect(report.dataPoints).toHaveLength(3);
    expect(report.dataPoints[0]?.date).toBe('2024-01-10');
    expect(report.dataPoints[0]?.passRate).toBe(0.9);
    expect(report.dataPoints[1]?.passRate).toBe(0.75);
  });

  it('includes correct summary statistics', async () => {
    const dbMetrics = [
      makeDbMetric('2024-01-10', { passRate: 0.6, runCount: 2 }),
      makeDbMetric('2024-01-11', { passRate: 0.9, runCount: 4 }),
      makeDbMetric('2024-01-12', { passRate: 0.8, runCount: 3 }),
    ];
    (prisma.dailyQualityMetric.findMany as jest.Mock).mockResolvedValue(dbMetrics);

    const report = await getQualityTrends('project-1', {
      startDate: '2024-01-10',
      endDate: '2024-01-12',
    });

    expect(report.summary.latestPassRate).toBe(0.8);
    expect(report.summary.peakPassRate).toBe(0.9);
    expect(report.summary.lowestPassRate).toBe(0.6);
    expect(report.summary.totalRunsInPeriod).toBe(9);
    expect(report.summary.averagePassRate).toBeCloseTo((0.6 + 0.9 + 0.8) / 3, 5);
  });

  it('uses windowDays shorthand to set the date range', async () => {
    (prisma.dailyQualityMetric.findMany as jest.Mock).mockResolvedValue([]);

    await getQualityTrends('project-1', { windowDays: 7, timezone: 'UTC' });

    const call = (prisma.dailyQualityMetric.findMany as jest.Mock).mock.calls[0][0] as {
      where: { metricDate: { gte: Date; lte: Date } };
    };
    const { gte, lte } = call.where.metricDate;
    const diffDays = Math.round(
      (lte.getTime() - gte.getTime()) / (1000 * 60 * 60 * 24),
    );
    // Fetch window is 7 days + 1 extra day for trend context
    expect(diffDays).toBe(7);
  });

  it('includes timezone in the returned report', async () => {
    (prisma.dailyQualityMetric.findMany as jest.Mock).mockResolvedValue([]);

    const report = await getQualityTrends('project-1', {
      timezone: 'America/New_York',
    });

    expect(report.timezone).toBe('America/New_York');
  });
});
