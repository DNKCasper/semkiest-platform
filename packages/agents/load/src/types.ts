/**
 * Shared types for the Load Testing Agent.
 * Covers configuration, raw k6 metrics, and structured results for
 * stress testing, soak testing, and report generation.
 */

// ---------------------------------------------------------------------------
// Base configuration
// ---------------------------------------------------------------------------

/** HTTP methods supported for load test requests */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/** A single HTTP endpoint to target during load testing */
export interface LoadTestEndpoint {
  /** Full URL of the endpoint */
  url: string;
  /** HTTP method (default: GET) */
  method?: HttpMethod;
  /** Optional request body (for POST/PUT/PATCH) */
  body?: string;
  /** Optional request headers */
  headers?: Record<string, string>;
  /** Wait between iterations in seconds (default: 1) */
  sleepSeconds?: number;
}

/** Performance thresholds used to determine pass/fail */
export interface PerformanceThresholds {
  /** Maximum allowed p95 response time in milliseconds (default: 2000) */
  maxP95ResponseTimeMs: number;
  /** Maximum allowed p99 response time in milliseconds (default: 5000) */
  maxP99ResponseTimeMs: number;
  /** Maximum allowed error rate as a fraction 0–1 (default: 0.05) */
  maxErrorRate: number;
  /** Minimum required requests per second (default: 1) */
  minThroughputRps: number;
}

/** Common base for all load test configurations */
export interface BaseLoadTestConfig {
  /** Human-readable name for this test run */
  name: string;
  /** One or more endpoints to test */
  endpoints: LoadTestEndpoint[];
  /** Performance thresholds to compare results against */
  thresholds: PerformanceThresholds;
  /** Directory for storing k6 scripts and raw output files */
  outputDir: string;
  /** Path to the k6 binary (default: 'k6') */
  k6BinaryPath?: string;
}

// ---------------------------------------------------------------------------
// Stress test configuration
// ---------------------------------------------------------------------------

/** A single stage in a stress test ramp-up sequence */
export interface StressStage {
  /** Target number of virtual users at the end of this stage */
  targetVus: number;
  /** How long to ramp up to targetVus (e.g., '30s', '1m', '2m') */
  rampUpDuration: string;
  /** How long to hold at targetVus after ramping up */
  holdDuration: string;
}

/** Configuration for a stress test run */
export interface StressTestConfig extends BaseLoadTestConfig {
  /** Ordered list of stages; each stage increases load */
  stages: StressStage[];
  /**
   * Error rate fraction (0–1) that indicates the breaking point.
   * The first stage that exceeds this rate is flagged as the breaking point.
   * Default: 0.1 (10%)
   */
  breakingPointErrorRateThreshold: number;
  /**
   * p95 latency in ms that indicates the breaking point.
   * Default: 5000 ms
   */
  breakingPointLatencyMs: number;
}

// ---------------------------------------------------------------------------
// Soak test configuration
// ---------------------------------------------------------------------------

/** Configuration for a soak test run */
export interface SoakTestConfig extends BaseLoadTestConfig {
  /** Number of virtual users to sustain throughout the test */
  virtualUsers: number;
  /** How long to ramp up to virtualUsers (e.g., '2m') */
  rampUpDuration: string;
  /** How long to hold at virtualUsers (e.g., '1h') */
  holdDuration: string;
  /** How long to ramp down from virtualUsers (e.g., '2m') */
  rampDownDuration: string;
  /**
   * Sampling interval for metric snapshots in seconds.
   * Snapshots are used to detect degradation trends. Default: 30
   */
  snapshotIntervalSeconds: number;
  /**
   * Percentage increase in p95 response time over the test duration that
   * constitutes a memory-leak / degradation signal (default: 20%).
   */
  degradationThresholdPercent: number;
}

// ---------------------------------------------------------------------------
// Raw k6 output types
// ---------------------------------------------------------------------------

/** A single data point from the k6 JSON output stream */
export interface K6DataPoint {
  type: 'Point';
  metric: string;
  data: {
    time: string;
    value: number;
    tags: Record<string, string>;
  };
}

/** A metric definition from the k6 JSON output stream */
export interface K6MetricDefinition {
  type: 'Metric';
  metric: string;
  data: {
    name: string;
    type: 'counter' | 'gauge' | 'rate' | 'trend';
    contains: string;
    thresholds: string[];
    submetrics: null | string[];
  };
}

/** Union of all possible k6 JSON output line types */
export type K6OutputLine = K6DataPoint | K6MetricDefinition;

/** Aggregated metric values from the k6 summary export */
export interface K6MetricSummary {
  type: 'counter' | 'gauge' | 'rate' | 'trend';
  contains: string;
  values: Record<string, number>;
}

