/**
 * Stress Tester
 *
 * Gradually increases virtual user load across configurable stages and
 * identifies the breaking point — the first stage where error rates or
 * latency exceed configured thresholds.
 *
 * Usage:
 *   const tester = new StressTester();
 *   const result = await tester.run(config);
 */

import * as path from 'path';
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
  StressStage,
  StressStageResult,
  StressTestConfig,
  StressTestResult,
} from './types';

// ---------------------------------------------------------------------------
// Stage time window calculation
// ---------------------------------------------------------------------------

/**
 * Given the test start time and an ordered list of stages, computes the
 * absolute start/end timestamps for the *hold* phase of each stage.
 * The hold phase begins after the ramp-up and lasts for holdDuration.
 */
function computeStageWindows(
  testStartMs: number,
  stages: StressStage[],
): Array<{ holdStart: Date; holdEnd: Date }> {
  const windows: Array<{ holdStart: Date; holdEnd: Date }> = [];
  let cursor = testStartMs;

  for (const stage of stages) {
    const rampMs = parseDurationMs(stage.rampUpDuration);
    const holdMs = parseDurationMs(stage.holdDuration);
    const holdStart = new Date(cursor + rampMs);
    const holdEnd = new Date(cursor + rampMs + holdMs);
    windows.push({ holdStart, holdEnd });
    cursor += rampMs + holdMs;
  }

  return windows;
}

// ---------------------------------------------------------------------------
// k6 stage options builder
// ---------------------------------------------------------------------------

function buildK6Stages(
  stages: StressStage[],
): Array<{ duration: string; target: number }> {
  const k6Stages: Array<{ duration: string; target: number }> = [];
  for (const stage of stages) {
    // Ramp up to the target
    k6Stages.push({ duration: stage.rampUpDuration, target: stage.targetVus });
    // Hold at the target
    k6Stages.push({ duration: stage.holdDuration, target: stage.targetVus });
  }
  // Final ramp-down to 0
  k6Stages.push({ duration: '30s', target: 0 });
  return k6Stages;
}

// ---------------------------------------------------------------------------
// Breaking-point detection
// ---------------------------------------------------------------------------

function isBreakingPoint(
  stageMetrics: { errorRate: number; p95ResponseTimeMs: number },
  config: StressTestConfig,
): boolean {
  return (
    stageMetrics.errorRate > config.breakingPointErrorRateThreshold ||
    stageMetrics.p95ResponseTimeMs > config.breakingPointLatencyMs
  );
}

// ---------------------------------------------------------------------------
// Result summary generation
// ---------------------------------------------------------------------------

function buildSummary(result: Omit<StressTestResult, 'summary'>): string {
  const { stages, breakingPointStageIndex, maxSustainableVus, passed } = result;

  if (stages.length === 0) {
    return 'No stages were executed.';
  }

  const lines: string[] = [
    `Stress test completed ${passed ? 'successfully' : 'with threshold violations'}.`,
    `Executed ${stages.length} stage(s).`,
  ];

  if (breakingPointStageIndex !== null) {
    const bp = stages[breakingPointStageIndex];
    lines.push(
      `Breaking point detected at stage ${breakingPointStageIndex + 1} ` +
        `(${bp.config.targetVus} VUs): ` +
        `error rate ${(bp.metrics.errorRate * 100).toFixed(1)}%, ` +
        `p95 latency ${bp.metrics.p95ResponseTimeMs.toFixed(0)}ms.`,
    );
    lines.push(
      `Maximum sustainable load: ${maxSustainableVus} virtual users.`,
    );
  } else {
    lines.push(
      `No breaking point detected. The system handled all ${maxSustainableVus} VUs within thresholds.`,
    );
  }

  // Highlight the peak stage
  const lastNonBreaking = stages
    .filter((s) => !s.isBreakingPoint)
    .at(-1);
  if (lastNonBreaking) {
    lines.push(
      `Peak stable stage: ${lastNonBreaking.config.targetVus} VUs — ` +
        `avg ${lastNonBreaking.metrics.avgResponseTimeMs.toFixed(0)}ms, ` +
        `p95 ${lastNonBreaking.metrics.p95ResponseTimeMs.toFixed(0)}ms, ` +
        `${lastNonBreaking.metrics.requestsPerSecond.toFixed(1)} req/s.`,
    );
  }

  return lines.join(' ');
}

// ---------------------------------------------------------------------------
// StressTester class
// ---------------------------------------------------------------------------

