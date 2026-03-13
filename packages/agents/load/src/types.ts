import type { AgentConfig } from '@semkiest/agent-base';

// ---------------------------------------------------------------------------
// User flow input types
// ---------------------------------------------------------------------------

/** Supported HTTP methods for a flow step. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A single HTTP request within a user flow.
 */
export interface UserFlowStep {
  /** HTTP method to use. */
  method: HttpMethod;
  /** Full URL or path (resolved against `LoadConfig.baseUrl` when relative). */
  url: string;
  /** Optional JSON request body. Serialised to JSON automatically. */
  body?: Record<string, unknown>;
  /** Additional HTTP headers to send with this step. */
  headers?: Record<string, string>;
  /** HTTP status code expected for the check assertion. Defaults to 200. */
  expectedStatus?: number;
  /** k6 tags applied to metrics for this step (e.g. for filtering in dashboards). */
  tags?: Record<string, string>;
}

/**
 * A named sequence of HTTP steps that models one user journey.
 */
export interface UserFlow {
  /** Identifier used as a k6 function name (must be a valid JS identifier). */
  name: string;
  /** Steps executed in order for this flow. */
  steps: UserFlowStep[];
  /**
   * Think-time in milliseconds inserted between steps.
   * Converted to `sleep(thinkTime / 1000)` in the generated script.
   * Defaults to 1000 ms.
   */
  thinkTime?: number;
  /**
   * Relative weight used for traffic distribution when multiple flows are
   * included. Higher numbers get proportionally more executions.
   * Defaults to 1.
   */
  weight?: number;
}

// ---------------------------------------------------------------------------
// Load configuration
// ---------------------------------------------------------------------------

/**
 * One stage in a VU ramp pattern.
 */
export interface LoadStage {
  /** Duration string understood by k6, e.g. `"30s"`, `"2m"`, `"1h"`. */
  duration: string;
  /** Target number of virtual users at the end of this stage. */
  target: number;
}

/**
 * Configures how load is applied during a test run.
 */
export interface LoadConfig {
  /**
   * Constant number of virtual users when no `stages` are specified.
   * Ignored when `stages` is provided.
   * Defaults to 10.
   */
  virtualUsers?: number;
  /**
   * Total test duration when no `stages` are specified, e.g. `"30s"`, `"5m"`.
   * Ignored when `stages` is provided.
   * Defaults to `"30s"`.
   */
  duration?: string;
  /**
   * Ramping stages. When provided, `virtualUsers` and `duration` are ignored.
   * A common pattern is ramp-up → steady-state → ramp-down.
   */
  stages?: LoadStage[];
  /**
   * Convenience alias: duration of the ramp-up stage.
   * Generates a three-stage pattern (rampUp → steady at `virtualUsers` for
   * `duration` → rampDown) when `stages` is omitted.
   */
  rampUp?: string;
  /**
   * Convenience alias: duration of the ramp-down stage.
   * See `rampUp` for usage context.
   */
  rampDown?: string;
  /**
   * Base URL prepended to any relative `url` in a flow step.
   * e.g. `"https://api.example.com"`.
   */
  baseUrl?: string;
  /** Threshold values applied to the generated k6 options. */
  thresholds?: LoadThresholds;
}

/**
 * Pass/fail thresholds applied to the k6 run.
 */
export interface LoadThresholds {
  /** p95 response time limit in milliseconds. Defaults to 2000. */
  httpReqDurationP95?: number;
  /** Maximum acceptable error rate as a fraction (0–1). Defaults to 0.1. */
  httpReqFailedRate?: number;
}

// ---------------------------------------------------------------------------
// Metrics types
// ---------------------------------------------------------------------------

/**
 * Percentile breakdown for a timing metric (all values in milliseconds).
 */
