import {
  calculateBaselineStats,
  zScore,
  detectRegression,
  resolveThresholdConfig,
  buildAlertPayloads,
  type ThresholdConfig,
} from './regression-detector';
import { AlertStatus, AlertType } from '@semkiest/db';
import type { DailyQualityMetric, QualityThreshold } from '@semkiest/db';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMetric(overrides: Partial<DailyQualityMetric> = {}): DailyQualityMetric {
  return {
    id: 'metric-1',
    projectId: 'project-1',
    metricDate: new Date('2024-01-15T00:00:00Z'),
    timezone: 'UTC',
    runCount: 5,
    totalTests: 100,
    passedTests: 85,
    failedTests: 15,
    skippedTests: 0,
    passRate: 0.85,
    bugCount: 3,
    criticalBugs: 0,
    highBugs: 1,
    mediumBugs: 2,
    lowBugs: 0,
    avgCoverage: 75.0,
    avgDurationMs: 12000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeThresholdConfig(overrides: Partial<ThresholdConfig> = {}): ThresholdConfig {
  return {
    minPassRate: 0.8,
    maxBugCount: null,
    maxCriticalBugs: 0,
    minCoverage: null,
    regressionSensitivity: 2.0,
    ...overrides,
  };
}

function makeQualityThreshold(
  overrides: Partial<QualityThreshold> = {},
): QualityThreshold {
  return {
    id: 'threshold-1',
    organizationId: 'org-1',
    projectId: null,
    minPassRate: 0.8,
    maxBugCount: null,
    maxCriticalBugs: 0,
    minCoverage: null,
    regressionSensitivity: 2.0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── calculateBaselineStats ───────────────────────────────────────────────────

describe('calculateBaselineStats', () => {
  it('returns null for an empty array', () => {
    expect(calculateBaselineStats([])).toBeNull();
  });

  it('computes correct mean and stddev for uniform values', () => {
    const stats = calculateBaselineStats([5, 5, 5, 5]);
    expect(stats).not.toBeNull();
    expect(stats!.mean).toBe(5);
    expect(stats!.stddev).toBe(0);
    expect(stats!.sampleSize).toBe(4);
  });

  it('computes correct mean for mixed values', () => {
    const stats = calculateBaselineStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats).not.toBeNull();
    expect(stats!.mean).toBe(5);
    expect(stats!.stddev).toBeCloseTo(2, 5);
    expect(stats!.sampleSize).toBe(8);
  });

  it('handles a single value', () => {
    const stats = calculateBaselineStats([42]);
    expect(stats).not.toBeNull();
    expect(stats!.mean).toBe(42);
    expect(stats!.stddev).toBe(0);
    expect(stats!.sampleSize).toBe(1);
  });
});

// ─── zScore ───────────────────────────────────────────────────────────────────

describe('zScore', () => {
  it('returns 0 when stddev is 0', () => {
    const stats = calculateBaselineStats([5, 5, 5])!;
    expect(zScore(5, stats)).toBe(0);
    expect(zScore(3, stats)).toBe(0);
  });

  it('returns positive value for above-mean input', () => {
    const stats = calculateBaselineStats([2, 4, 4, 4, 5, 5, 7, 9])!;
    const z = zScore(7, stats); // 7 is 1 stddev above mean of 5
    expect(z).toBeCloseTo(1, 0);
  });

  it('returns negative value for below-mean input', () => {
    const stats = calculateBaselineStats([2, 4, 4, 4, 5, 5, 7, 9])!;
    const z = zScore(3, stats); // 3 is 1 stddev below mean of 5
    expect(z).toBeCloseTo(-1, 0);
  });
});

// ─── detectRegression ────────────────────────────────────────────────────────

describe('detectRegression', () => {
  const config = makeThresholdConfig();

  it('returns no regressions for healthy metrics', () => {
    const metric = makeMetric({ passRate: 0.95, bugCount: 1, criticalBugs: 0 });
    const result = detectRegression(metric, [], config);
    expect(result.hasRegression).toBe(false);
    expect(result.regressions).toHaveLength(0);
  });

  it('detects pass rate below absolute threshold', () => {
    const metric = makeMetric({ passRate: 0.70 }); // below 0.80 threshold
    const result = detectRegression(metric, [], config);
    expect(result.hasRegression).toBe(true);
    const alert = result.regressions.find((r) => r.alertType === AlertType.PASS_RATE_DROP);
    expect(alert).toBeDefined();
    expect(alert!.currentValue).toBe(0.70);
    expect(alert!.threshold).toBe(0.80);
  });

  it('detects critical bug violation', () => {
    const metric = makeMetric({ criticalBugs: 2, passRate: 0.90 });
    const result = detectRegression(metric, [], config);
    expect(result.hasRegression).toBe(true);
    const alert = result.regressions.find((r) => r.alertType === AlertType.BUG_COUNT_SPIKE);
    expect(alert).toBeDefined();
    expect(alert!.currentValue).toBe(2);
  });

  it('detects max bug count violation', () => {
    const configWithMax = makeThresholdConfig({ maxBugCount: 5 });
    const metric = makeMetric({ bugCount: 10, criticalBugs: 0 });
    const result = detectRegression(metric, [], configWithMax);
    expect(result.hasRegression).toBe(true);
  });

  it('detects coverage drop below absolute threshold', () => {
    const configWithCoverage = makeThresholdConfig({ minCoverage: 80 });
    const metric = makeMetric({ avgCoverage: 60.0 });
    const result = detectRegression(metric, [], configWithCoverage);
    expect(result.hasRegression).toBe(true);
    const alert = result.regressions.find((r) => r.alertType === AlertType.COVERAGE_DROP);
    expect(alert).toBeDefined();
    expect(alert!.currentValue).toBe(60.0);
  });

  it('detects statistical deviation in pass rate with enough history', () => {
    // Stable history around 0.95 passRate, then sudden drop
    const historical = Array.from({ length: 10 }, (_, i) =>
      makeMetric({
        id: `hist-${i}`,
        passRate: 0.95,
        metricDate: new Date(`2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
      }),
    );
    // Current value: 2.5 stddev below mean
    const metric = makeMetric({ passRate: 0.5, metricDate: new Date('2024-01-15T00:00:00Z') });
    const result = detectRegression(metric, historical, config);
    expect(result.hasRegression).toBe(true);
  });

  it('ignores statistical deviation with fewer than 7 historical data points', () => {
    const historical = Array.from({ length: 5 }, (_, i) =>
      makeMetric({
        id: `hist-${i}`,
        passRate: 0.95,
        metricDate: new Date(`2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
      }),
    );
    // Below the absolute threshold (0.75 < 0.80)
    const metric = makeMetric({ passRate: 0.75 });
    const result = detectRegression(metric, historical, config);
    // Should still flag pass rate because it's below absolute threshold
    expect(result.hasRegression).toBe(true);

    // A metric that's above absolute threshold but statistically low won't flag
    const metricAboveThreshold = makeMetric({ passRate: 0.82 });
    const result2 = detectRegression(metricAboveThreshold, historical, config);
    expect(result2.hasRegression).toBe(false);
  });

  it('returns correct projectId and metricDate in result', () => {
    const metric = makeMetric({ passRate: 0.70 });
    const result = detectRegression(metric, [], config);
    expect(result.projectId).toBe('project-1');
    expect(result.metricDate).toEqual(metric.metricDate);
  });
});

// ─── resolveThresholdConfig ───────────────────────────────────────────────────

describe('resolveThresholdConfig', () => {
  it('returns defaults when no threshold is configured', () => {
    const config = resolveThresholdConfig(null, null);
    expect(config.minPassRate).toBe(0.8);
    expect(config.maxCriticalBugs).toBe(0);
    expect(config.regressionSensitivity).toBe(2.0);
  });

  it('uses org threshold as base when no project threshold', () => {
    const org = makeQualityThreshold({ minPassRate: 0.9, regressionSensitivity: 3.0 });
    const config = resolveThresholdConfig(org, null);
    expect(config.minPassRate).toBe(0.9);
    expect(config.regressionSensitivity).toBe(3.0);
  });

  it('project threshold overrides org threshold', () => {
    const org = makeQualityThreshold({ minPassRate: 0.9 });
    const project = makeQualityThreshold({
      id: 'threshold-2',
      projectId: 'project-1',
      minPassRate: 0.75,
    });
    const config = resolveThresholdConfig(org, project);
    expect(config.minPassRate).toBe(0.75);
  });
});

// ─── buildAlertPayloads ───────────────────────────────────────────────────────

describe('buildAlertPayloads', () => {
  it('returns empty array when no regressions', () => {
    const metric = makeMetric({ passRate: 0.95 });
    const result = detectRegression(metric, [], makeThresholdConfig());
    const payloads = buildAlertPayloads(result);
    expect(payloads).toHaveLength(0);
  });

  it('maps each regression to a correctly shaped alert payload', () => {
    const metric = makeMetric({ passRate: 0.60, criticalBugs: 2 });
    const result = detectRegression(metric, [], makeThresholdConfig());
    const payloads = buildAlertPayloads(result);
    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
      expect(payload.projectId).toBe('project-1');
      expect(payload.status).toBe(AlertStatus.OPEN);
      expect(payload.detectedAt).toBeInstanceOf(Date);
      expect(typeof payload.currentValue).toBe('number');
      expect(typeof payload.message).toBe('string');
    }
  });
});
