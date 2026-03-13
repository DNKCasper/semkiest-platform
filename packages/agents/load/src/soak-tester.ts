/**
 * Soak Tester
 *
 * Sustains a configured virtual user load for an extended duration and
 * monitors for memory leaks, response time degradation, error rate spikes,
 * and throughput drops — patterns that indicate long-running stability issues.
 *
 * Usage:
 *   const tester = new SoakTester();
 *   const result = await tester.run(config);
 */

import {
  aggregateMetrics,
  buildArtifactPaths,
  checkK6Available,
  ensureDir,
  extractMetricSummary,
  filterByTimeWindow,
  generateK6Script,
  parseDurationMs,
  readAllK6DataPoints,
  readK6Summary,
  runK6,
  writeK6Script,
} from './k6-runner';
import type {
  DegradationPattern,
  SoakSnapshot,
  SoakTestConfig,
  SoakTestResult,
  StageMetrics,
} from './types';

// ---------------------------------------------------------------------------
// Snapshot collection
// ---------------------------------------------------------------------------

/**
 * Divides the hold phase into evenly spaced snapshot windows based on
 * snapshotIntervalSeconds and computes StageMetrics for each.
 */
function collectSnapshots(params: {
  holdStart: Date;
  holdEnd: Date;
  snapshotIntervalSeconds: number;
  allPoints: Map<
    string,
    Array<{ data: { time: string; value: number; tags: Record<string, string> }; type: 'Point'; metric: string }>
  >;
  virtualUsers: number;
}): SoakSnapshot[] {
  const { holdStart, holdEnd, snapshotIntervalSeconds, allPoints, virtualUsers } =
    params;

  const intervalMs = snapshotIntervalSeconds * 1000;
  const holdDurationMs = holdEnd.getTime() - holdStart.getTime();

  if (holdDurationMs <= 0 || intervalMs <= 0) {
    return [];
  }

  const durationPoints = allPoints.get('http_req_duration') ?? [];
  const failedPoints = allPoints.get('http_req_failed') ?? [];
  const reqsPoints = allPoints.get('http_reqs') ?? [];
  const vusPoints = allPoints.get('vus') ?? [];

  const snapshots: SoakSnapshot[] = [];
  let windowStart = holdStart;

  while (windowStart.getTime() < holdEnd.getTime()) {
    const windowEnd = new Date(
      Math.min(windowStart.getTime() + intervalMs, holdEnd.getTime()),
    );
    const windowDurationSeconds =
      (windowEnd.getTime() - windowStart.getTime()) / 1000;
    const elapsedSeconds =
      (windowStart.getTime() - holdStart.getTime()) / 1000;

    const metrics = aggregateMetrics({
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      durationPoints: filterByTimeWindow(durationPoints, windowStart, windowEnd),
      failedPoints: filterByTimeWindow(failedPoints, windowStart, windowEnd),
      reqsPoints: filterByTimeWindow(reqsPoints, windowStart, windowEnd),
      vusPoints: filterByTimeWindow(vusPoints, windowStart, windowEnd),
      windowDurationSeconds,
    });

    // Fill in VU count from config when data is sparse
    if (metrics.virtualUsers === 0) {
      metrics.virtualUsers = virtualUsers;
    }

    snapshots.push({
      timestamp: windowStart.toISOString(),
      elapsedSeconds,
      metrics,
    });

    windowStart = windowEnd;
  }

  return snapshots;
}

// ---------------------------------------------------------------------------
// Degradation detection
// ---------------------------------------------------------------------------

/** Minimum number of snapshots required before trend analysis is meaningful */
const MIN_SNAPSHOTS_FOR_TREND = 3;

/**
 * Detects degradation patterns by comparing each snapshot's key metrics
 * against the first-window baseline.
 */
