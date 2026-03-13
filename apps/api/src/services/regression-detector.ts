/**
 * Regression Detection Service (SEM-96)
 *
 * Identifies quality regressions by comparing current metrics against:
 *  1. Configured absolute thresholds (pass rate floor, max bug count, etc.)
 *  2. Statistical baselines derived from historical trend data (z-score / stddev)
 *
 * A regression alert is created when either condition triggers.
 */

import {
  type DailyQualityMetric,
  type QualityThreshold,
  AlertType,
  AlertStatus,
} from '@semkiest/db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RegressionCandidate {
  alertType: AlertType;
  currentValue: number;
  baselineValue: number;
  threshold: number;
  deviation: number;
  message: string;
}

export interface BaselineStats {
  mean: number;
  stddev: number;
  sampleSize: number;
}

export interface DetectionResult {
  projectId: string;
  metricDate: Date;
  regressions: RegressionCandidate[];
  hasRegression: boolean;
}

export interface ThresholdConfig {
  minPassRate: number;
  maxBugCount: number | null;
  maxCriticalBugs: number;
  minCoverage: number | null;
  regressionSensitivity: number;
}

// ─── Baseline Statistics ─────────────────────────────────────────────────────

/**
 * Computes mean and population standard deviation for an array of values.
 * Returns null for empty arrays.
 */
export function calculateBaselineStats(values: number[]): BaselineStats | null {
  if (values.length === 0) return null;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);

  return { mean, stddev, sampleSize: values.length };
}

/**
 * Computes z-score: how many standard deviations `current` sits from `baseline.mean`.
 * Returns 0 if stddev is 0 (no variation in baseline).
 */
export function zScore(current: number, baseline: BaselineStats): number {
  if (baseline.stddev === 0) return 0;
  return (current - baseline.mean) / baseline.stddev;
}

// ─── Threshold Checks ────────────────────────────────────────────────────────

/**
 * Checks whether the current pass rate violates the configured minimum.
 */
function checkPassRate(
  metric: DailyQualityMetric,
  config: ThresholdConfig,
  historicalMetrics: DailyQualityMetric[],
): RegressionCandidate | null {
  // Absolute threshold check
  if (metric.passRate < config.minPassRate) {
    return {
      alertType: AlertType.PASS_RATE_DROP,
      currentValue: metric.passRate,
      baselineValue: config.minPassRate,
      threshold: config.minPassRate,
      deviation: config.minPassRate - metric.passRate,
      message:
        `Pass rate ${(metric.passRate * 100).toFixed(1)}% is below the ` +
        `configured minimum of ${(config.minPassRate * 100).toFixed(1)}%.`,
    };
  }

  // Statistical deviation check against historical data
  if (historicalMetrics.length >= 7) {
    const passRates = historicalMetrics.map((m) => m.passRate);
    const stats = calculateBaselineStats(passRates);
    if (stats !== null) {
      const z = zScore(metric.passRate, stats);
      if (z < -config.regressionSensitivity) {
        return {
          alertType: AlertType.STATISTICAL_DEVIATION,
          currentValue: metric.passRate,
          baselineValue: stats.mean,
          threshold: config.minPassRate,
          deviation: Math.abs(z),
          message:
            `Pass rate ${(metric.passRate * 100).toFixed(1)}% deviates ` +
            `${Math.abs(z).toFixed(2)} standard deviations below the historical mean ` +
            `of ${(stats.mean * 100).toFixed(1)}%.`,
        };
      }
    }
  }

  return null;
}

/**
 * Checks whether the bug count exceeds the configured maximum.
 */
function checkBugCount(
  metric: DailyQualityMetric,
  config: ThresholdConfig,
  historicalMetrics: DailyQualityMetric[],
): RegressionCandidate | null {
  // Absolute threshold check
  if (
    config.maxBugCount !== null &&
    metric.bugCount > config.maxBugCount
  ) {
    return {
      alertType: AlertType.BUG_COUNT_SPIKE,
      currentValue: metric.bugCount,
      baselineValue: config.maxBugCount,
      threshold: config.maxBugCount,
      deviation: metric.bugCount - config.maxBugCount,
      message:
        `Bug count ${metric.bugCount} exceeds the configured maximum of ${config.maxBugCount}.`,
    };
  }

  // Critical bugs absolute check
  if (metric.criticalBugs > config.maxCriticalBugs) {
    return {
      alertType: AlertType.BUG_COUNT_SPIKE,
      currentValue: metric.criticalBugs,
      baselineValue: config.maxCriticalBugs,
      threshold: config.maxCriticalBugs,
      deviation: metric.criticalBugs - config.maxCriticalBugs,
      message:
        `Critical bug count ${metric.criticalBugs} exceeds the configured ` +
        `maximum of ${config.maxCriticalBugs}.`,
    };
  }

  // Statistical deviation check
  if (historicalMetrics.length >= 7) {
    const bugCounts = historicalMetrics.map((m) => m.bugCount);
    const stats = calculateBaselineStats(bugCounts);
    if (stats !== null) {
      const z = zScore(metric.bugCount, stats);
      if (z > config.regressionSensitivity) {
        return {
          alertType: AlertType.BUG_COUNT_SPIKE,
          currentValue: metric.bugCount,
          baselineValue: stats.mean,
          threshold: config.maxBugCount ?? stats.mean + config.regressionSensitivity * stats.stddev,
          deviation: z,
          message:
            `Bug count ${metric.bugCount} deviates ${z.toFixed(2)} standard deviations ` +
            `above the historical mean of ${stats.mean.toFixed(1)}.`,
        };
      }
    }
  }

  return null;
}

