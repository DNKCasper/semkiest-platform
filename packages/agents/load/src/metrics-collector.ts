import { EventEmitter } from 'events';
import * as fs from 'fs';
import type {
  K6OutputLine,
  K6Summary,
  LoadTestMetrics,
  PercentileMetrics,
  ThroughputMetrics,
  ErrorMetrics,
  VuMetrics,
} from './types';

/**
 * Real-time and post-run metrics aggregation for k6 test results.
 *
 * Usage:
 * 1. Feed raw k6 JSON-output lines via `parseK6JsonLine()` during execution.
 * 2. After execution, call `collectFromSummary()` to build a complete
 *    `LoadTestMetrics` snapshot from the k6 `--summary-export` file.
 *
 * Events:
 * - `point`   – emitted for each parsed `Point` entry during streaming.
 * - `summary` – emitted once when `collectFromSummary` resolves.
 */
export class MetricsCollector extends EventEmitter {
  /** In-memory store of raw point values per metric name. */
  private readonly points = new Map<string, number[]>();

  // ---------------------------------------------------------------------------
  // Streaming ingestion
  // ---------------------------------------------------------------------------

  /**
   * Parse a single line from a k6 `--out json` stream and emit a `point` event
   * if the line represents a data point.
   *
   * Non-JSON lines and metric definition entries are silently ignored.
   */
  parseK6JsonLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: K6OutputLine;
    try {
      parsed = JSON.parse(trimmed) as K6OutputLine;
    } catch {
      return; // Not a JSON line — skip
    }

    if (parsed.type !== 'Point') return;

    const { metric, data } = parsed;
    if (typeof data.value !== 'number') return;

    this.recordPoint(metric, data.value);
    this.emit('point', { metric, value: data.value, time: data.time, tags: data.tags });
  }

  /**
   * Record an individual metric data point in the in-memory store.
   */
  recordPoint(metric: string, value: number): void {
    if (!this.points.has(metric)) {
      this.points.set(metric, []);
    }
    this.points.get(metric)!.push(value);
  }

  /**
   * Return a copy of all raw points collected so far for `metric`.
   */
  getRawPoints(metric: string): number[] {
    return [...(this.points.get(metric) ?? [])];
  }

  // ---------------------------------------------------------------------------
  // Summary-file parsing
  // ---------------------------------------------------------------------------

  /**
   * Read a k6 summary export file (produced by `--summary-export <path>`) and
   * return a fully-populated `LoadTestMetrics` object.
   *
   * @throws If the file cannot be read or is not valid JSON.
   */
  async collectFromSummary(summaryPath: string): Promise<LoadTestMetrics> {
    const raw = await fs.promises.readFile(summaryPath, 'utf-8');
    const summary: K6Summary = JSON.parse(raw) as K6Summary;
    const metrics = this.parseSummary(summary);
    this.emit('summary', metrics);
    return metrics;
  }

  /**
   * Parse an in-memory `K6Summary` object into a `LoadTestMetrics` snapshot.
   * Values default to 0 when the summary is missing a metric (e.g. when no
   * HTTP requests were made).
   */
  parseSummary(summary: K6Summary): LoadTestMetrics {
    const duration = summary.metrics['http_req_duration'];
    const reqs = summary.metrics['http_reqs'];
    const failed = summary.metrics['http_req_failed'];
    const vus = summary.metrics['vus'];
    const iters = summary.metrics['iterations'];

    const httpReqDuration: PercentileMetrics = {
      p50: duration?.values['p(50)'] ?? duration?.values['med'] ?? 0,
      p90: duration?.values['p(90)'] ?? 0,
      p95: duration?.values['p(95)'] ?? 0,
      p99: duration?.values['p(99)'] ?? 0,
      min: duration?.values['min'] ?? 0,
      max: duration?.values['max'] ?? 0,
      avg: duration?.values['avg'] ?? 0,
    };

    const reqCount = reqs?.values['count'] ?? 0;
    const failedRate = failed?.values['rate'] ?? 0;

    const httpReqs: ThroughputMetrics = {
      count: reqCount,
      rate: reqs?.values['rate'] ?? 0,
    };

    const httpReqFailed: ErrorMetrics = {
      rate: failedRate,
      count: Math.round(failedRate * reqCount),
    };

    const vuMetrics: VuMetrics = {
      current: vus?.values['value'] ?? 0,
      max: vus?.values['max'] ?? 0,
    };

    return {
      httpReqDuration,
      httpReqs,
      httpReqFailed,
      vus: vuMetrics,
      iterations: iters?.values['count'] ?? 0,
      timestamp: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // In-memory percentile calculation
  // ---------------------------------------------------------------------------

  /**
   * Calculate a given percentile over a sorted array of values.
   *
   * @param values     - Raw numeric values.
   * @param percentile - Percentile to compute (0–100).
   * @returns          The percentile value, or 0 for an empty array.
   */
  calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Build a `PercentileMetrics` snapshot from raw in-memory data points for
   * `http_req_duration`. Useful when no summary file is available.
   */
  buildInMemoryDurationMetrics(): PercentileMetrics {
    const values = this.points.get('http_req_duration') ?? [];
    if (values.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      p50: this.calculatePercentile(sorted, 50),
      p90: this.calculatePercentile(sorted, 90),
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
    };
  }
}