/** Executes stress tests against configured endpoints using k6 */
export class StressTester {
  /**
   * Runs a stress test and returns a structured result.
   *
   * @throws Error if k6 is not installed or config is invalid
   */
  async run(config: StressTestConfig): Promise<StressTestResult> {
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

    // Build k6 script
    const k6Stages = buildK6Stages(config.stages);
    const script = generateK6Script({
      stages: k6Stages,
      thresholds: {
        http_req_duration: [
          `p(95)<${config.thresholds.maxP95ResponseTimeMs}`,
          `p(99)<${config.thresholds.maxP99ResponseTimeMs}`,
        ],
        errors: [`rate<${config.thresholds.maxErrorRate}`],
      },
      endpoints: config.endpoints,
    });

    await writeK6Script(script, artifacts.artifactDir, 'stress_test');

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

    const durationPoints = allPoints.get('http_req_duration') ?? [];
    const failedPoints = allPoints.get('http_req_failed') ?? [];
    const reqsPoints = allPoints.get('http_reqs') ?? [];
    const vusPoints = allPoints.get('vus') ?? [];

    // Calculate per-stage metrics
    const stageWindows = computeStageWindows(
      startedAt.getTime(),
      config.stages,
    );

    const stageResults: StressStageResult[] = config.stages.map(
      (stage, i) => {
        const { holdStart, holdEnd } = stageWindows[i];
        const windowDurationSeconds =
          (holdEnd.getTime() - holdStart.getTime()) / 1000;

        const metrics = aggregateMetrics({
          windowStart: holdStart.toISOString(),
          windowEnd: holdEnd.toISOString(),
          durationPoints: filterByTimeWindow(durationPoints, holdStart, holdEnd),
          failedPoints: filterByTimeWindow(failedPoints, holdStart, holdEnd),
          reqsPoints: filterByTimeWindow(reqsPoints, holdStart, holdEnd),
          vusPoints: filterByTimeWindow(vusPoints, holdStart, holdEnd),
          windowDurationSeconds,
        });

        // Override VU from stage config if data is sparse
        if (metrics.virtualUsers === 0) {
          metrics.virtualUsers = stage.targetVus;
        }

        const breaking = isBreakingPoint(metrics, config);

        return {
          stageIndex: i,
          config: stage,
          metrics,
          isBreakingPoint: breaking,
        };
      },
    );

    // Find breaking point (first stage that exceeds thresholds)
    const breakingPointIndex = stageResults.findIndex((s) => s.isBreakingPoint);
    const breakingPointStageIndex =
      breakingPointIndex === -1 ? null : breakingPointIndex;

    const maxSustainableVus =
      breakingPointStageIndex !== null && breakingPointStageIndex > 0
        ? config.stages[breakingPointStageIndex - 1].targetVus
        : breakingPointStageIndex === 0
          ? 0
          : config.stages[config.stages.length - 1].targetVus;

    const overallMetrics = extractMetricSummary(summary, 'http_req_duration');

    // Test passes if k6 exited cleanly and no breaking point, or if the run
    // was intentional and within top-level thresholds
    const passed =
      k6Result.exitCode === 0 && breakingPointStageIndex === null;

    const partial: Omit<StressTestResult, 'summary'> = {
      name: config.name,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      stages: stageResults,
      breakingPointStageIndex,
      maxSustainableVus,
      overallMetrics,
      passed,
    };

    return { ...partial, summary: buildSummary(partial) };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private validateConfig(config: StressTestConfig): void {
    if (!config.name || config.name.trim() === '') {
      throw new Error('StressTestConfig.name is required');
    }
    if (!config.endpoints || config.endpoints.length === 0) {
      throw new Error('StressTestConfig.endpoints must have at least one entry');
    }
    if (!config.stages || config.stages.length === 0) {
      throw new Error('StressTestConfig.stages must have at least one entry');
    }
    for (const [i, stage] of config.stages.entries()) {
      if (stage.targetVus <= 0) {
        throw new Error(
          `Stage ${i}: targetVus must be greater than 0, got ${stage.targetVus}`,
        );
      }
      if (!stage.rampUpDuration) {
        throw new Error(`Stage ${i}: rampUpDuration is required`);
      }
      if (!stage.holdDuration) {
        throw new Error(`Stage ${i}: holdDuration is required`);
      }
    }
    if (
      config.breakingPointErrorRateThreshold < 0 ||
      config.breakingPointErrorRateThreshold > 1
    ) {
      throw new Error(
        'StressTestConfig.breakingPointErrorRateThreshold must be between 0 and 1',
      );
    }
  }
}