/** Full k6 summary JSON structure */
export interface K6Summary {
  metrics: Record<string, K6MetricSummary>;
  root_group: {
    name: string;
    path: string;
    id: string;
    groups: unknown[];
    checks: Array<{
      name: string;
      path: string;
      id: string;
      passes: number;
      fails: number;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Per-stage metrics (used internally by stress / soak testers)
// ---------------------------------------------------------------------------

/** Aggregated metrics collected for a single time window or stage */
export interface StageMetrics {
  /** Wall-clock start of this window (ISO string) */
  windowStart: string;
  /** Wall-clock end of this window (ISO string) */
  windowEnd: string;
  /** Average response time in ms */
  avgResponseTimeMs: number;
  /** 50th-percentile response time in ms */
  p50ResponseTimeMs: number;
  /** 95th-percentile response time in ms */
  p95ResponseTimeMs: number;
  /** 99th-percentile response time in ms */
  p99ResponseTimeMs: number;
  /** Minimum response time in ms */
  minResponseTimeMs: number;
  /** Maximum response time in ms */
  maxResponseTimeMs: number;
  /** Total requests made in this window */
  totalRequests: number;
  /** Requests per second in this window */
  requestsPerSecond: number;
  /** Error rate as a fraction 0–1 */
  errorRate: number;
  /** Number of virtual users at the end of this window */
  virtualUsers: number;
}

// ---------------------------------------------------------------------------
// Stress test result
// ---------------------------------------------------------------------------

/** Per-stage summary during a stress test */
export interface StressStageResult {
  /** Stage index (0-based) */
  stageIndex: number;
  /** Configuration used for this stage */
  config: StressStage;
  /** Aggregated metrics recorded during the hold phase */
  metrics: StageMetrics;
  /** Whether this stage exceeded breaking-point thresholds */
  isBreakingPoint: boolean;
}

/** Full result from a stress test run */
export interface StressTestResult {
  /** Test name from config */
  name: string;
  /** ISO timestamp of when the test started */
  startedAt: string;
  /** ISO timestamp of when the test finished */
  finishedAt: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Results for every stage executed */
  stages: StressStageResult[];
  /**
   * Index of the stage identified as the breaking point, or null if the
   * system handled all stages within thresholds.
   */
  breakingPointStageIndex: number | null;
  /** Maximum sustainable VU count before breaking */
  maxSustainableVus: number;
  /** Overall metrics from the entire test run (k6 summary) */
  overallMetrics: K6MetricSummary;
  /** Whether the test passed all configured thresholds */
  passed: boolean;
  /** Human-readable summary of findings */
  summary: string;
}

// ---------------------------------------------------------------------------
// Soak test result
// ---------------------------------------------------------------------------

/** A snapshot taken at a point in time during a soak test */
export interface SoakSnapshot {
  /** ISO timestamp */
  timestamp: string;
  /** Elapsed seconds from the start of the hold phase */
  elapsedSeconds: number;
  metrics: StageMetrics;
}

/** Detected degradation or anomaly pattern during a soak test */
export interface DegradationPattern {
  /** Type of degradation detected */
  type: 'response_time_increase' | 'error_rate_spike' | 'throughput_drop' | 'memory_leak_indicator';
  /** ISO timestamp when the pattern was first detected */
  detectedAt: string;
  /** Elapsed seconds into the hold phase when detected */
  elapsedSeconds: number;
  /** Human-readable description of the pattern */
  description: string;
  /** Baseline value at the start of the hold phase */
  baselineValue: number;
  /** Observed value when the pattern was detected */
  observedValue: number;
  /** Percentage change from baseline */
  changePercent: number;
}

/** Full result from a soak test run */
export interface SoakTestResult {
  /** Test name from config */
  name: string;
  /** ISO timestamp of when the test started */
  startedAt: string;
  /** ISO timestamp of when the test finished */
  finishedAt: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Metric snapshots collected throughout the hold phase */
  snapshots: SoakSnapshot[];
  /** Detected degradation patterns (empty if stable) */
  degradationPatterns: DegradationPattern[];
  /** Whether any memory-leak indicators were detected */
  memoryLeakDetected: boolean;
  /** Overall metrics from the entire test run (k6 summary) */
  overallMetrics: K6MetricSummary;
  /** Whether the test passed all configured thresholds */
  passed: boolean;
  /** Human-readable summary of findings */
  summary: string;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/** Configuration for report generation */
export interface ReportConfig {
  /** Title displayed in the generated report */
  title: string;
  /** Directory where the report file will be written */
  outputDir: string;
  /** Report file name (without extension, default: 'load-test-report') */
  fileName?: string;
  /** Whether to include raw data tables in the report (default: true) */
  includeRawData?: boolean;
}

/** A data series for a chart */
export interface ChartDataSeries {
  label: string;
  data: number[];
  color: string;
}

/** Data required to render a single chart */
export interface ChartData {
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  labels: string[];
  series: ChartDataSeries[];
}

/** A complete generated load test report */
export interface LoadTestReport {
  /** Path to the generated HTML report file */
  reportPath: string;
  /** Title of the report */
  title: string;
  /** ISO timestamp when the report was generated */
  generatedAt: string;
  /** Charts included in the report */
  charts: ChartData[];
  /** Whether the overall test passed */
  passed: boolean;
  /** High-level findings text */
  findings: string[];
}

/** Union type for test results that can be reported on */
export type AnyTestResult = StressTestResult | SoakTestResult;
