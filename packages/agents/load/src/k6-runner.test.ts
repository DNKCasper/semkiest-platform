import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  aggregateMetrics,
  buildArtifactPaths,
  filterByTimeWindow,
  formatDurationLabel,
  generateK6Script,
  parseDurationMs,
} from './k6-runner';
import type { K6DataPoint } from './types';

// ---------------------------------------------------------------------------
// parseDurationMs
// ---------------------------------------------------------------------------

describe('parseDurationMs', () => {
  it('parses milliseconds', () => {
    expect(parseDurationMs('500ms')).toBe(500);
  });

  it('parses seconds', () => {
    expect(parseDurationMs('30s')).toBe(30_000);
    expect(parseDurationMs('1s')).toBe(1_000);
  });

  it('parses minutes', () => {
    expect(parseDurationMs('2m')).toBe(120_000);
  });

  it('parses hours', () => {
    expect(parseDurationMs('1h')).toBe(3_600_000);
  });

  it('parses decimal values', () => {
    expect(parseDurationMs('1.5m')).toBe(90_000);
  });

  it('returns 0 for invalid input', () => {
    expect(parseDurationMs('')).toBe(0);
    expect(parseDurationMs('abc')).toBe(0);
    expect(parseDurationMs('5x')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatDurationLabel
// ---------------------------------------------------------------------------

describe('formatDurationLabel', () => {
  it('formats sub-second durations', () => {
    expect(formatDurationLabel(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDurationLabel(5_000)).toBe('5.0s');
  });

  it('formats minutes', () => {
    expect(formatDurationLabel(90_000)).toBe('1.5m');
  });

  it('formats hours', () => {
    expect(formatDurationLabel(7_200_000)).toBe('2.00h');
  });
});

// ---------------------------------------------------------------------------
// generateK6Script
// ---------------------------------------------------------------------------

describe('generateK6Script', () => {
  it('generates a valid script with stages and thresholds', () => {
    const script = generateK6Script({
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 20 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<2000'],
        errors: ['rate<0.1'],
      },
      endpoints: [
        { url: 'http://localhost:3000/api/health', method: 'GET' },
      ],
    });

    expect(script).toContain("import http from 'k6/http'");
    expect(script).toContain('export const options');
    expect(script).toContain('export default function');
    expect(script).toContain('http://localhost:3000/api/health');
    expect(script).toContain('"target": 10');
    expect(script).toContain('"target": 20');
    expect(script).toContain('p(95)<2000');
  });

  it('handles POST endpoints with body', () => {
    const script = generateK6Script({
      stages: [{ duration: '10s', target: 1 }],
      thresholds: {
        http_req_duration: ['p(95)<2000'],
        errors: ['rate<0.1'],
      },
      endpoints: [
        {
          url: 'http://localhost:3000/api/users',
          method: 'POST',
          body: '{"name":"test"}',
          headers: { 'Content-Type': 'application/json' },
        },
      ],
    });

    expect(script).toContain('http.post(');
    expect(script).toContain('application/json');
  });

  it('includes error rate tracking', () => {
    const script = generateK6Script({
      stages: [{ duration: '10s', target: 1 }],
      thresholds: {
        http_req_duration: ['p(95)<2000'],
        errors: ['rate<0.1'],
      },
      endpoints: [{ url: 'http://localhost:3000/' }],
    });

    expect(script).toContain('errorRate');
    expect(script).toContain('successCounter');
  });

  it('generates check statements for each endpoint', () => {
    const script = generateK6Script({
      stages: [{ duration: '10s', target: 1 }],
      thresholds: {
        http_req_duration: ['p(95)<2000'],
        errors: ['rate<0.1'],
      },
      endpoints: [
        { url: 'http://localhost:3000/a' },
        { url: 'http://localhost:3000/b' },
      ],
    });

    expect(script).toContain('status_2xx_0');
    expect(script).toContain('status_2xx_1');
  });
});

// ---------------------------------------------------------------------------
// filterByTimeWindow
// ---------------------------------------------------------------------------

describe('filterByTimeWindow', () => {
  const makePoint = (
    time: string,
    value: number,
  ): K6DataPoint => ({
    type: 'Point',
    metric: 'http_req_duration',
    data: { time, value, tags: {} },
  });

  it('returns only points within the window', () => {
    const points = [
      makePoint('2024-01-01T00:00:00Z', 100),
      makePoint('2024-01-01T00:01:00Z', 200),
      makePoint('2024-01-01T00:02:00Z', 300),
      makePoint('2024-01-01T00:03:00Z', 400),
    ];

    const start = new Date('2024-01-01T00:01:00Z');
    const end = new Date('2024-01-01T00:02:00Z');
    const result = filterByTimeWindow(points, start, end);

    expect(result).toHaveLength(2);
    expect(result[0].data.value).toBe(200);
    expect(result[1].data.value).toBe(300);
  });

  it('returns empty array when no points match', () => {
    const points = [makePoint('2024-01-01T00:00:00Z', 100)];
    const result = filterByTimeWindow(
      points,
      new Date('2024-01-02T00:00:00Z'),
      new Date('2024-01-03T00:00:00Z'),
    );
    expect(result).toHaveLength(0);
  });

  it('is inclusive of start and end boundaries', () => {
    const t = '2024-01-01T00:01:00Z';
    const points = [makePoint(t, 100)];
    const d = new Date(t);
    const result = filterByTimeWindow(points, d, d);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// aggregateMetrics
// ---------------------------------------------------------------------------

describe('aggregateMetrics', () => {
  const makePoint = (
    time: string,
    value: number,
    metric = 'http_req_duration',
  ): K6DataPoint => ({
    type: 'Point',
    metric,
    data: { time, value, tags: {} },
  });

  it('computes correct percentiles and averages', () => {
    // 10 points: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
    const base = '2024-01-01T00:00:';
    const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(
      (v, i) => makePoint(`${base}${String(i).padStart(2, '0')}Z`, v),
    );

    const metrics = aggregateMetrics({
      windowStart: `${base}00Z`,
      windowEnd: `${base}09Z`,
      durationPoints: durations,
      failedPoints: [],
      reqsPoints: durations.map((p) => ({ ...p, metric: 'http_reqs', data: { ...p.data, value: 1 } })),
      vusPoints: [makePoint(`${base}09Z`, 5, 'vus')],
      windowDurationSeconds: 10,
    });

    expect(metrics.avgResponseTimeMs).toBeCloseTo(55, 0);
    expect(metrics.p50ResponseTimeMs).toBe(50);
    // p95 of [10,20,...,100]: ceil(0.95*10)-1 = index 9 → value 100
    expect(metrics.p95ResponseTimeMs).toBe(100);
    expect(metrics.p99ResponseTimeMs).toBe(100);
    expect(metrics.minResponseTimeMs).toBe(10);
    expect(metrics.maxResponseTimeMs).toBe(100);
    expect(metrics.totalRequests).toBe(10);
    expect(metrics.requestsPerSecond).toBe(1); // 10 reqs / 10s
    expect(metrics.errorRate).toBe(0);
    expect(metrics.virtualUsers).toBe(5);
  });

  it('computes error rate from failed points', () => {
    const base = '2024-01-01T00:00:00Z';
    const makeReq = (v: number) => makePoint(base, v, 'http_reqs');
    const makeFail = (v: number) => makePoint(base, v, 'http_req_failed');

    const metrics = aggregateMetrics({
      windowStart: base,
      windowEnd: base,
      durationPoints: [makePoint(base, 100)],
      failedPoints: [makeFail(1), makeFail(1), makeFail(0), makeFail(0), makeFail(0)],
      reqsPoints: [makeReq(1), makeReq(1), makeReq(1), makeReq(1), makeReq(1)],
      vusPoints: [],
      windowDurationSeconds: 5,
    });

    // 2 out of 5 failed
    expect(metrics.errorRate).toBeCloseTo(0.4, 1);
  });

  it('handles empty data gracefully', () => {
    const metrics = aggregateMetrics({
      windowStart: '2024-01-01T00:00:00Z',
      windowEnd: '2024-01-01T00:01:00Z',
      durationPoints: [],
      failedPoints: [],
      reqsPoints: [],
      vusPoints: [],
      windowDurationSeconds: 60,
    });

    expect(metrics.avgResponseTimeMs).toBe(0);
    expect(metrics.p95ResponseTimeMs).toBe(0);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.requestsPerSecond).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildArtifactPaths
// ---------------------------------------------------------------------------

describe('buildArtifactPaths', () => {
  it('returns expected paths under outputDir', () => {
    const paths = buildArtifactPaths('/tmp/output', 'My Test');
    expect(paths.scriptPath).toContain('/tmp/output/');
    expect(paths.scriptPath).toContain('script.js');
    expect(paths.jsonOutputPath).toContain('output.ndjson');
    expect(paths.summaryOutputPath).toContain('summary.json');
    expect(paths.artifactDir).toContain('my_test');
  });

  it('sanitizes special characters in name', () => {
    const paths = buildArtifactPaths('/tmp/output', 'My Test: Special/Chars!');
    // Only check the basename (the directory name itself), not the full path
    const basename = path.basename(paths.artifactDir);
    expect(basename).not.toMatch(/[:/!]/);
  });
});