function detectDegradation(
  snapshots: SoakSnapshot[],
  config: SoakTestConfig,
): DegradationPattern[] {
  if (snapshots.length < MIN_SNAPSHOTS_FOR_TREND) {
    return [];
  }

  const patterns: DegradationPattern[] = [];
  const baseline = snapshots[0].metrics;
  const degradationThreshold = config.degradationThresholdPercent / 100;

  // 1. Response time increase (memory-leak indicator)
  const latestP95 = snapshots[snapshots.length - 1].metrics.p95ResponseTimeMs;
  if (
    baseline.p95ResponseTimeMs > 0 &&
    latestP95 > baseline.p95ResponseTimeMs * (1 + degradationThreshold)
  ) {
    const changePercent =
      ((latestP95 - baseline.p95ResponseTimeMs) /
        baseline.p95ResponseTimeMs) *
      100;
    const detectedSnapshot = snapshots[snapshots.length - 1];
    patterns.push({
      type: 'response_time_increase',
      detectedAt: detectedSnapshot.timestamp,
      elapsedSeconds: detectedSnapshot.elapsedSeconds,
      description:
        `p95 response time increased from ${baseline.p95ResponseTimeMs.toFixed(0)}ms ` +
        `to ${latestP95.toFixed(0)}ms (${changePercent.toFixed(1)}% increase), ` +
        `exceeding the ${config.degradationThresholdPercent}% degradation threshold.`,
      baselineValue: baseline.p95ResponseTimeMs,
      observedValue: latestP95,
      changePercent,
    });
  }

  // 2. Monotonic response time trend (memory leak indicator — gradual creep)
  if (snapshots.length >= 5) {
    const isMonotonicallyIncreasing = isMonotonicIncrease(
      snapshots.map((s) => s.metrics.p95ResponseTimeMs),
    );
    if (isMonotonicallyIncreasing) {
      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1];
      const changePercent =
        baseline.p95ResponseTimeMs > 0
          ? ((last.metrics.p95ResponseTimeMs - baseline.p95ResponseTimeMs) /
              baseline.p95ResponseTimeMs) *
            100
          : 0;
      // Only flag if we haven't already flagged response_time_increase
      const alreadyFlagged = patterns.some(
        (p) => p.type === 'response_time_increase',
      );
      if (!alreadyFlagged && changePercent > 5) {
        patterns.push({
          type: 'memory_leak_indicator',
          detectedAt: last.timestamp,
          elapsedSeconds: last.elapsedSeconds,
          description:
            `p95 response time showed a sustained monotonic increase across ` +
            `${snapshots.length} consecutive snapshots (${first.metrics.p95ResponseTimeMs.toFixed(0)}ms → ` +
            `${last.metrics.p95ResponseTimeMs.toFixed(0)}ms, +${changePercent.toFixed(1)}%), ` +
            `suggesting a memory leak or resource accumulation.`,
          baselineValue: baseline.p95ResponseTimeMs,
          observedValue: last.metrics.p95ResponseTimeMs,
          changePercent,
        });
      }
    }
  }

  // 3. Error rate spike — any snapshot's error rate exceeds max threshold
  for (const snapshot of snapshots) {
    if (
      snapshot.metrics.errorRate >
      config.thresholds.maxErrorRate
    ) {
      patterns.push({
        type: 'error_rate_spike',
        detectedAt: snapshot.timestamp,
        elapsedSeconds: snapshot.elapsedSeconds,
        description:
          `Error rate spiked to ${(snapshot.metrics.errorRate * 100).toFixed(1)}% ` +
          `at t+${snapshot.elapsedSeconds.toFixed(0)}s, ` +
          `exceeding the ${(config.thresholds.maxErrorRate * 100).toFixed(1)}% threshold.`,
        baselineValue: baseline.errorRate,
        observedValue: snapshot.metrics.errorRate,
        changePercent:
          baseline.errorRate > 0
            ? ((snapshot.metrics.errorRate - baseline.errorRate) /
                baseline.errorRate) *
              100
            : 100,
      });
      break; // Report only the first spike
    }
  }

  // 4. Throughput drop — sustained RPS drop compared to baseline
  if (baseline.requestsPerSecond > 0) {
    const latestRps =
      snapshots[snapshots.length - 1].metrics.requestsPerSecond;
    const dropPercent =
      ((baseline.requestsPerSecond - latestRps) /
        baseline.requestsPerSecond) *
      100;
    if (dropPercent > config.degradationThresholdPercent) {
      const detectedSnapshot = snapshots[snapshots.length - 1];
      patterns.push({
        type: 'throughput_drop',
        detectedAt: detectedSnapshot.timestamp,
        elapsedSeconds: detectedSnapshot.elapsedSeconds,
        description:
          `Throughput dropped from ${baseline.requestsPerSecond.toFixed(1)} req/s ` +
          `to ${latestRps.toFixed(1)} req/s (${dropPercent.toFixed(1)}% drop), ` +
          `exceeding the ${config.degradationThresholdPercent}% degradation threshold.`,
        baselineValue: baseline.requestsPerSecond,
        observedValue: latestRps,
        changePercent: -dropPercent,
      });
    }
  }

  return patterns;
}

/**
 * Returns true if the values array shows a consistent upward trend across
 * at least 80% of consecutive pairs.
 */
function isMonotonicIncrease(values: number[]): boolean {
  if (values.length < 3) return false;
  let increases = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) increases++;
  }
  return increases / (values.length - 1) >= 0.8;
}

// ---------------------------------------------------------------------------
// Result summary generation
// ---------------------------------------------------------------------------

function buildSummary(result: Omit<SoakTestResult, 'summary'>): string {
  const {
    snapshots,
    degradationPatterns,
    memoryLeakDetected,
    passed,
    name,
  } = result;

  const holdDurationMinutes =
    snapshots.length > 0
      ? (snapshots[snapshots.length - 1].elapsedSeconds / 60).toFixed(1)
      : '0';

  const lines: string[] = [
    `Soak test "${name}" completed ${passed ? 'successfully' : 'with issues'}.`,
    `Monitored ${snapshots.length} snapshot(s) over ~${holdDurationMinutes} minutes.`,
  ];

  if (degradationPatterns.length === 0) {
    lines.push('No degradation patterns detected — system appears stable.');
  } else {
    lines.push(
      `Detected ${degradationPatterns.length} degradation pattern(s): ` +
        degradationPatterns.map((p) => p.type).join(', ') +
        '.',
    );
  }

  if (memoryLeakDetected) {
    lines.push(
      'Memory leak indicators were detected. Recommend profiling the application under sustained load.',
    );
  }

  return lines.join(' ');
}

