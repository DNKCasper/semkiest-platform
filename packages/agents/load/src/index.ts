/**
 * @semkiest/agents-load
 *
 * Load testing agent providing stress testing, soak testing, and report
 * generation capabilities built on top of the k6 load testing framework.
 *
 * @example
 * ```ts
 * import { StressTester, SoakTester, ReportGenerator } from '@semkiest/agents-load';
 *
 * const stress = new StressTester();
 * const result = await stress.run({
 *   name: 'API Stress Test',
 *   endpoints: [{ url: 'http://localhost:3000/api/health' }],
 *   stages: [
 *     { targetVus: 10, rampUpDuration: '30s', holdDuration: '1m' },
 *     { targetVus: 50, rampUpDuration: '1m',  holdDuration: '2m' },
 *     { targetVus: 100, rampUpDuration: '1m', holdDuration: '2m' },
 *   ],
 *   thresholds: {
 *     maxP95ResponseTimeMs: 2000,
 *     maxP99ResponseTimeMs: 5000,
 *     maxErrorRate: 0.05,
 *     minThroughputRps: 10,
 *   },
 *   outputDir: '/tmp/load-results',
 *   breakingPointErrorRateThreshold: 0.1,
 *   breakingPointLatencyMs: 5000,
 * });
 *
 * const reporter = new ReportGenerator();
 * const report = await reporter.generate(result, {
 *   title: 'API Stress Test Report',
 *   outputDir: '/tmp/reports',
 * });
 *
 * console.log('Report:', report.reportPath);
 * ```
 */

// Main classes
export { StressTester } from './stress-tester';
export { SoakTester } from './soak-tester';
export { ReportGenerator } from './report-generator';

// k6 runner utilities (exported for advanced usage)
export {
  checkK6Available,
  generateK6Script,
  runK6,
  readK6DataPoints,
  readAllK6DataPoints,
  readK6Summary,
  aggregateMetrics,
  filterByTimeWindow,
  buildArtifactPaths,
  ensureDir,
  writeK6Script,
  parseDurationMs,
  formatDurationLabel,
} from './k6-runner';

// All TypeScript types
export type {
  // Base
  HttpMethod,
  LoadTestEndpoint,
  PerformanceThresholds,
  BaseLoadTestConfig,
  // Stress test
  StressStage,
  StressTestConfig,
  StressStageResult,
  StressTestResult,
  // Soak test
  SoakTestConfig,
  SoakSnapshot,
  DegradationPattern,
  SoakTestResult,
  // k6 internals
  K6DataPoint,
  K6MetricDefinition,
  K6OutputLine,
  K6MetricSummary,
  K6Summary,
  StageMetrics,
  // Report
  ReportConfig,
  ChartData,
  ChartDataSeries,
  LoadTestReport,
  AnyTestResult,
} from './types';

export type { K6ScriptOptions, RunK6Options, K6RunResult } from './k6-runner';
