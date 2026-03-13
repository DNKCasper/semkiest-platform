/**
 * k6 script generation and execution utilities.
 *
 * Handles:
 * - Generating k6 JavaScript test scripts from config
 * - Spawning k6 as a child process and capturing output
 * - Parsing k6 JSON output lines and summary exports
 * - Computing percentile statistics from raw data points
 */

import { spawn } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  BaseLoadTestConfig,
  K6DataPoint,
  K6MetricSummary,
  K6OutputLine,
  K6Summary,
  LoadTestEndpoint,
  StageMetrics,
} from './types';

// ---------------------------------------------------------------------------
// k6 script generation
// ---------------------------------------------------------------------------

/**
 * Generates the body of a single k6 iteration function for one endpoint.
 */
function buildEndpointCall(endpoint: LoadTestEndpoint, index: number): string {
  const method = endpoint.method ?? 'GET';
  const sleep = endpoint.sleepSeconds ?? 1;
  const headers = endpoint.headers
    ? JSON.stringify(endpoint.headers)
    : 'undefined';

  const bodyArg =
    endpoint.body != null ? JSON.stringify(endpoint.body) : 'null';

  const paramsArg =
    endpoint.headers != null
      ? `{ headers: ${headers} }`
      : 'undefined';

  let requestCall: string;
  if (method === 'GET' || method === 'HEAD' || method === 'DELETE') {
    requestCall = `http.${method.toLowerCase()}(${JSON.stringify(endpoint.url)}, ${paramsArg !== 'undefined' ? paramsArg : '{}'})`;
  } else {
    requestCall = `http.${method.toLowerCase()}(${JSON.stringify(endpoint.url)}, ${bodyArg}, ${paramsArg !== 'undefined' ? paramsArg : '{}'})`;
  }

  return `
  // Endpoint ${index + 1}: ${method} ${endpoint.url}
  const res${index} = ${requestCall};
  check(res${index}, {
    'status_2xx_${index}': (r) => r.status >= 200 && r.status < 300,
    'duration_ok_${index}': (r) => r.timings.duration < 5000,
  });
  errorRate.add(res${index}.status < 200 || res${index}.status >= 300);
  if (res${index}.status >= 200 && res${index}.status < 300) {
    successCounter.add(1);
  }
  sleep(${sleep});`;
}

/** Options for generating a k6 script */
export interface K6ScriptOptions {
  stages: Array<{ duration: string; target: number }>;
  thresholds: {
    http_req_duration: string[];
    errors: string[];
  };
  endpoints: LoadTestEndpoint[];
}

/**
 * Generates a complete k6 script as a string.
 */
export function generateK6Script(options: K6ScriptOptions): string {
  const endpointCalls = options.endpoints
    .map((ep, i) => buildEndpointCall(ep, i))
    .join('\n');

  const stagesJson = JSON.stringify(options.stages, null, 2);
  const thresholdsJson = JSON.stringify(options.thresholds, null, 2);

  return `import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const successCounter = new Counter('successful_requests');

export const options = {
  stages: ${stagesJson},
  thresholds: ${thresholdsJson},
};

export default function () {${endpointCalls}
}
`;
}

// ---------------------------------------------------------------------------
// k6 execution
// ---------------------------------------------------------------------------

/** Options for running k6 */
export interface RunK6Options {
  /** Path to the k6 binary (default: 'k6') */
  k6BinaryPath?: string;
  /** Path to write NDJSON metric output (--out json=<path>) */
  jsonOutputPath: string;
  /** Path to write the summary JSON (--summary-export=<path>) */
  summaryOutputPath: string;
  /** Additional environment variables to pass to k6 */
  env?: Record<string, string>;
}

/** Return value from a k6 run */
export interface K6RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Executes k6 with the given script and options.
 * Resolves once the process exits (regardless of exit code — callers check
 * the exit code themselves to decide if the run is a failure).
 */