/**
 * Checks whether code coverage has dropped below the configured minimum.
 */
function checkCoverage(
  metric: DailyQualityMetric,
  config: ThresholdConfig,
  historicalMetrics: DailyQualityMetric[],
): RegressionCandidate | null {
  if (config.minCoverage === null || metric.avgCoverage === null) return null;

  // Absolute threshold check
  if (metric.avgCoverage < config.minCoverage) {
    return {
      alertType: AlertType.COVERAGE_DROP,
      currentValue: metric.avgCoverage,
      baselineValue: config.minCoverage,
      threshold: config.minCoverage,
      deviation: config.minCoverage - metric.avgCoverage,
      message:
        `Coverage ${metric.avgCoverage.toFixed(1)}% is below the configured ` +
        `minimum of ${config.minCoverage.toFixed(1)}%.`,
    };
  }

  // Statistical deviation check
  if (historicalMetrics.length >= 7) {
    const coverages = historicalMetrics
      .map((m) => m.avgCoverage)
      .filter((c): c is number => c !== null);
    if (coverages.length >= 7) {
      const stats = calculateBaselineStats(coverages);
      if (stats !== null) {
        const z = zScore(metric.avgCoverage, stats);
        if (z < -config.regressionSensitivity) {
          return {
            alertType: AlertType.COVERAGE_DROP,
            currentValue: metric.avgCoverage,
            baselineValue: stats.mean,
            threshold: config.minCoverage,
            deviation: Math.abs(z),
            message:
              `Coverage ${metric.avgCoverage.toFixed(1)}% deviates ` +
              `${Math.abs(z).toFixed(2)} standard deviations below the ` +
              `historical mean of ${stats.mean.toFixed(1)}%.`,
          };
        }
      }
    }
  }

  return null;
}

// ─── Main Detection Entry Point ──────────────────────────────────────────────

/**
 * Detects regressions for a given metric snapshot against historical data
 * and configured thresholds.
 *
 * @param metric          - The metric being evaluated (today's aggregated data)
 * @param historicalMetrics - Recent historical metrics (oldest first, excluding today)
 * @param thresholdConfig - The resolved threshold configuration (project or org level)
 * @returns DetectionResult with any identified regressions
 */
export function detectRegression(
  metric: DailyQualityMetric,
  historicalMetrics: DailyQualityMetric[],
  thresholdConfig: ThresholdConfig,
): DetectionResult {
  const regressions: RegressionCandidate[] = [];

  const passRateCandidate = checkPassRate(metric, thresholdConfig, historicalMetrics);
  if (passRateCandidate !== null) regressions.push(passRateCandidate);

  const bugCountCandidate = checkBugCount(metric, thresholdConfig, historicalMetrics);
  if (bugCountCandidate !== null) regressions.push(bugCountCandidate);

  const coverageCandidate = checkCoverage(metric, thresholdConfig, historicalMetrics);
  if (coverageCandidate !== null) regressions.push(coverageCandidate);

  return {
    projectId: metric.projectId,
    metricDate: metric.metricDate,
    regressions,
    hasRegression: regressions.length > 0,
  };
}

/**
 * Resolves the effective threshold configuration for a project.
 * Project-level config takes precedence over org-level config.
 * Falls back to hard-coded defaults if neither is configured.
 */
export function resolveThresholdConfig(
  orgThreshold: QualityThreshold | null,
  projectThreshold: QualityThreshold | null,
): ThresholdConfig {
  const defaults: ThresholdConfig = {
    minPassRate: 0.8,
    maxBugCount: null,
    maxCriticalBugs: 0,
    minCoverage: null,
    regressionSensitivity: 2.0,
  };

  const base: ThresholdConfig = orgThreshold
    ? {
        minPassRate: orgThreshold.minPassRate,
        maxBugCount: orgThreshold.maxBugCount,
        maxCriticalBugs: orgThreshold.maxCriticalBugs,
        minCoverage: orgThreshold.minCoverage,
        regressionSensitivity: orgThreshold.regressionSensitivity,
      }
    : defaults;

  if (projectThreshold === null) return base;

  return {
    minPassRate: projectThreshold.minPassRate,
    maxBugCount: projectThreshold.maxBugCount,
    maxCriticalBugs: projectThreshold.maxCriticalBugs,
    minCoverage: projectThreshold.minCoverage,
    regressionSensitivity: projectThreshold.regressionSensitivity,
  };
}

/**
 * Maps DetectionResult regressions to RegressionAlert create payloads
 * suitable for use with Prisma.
 */
export function buildAlertPayloads(
  result: DetectionResult,
): Array<{
  projectId: string;
  alertType: AlertType;
  status: AlertStatus;
  detectedAt: Date;
  metricDate: Date;
  currentValue: number;
  baselineValue: number;
  threshold: number;
  deviation: number;
  message: string;
}> {
  return result.regressions.map((r) => ({
    projectId: result.projectId,
    alertType: r.alertType,
    status: AlertStatus.OPEN,
    detectedAt: new Date(),
    metricDate: result.metricDate,
    currentValue: r.currentValue,
    baselineValue: r.baselineValue,
    threshold: r.threshold,
    deviation: r.deviation,
    message: r.message,
  }));
}