// ---------------------------------------------------------------------------
// SoakTester class
// ---------------------------------------------------------------------------

/** Executes soak tests against configured endpoints using k6 */
export class SoakTester {
  /**
   * Runs a soak test and returns a structured result.
   *
   * @throws Error if k6 is not installed or config is invalid
   */
  async run(config: SoakTestConfig): Promise<SoakTestResult> {
    this.validateConfig(config);

    const k6Available = await checkK6Available(config.k6BinaryPath);
    if (!k6Available) {
      throw new Error(
        'k6 is not installed or not found on PATH. ' +
          'Install k6 from https://k6.io/docs/getting-started/installation/',
      );
    }

    const startedAt = new Date();
    const artifacts = buildArtifactPaths(config.outputDir, config.name);
    await ensureDir(artifacts.artifactDir);

    // Build k6 script with ramp-up → hold → ramp-down stages
    const script = generateK6Script({
      stages: [
        { duration: config.rampUpDuration, target: config.virtualUsers },
        { duration: config.holdDuration, target: config.virtualUsers },
        { duration: config.rampDownDuration, target: 0 },
      ],
      thresholds: {
        http_req_duration: [
          `p(95)<${config.thresholds.maxP95ResponseTimeMs}`,
          `p(99)<${config.thresholds.maxP99ResponseTimeMs}`,
        ],
        errors: [`rate<${config.thresholds.maxErrorRate}`],
      },
      endpoints: config.endpoints,
    });

    await writeK6Script(script, artifacts.artifactDir, 'soak_test');

    // Run k6
    const k6Result = await runK6(artifacts.scriptPath, {
      k6BinaryPath: config.k6BinaryPath,
      jsonOutputPath: artifacts.jsonOutputPath,
      summaryOutputPath: artifacts.summaryOutputPath,
    });

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // Parse output
    const allPoints = await readAllK6DataPoints(artifacts.jsonOutputPath);
    const summary = await readK6Summary(artifacts.summaryOutputPath);

    // Determine hold-phase window
    const rampUpMs = parseDurationMs(config.rampUpDuration);
    const holdMs = parseDurationMs(config.holdDuration);
    const holdStart = new Date(startedAt.getTime() + rampUpMs);
    const holdEnd = new Date(startedAt.getTime() + rampUpMs + holdMs);

    // Collect snapshots
    const snapshots = collectSnapshots({
      holdStart,
      holdEnd,
      snapshotIntervalSeconds: config.snapshotIntervalSeconds,
      allPoints,
      virtualUsers: config.virtualUsers,
    });

    // Detect degradation patterns
    const degradationPatterns = detectDegradation(snapshots, config);

    const memoryLeakDetected = degradationPatterns.some(
      (p) =>
        p.type === 'memory_leak_indicator' ||
        p.type === 'response_time_increase',
    );

    const overallMetrics = extractMetricSummary(summary, 'http_req_duration');

    const passed =
      k6Result.exitCode === 0 &&
      degradationPatterns.length === 0;

    const partial: Omit<SoakTestResult, 'summary'> = {
      name: config.name,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      snapshots,
      degradationPatterns,
      memoryLeakDetected,
      overallMetrics,
      passed,
    };

    return { ...partial, summary: buildSummary(partial) };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private validateConfig(config: SoakTestConfig): void {
    if (!config.name || config.name.trim() === '') {
      throw new Error('SoakTestConfig.name is required');
    }
    if (!config.endpoints || config.endpoints.length === 0) {
      throw new Error('SoakTestConfig.endpoints must have at least one entry');
    }
    if (config.virtualUsers <= 0) {
      throw new Error(
        `SoakTestConfig.virtualUsers must be greater than 0, got ${config.virtualUsers}`,
      );
    }
    if (!config.rampUpDuration) {
      throw new Error('SoakTestConfig.rampUpDuration is required');
    }
    if (!config.holdDuration) {
      throw new Error('SoakTestConfig.holdDuration is required');
    }
    if (!config.rampDownDuration) {
      throw new Error('SoakTestConfig.rampDownDuration is required');
    }
    if (config.snapshotIntervalSeconds <= 0) {
      throw new Error(
        `SoakTestConfig.snapshotIntervalSeconds must be greater than 0, got ${config.snapshotIntervalSeconds}`,
      );
    }
    if (
      config.degradationThresholdPercent < 0 ||
      config.degradationThresholdPercent > 100
    ) {
      throw new Error(
        'SoakTestConfig.degradationThresholdPercent must be between 0 and 100',
      );
    }
  }
}