export function runK6(
  scriptPath: string,
  options: RunK6Options,
): Promise<K6RunResult> {
  return new Promise((resolve) => {
    const k6 = options.k6BinaryPath ?? 'k6';
    const args = [
      'run',
      '--out',
      `json=${options.jsonOutputPath}`,
      `--summary-export=${options.summaryOutputPath}`,
      '--no-color',
      scriptPath,
    ];

    const proc = spawn(k6, args, {
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });

    proc.on('error', (err) => {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: err.message,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// k6 output parsing
// ---------------------------------------------------------------------------

/**
 * Reads a k6 NDJSON output file and returns all Point lines for a given
 * metric name, sorted by timestamp ascending.
 */
export async function readK6DataPoints(
  jsonOutputPath: string,
  metricName: string,
): Promise<K6DataPoint[]> {
  if (!existsSync(jsonOutputPath)) {
    return [];
  }

  const content = await readFile(jsonOutputPath, 'utf8');
  const points: K6DataPoint[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: K6OutputLine;
    try {
      parsed = JSON.parse(trimmed) as K6OutputLine;
    } catch {
      continue;
    }

    if (parsed.type === 'Point' && parsed.metric === metricName) {
      points.push(parsed as K6DataPoint);
    }
  }

  return points.sort(
    (a, b) =>
      new Date(a.data.time).getTime() - new Date(b.data.time).getTime(),
  );
}

/**
 * Reads all data points from a k6 NDJSON output file, grouped by metric name.
 */
export async function readAllK6DataPoints(
  jsonOutputPath: string,
): Promise<Map<string, K6DataPoint[]>> {
  if (!existsSync(jsonOutputPath)) {
    return new Map();
  }

  const content = await readFile(jsonOutputPath, 'utf8');
  const grouped = new Map<string, K6DataPoint[]>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: K6OutputLine;
    try {
      parsed = JSON.parse(trimmed) as K6OutputLine;
    } catch {
      continue;
    }

    if (parsed.type === 'Point') {
      const point = parsed as K6DataPoint;
      if (!grouped.has(point.metric)) {
        grouped.set(point.metric, []);
      }
      grouped.get(point.metric)!.push(point);
    }
  }

  // Sort each group by time
  for (const [, points] of grouped) {
    points.sort(
      (a, b) =>
        new Date(a.data.time).getTime() - new Date(b.data.time).getTime(),
    );
  }

  return grouped;
}

/**
 * Parses the k6 summary export JSON file.
 */
export async function readK6Summary(
  summaryPath: string,
): Promise<K6Summary | null> {
  if (!existsSync(summaryPath)) {
    return null;
  }

  try {
    const content = await readFile(summaryPath, 'utf8');
    return JSON.parse(content) as K6Summary;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Statistics utilities
// ---------------------------------------------------------------------------

/** Computes the p-th percentile of a sorted array. */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Aggregates an array of data-point values into a StageMetrics-compatible
 * object. The caller is responsible for providing the time window and VU count.
 */
export function aggregateMetrics(params: {
  windowStart: string;
  windowEnd: string;
  durationPoints: K6DataPoint[];
  failedPoints: K6DataPoint[];
  reqsPoints: K6DataPoint[];
  vusPoints: K6DataPoint[];
  windowDurationSeconds: number;
}): StageMetrics {
  const {
    windowStart,
    windowEnd,
    durationPoints,
    failedPoints,
    reqsPoints,
    vusPoints,
    windowDurationSeconds,
  } = params;

  const durations = durationPoints.map((p) => p.data.value).sort((a, b) => a - b);

  const avgResponseTimeMs =
    durations.length > 0
      ? durations.reduce((s, v) => s + v, 0) / durations.length
      : 0;

  const totalRequests = reqsPoints.reduce((s, p) => s + p.data.value, 0);
  const requestsPerSecond =
    windowDurationSeconds > 0 ? totalRequests / windowDurationSeconds : 0;

  const failedCount = failedPoints.filter((p) => p.data.value === 1).length;
  const errorRate =
    totalRequests > 0 ? failedCount / totalRequests : 0;

  const lastVu =
    vusPoints.length > 0 ? vusPoints[vusPoints.length - 1].data.value : 0;

  return {
    windowStart,
    windowEnd,
    avgResponseTimeMs,
    p50ResponseTimeMs: percentile(durations, 50),
    p95ResponseTimeMs: percentile(durations, 95),
    p99ResponseTimeMs: percentile(durations, 99),
    minResponseTimeMs: durations.length > 0 ? durations[0] : 0,
    maxResponseTimeMs: durations.length > 0 ? durations[durations.length - 1] : 0,
    totalRequests,
    requestsPerSecond,
    errorRate,
    virtualUsers: lastVu,
  };
}

/**
 * Filters data points to only those within a given time window [start, end].
 */
export function filterByTimeWindow(
  points: K6DataPoint[],
  start: Date,
  end: Date,
): K6DataPoint[] {
  return points.filter((p) => {
    const t = new Date(p.data.time).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

/**
 * Ensures the given directory exists, creating it recursively if needed.
 */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Writes a k6 script to a temp file and returns the path.
 */
export async function writeK6Script(
  script: string,
  outputDir: string,
  name: string,
): Promise<string> {
  await ensureDir(outputDir);
  const scriptPath = path.join(outputDir, `${name}.js`);
  await writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

/**
 * Returns a temp directory path for storing k6 artifacts for a given test.
 */
export function buildArtifactPaths(outputDir: string, name: string) {
  const safe = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const ts = Date.now();
  const dir = path.join(outputDir, `${safe}_${ts}`);
  return {
    artifactDir: dir,
    scriptPath: path.join(dir, 'script.js'),
    jsonOutputPath: path.join(dir, 'output.ndjson'),
    summaryOutputPath: path.join(dir, 'summary.json'),
  };
}

/**
 * Checks whether k6 is available on the system PATH (or at the given binary path).
 */
export function checkK6Available(k6BinaryPath?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const k6 = k6BinaryPath ?? 'k6';
    const proc = spawn(k6, ['version'], { stdio: 'ignore' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Extracts a K6MetricSummary from a K6Summary for a specific metric name,
 * returning a stub with zero values if the metric is not found.
 */
export function extractMetricSummary(
  summary: K6Summary | null,
  metricName: string,
): K6MetricSummary {
  return (
    summary?.metrics[metricName] ?? {
      type: 'trend',
      contains: 'time',
      values: {},
    }
  );
}

/**
 * Converts a duration string like '30s', '2m', '1h' to milliseconds.
 */
export function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  switch (match[2]) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return 0;
  }
}

/** Returns an ISO-formatted duration label from milliseconds */
export function formatDurationLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(2)}h`;
}