export interface PercentileMetrics {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

/** Counter-style throughput metrics. */
export interface ThroughputMetrics {
  /** Total request count over the test run. */
  count: number;
  /** Requests per second averaged over the test run. */
  rate: number;
}

/** Error rate summary. */
export interface ErrorMetrics {
  /** Fraction of failed requests (0–1). */
  rate: number;
  /** Absolute count of failed requests. */
  count: number;
}

/** Virtual user gauge metrics. */
export interface VuMetrics {
  /** VU count at the end of the test. */
  current: number;
  /** Peak VU count observed during the test. */
  max: number;
}

/**
 * Aggregated load test metrics produced by `MetricsCollector`.
 */
export interface LoadTestMetrics {
  httpReqDuration: PercentileMetrics;
  httpReqs: ThroughputMetrics;
  httpReqFailed: ErrorMetrics;
  vus: VuMetrics;
  /** Total completed iterations. */
  iterations: number;
  /** Time the metrics snapshot was taken. */
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// k6 output types
// ---------------------------------------------------------------------------

/** A single metric definition entry in a k6 JSON output stream. */
export interface K6MetricDefinition {
  type: 'Metric';
  metric: string;
  data: {
    name: string;
    type: string;
    contains: string;
    thresholds: string[];
    submetrics: null | string[];
  };
}

/** A single data point in a k6 JSON output stream. */
export interface K6DataPoint {
  type: 'Point';
  metric: string;
  data: {
    time: string;
    value: number;
    tags: Record<string, string>;
  };
}

/** Union of entries in a k6 JSON output stream. */
export type K6OutputLine = K6MetricDefinition | K6DataPoint;

/** Shape of a k6 summary export JSON file (`--summary-export`). */
export interface K6Summary {
  metrics: Record<string, K6SummaryMetric>;
}

/** One metric entry inside a k6 summary export. */
export interface K6SummaryMetric {
  type: string;
  contains: string;
  values: Record<string, number>;
  thresholds?: Record<string, { ok: boolean }>;
}

// ---------------------------------------------------------------------------
// Executor types
// ---------------------------------------------------------------------------

/** Options for a single k6 execution. */
export interface K6ExecutionOptions {
  /** Absolute path where the JSON output stream should be written. */
  outputPath?: string;
  /** Absolute path for the summary export JSON file. */
  summaryExportPath?: string;
  /** Extra environment variables forwarded to the k6 process. */
  env?: Record<string, string>;
  /** Process timeout in milliseconds. Defaults to 10 minutes. */
  timeout?: number;
}

/** Raw result returned by `K6Executor.execute()`. */
export interface K6ExecutionResult {
  /** k6 process exit code (0 = pass, 99 = threshold failure, other = error). */
  exitCode: number;
  /** Wall-clock duration of the k6 process in milliseconds. */
  duration: number;
  /** Absolute path to the script file that was executed. */
  scriptPath: string;
  /** Absolute path to the summary export (may not exist on error). */
  summaryPath: string | undefined;
  /** Combined stdout + stderr captured from the k6 process. */
  rawOutput: string;
  /** Temp directory that holds all generated artefacts. */
  tmpDir: string;
}

// ---------------------------------------------------------------------------
// Load agent config / result
// ---------------------------------------------------------------------------

/** Configuration for `LoadAgent`. */
export interface LoadAgentConfig extends AgentConfig {
  /** One or more user flows to generate and execute. */
  flows: UserFlow[];
  /** Controls virtual user counts, durations, and ramp patterns. */
  loadConfig: LoadConfig;
  /**
   * Path (or name) of the k6 binary.
   * Defaults to `"k6"` (relies on PATH).
   */
  k6Binary?: string;
}

/** Final result produced by a successful `LoadAgent.run()`. */
export interface LoadTestResult {
  /** Aggregated metrics parsed from the k6 summary export. */
  metrics: LoadTestMetrics;
  /** k6 process exit code. */
  exitCode: number;
  /** Total test wall-clock time in milliseconds. */
  duration: number;
  /** Path to the generated k6 script. */
  scriptPath: string;
  /** True when exit code is 0 (all thresholds passed). */
  passed: boolean;
}
