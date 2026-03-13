import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ReportGenerator } from './report-generator';
import type {
  ReportConfig,
  SoakTestResult,
  StressTestResult,
  K6MetricSummary,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sem-report-test-'));
}

const emptyMetricSummary: K6MetricSummary = {
  type: 'trend',
  contains: 'time',
  values: { avg: 100, 'p(95)': 200, 'p(99)': 300 },
};

const stressResult: StressTestResult = {
  name: 'Test Stress',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 120_000,
  stages: [
    {
      stageIndex: 0,
      config: { targetVus: 10, rampUpDuration: '30s', holdDuration: '1m' },
      metrics: {
        windowStart: new Date().toISOString(),
        windowEnd: new Date().toISOString(),
        avgResponseTimeMs: 100,
        p50ResponseTimeMs: 90,
        p95ResponseTimeMs: 200,
        p99ResponseTimeMs: 300,
        minResponseTimeMs: 50,
        maxResponseTimeMs: 500,
        totalRequests: 600,
        requestsPerSecond: 10,
        errorRate: 0.01,
        virtualUsers: 10,
      },
      isBreakingPoint: false,
    },
    {
      stageIndex: 1,
      config: { targetVus: 50, rampUpDuration: '1m', holdDuration: '2m' },
      metrics: {
        windowStart: new Date().toISOString(),
        windowEnd: new Date().toISOString(),
        avgResponseTimeMs: 500,
        p50ResponseTimeMs: 400,
        p95ResponseTimeMs: 5500,
        p99ResponseTimeMs: 8000,
        minResponseTimeMs: 100,
        maxResponseTimeMs: 10_000,
        totalRequests: 200,
        requestsPerSecond: 1.67,
        errorRate: 0.25,
        virtualUsers: 50,
      },
      isBreakingPoint: true,
    },
  ],
  breakingPointStageIndex: 1,
  maxSustainableVus: 10,
  overallMetrics: emptyMetricSummary,
  passed: false,
  summary: 'Breaking point at stage 2 (50 VUs).',
};

const soakResult: SoakTestResult = {
  name: 'Test Soak',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 600_000,
  snapshots: Array.from({ length: 10 }, (_, i) => ({
    timestamp: new Date(Date.now() + i * 60_000).toISOString(),
    elapsedSeconds: i * 60,
    metrics: {
      windowStart: new Date(Date.now() + i * 60_000).toISOString(),
      windowEnd: new Date(Date.now() + (i + 1) * 60_000).toISOString(),
      avgResponseTimeMs: 100 + i * 5,
      p50ResponseTimeMs: 90 + i * 4,
      p95ResponseTimeMs: 200 + i * 20, // gradual increase
      p99ResponseTimeMs: 300 + i * 30,
      minResponseTimeMs: 50,
      maxResponseTimeMs: 500 + i * 50,
      totalRequests: 600,
      requestsPerSecond: 10,
      errorRate: 0.01,
      virtualUsers: 20,
    },
  })),
  degradationPatterns: [
    {
      type: 'response_time_increase',
      detectedAt: new Date().toISOString(),
      elapsedSeconds: 540,
      description: 'p95 increased from 200ms to 380ms (+90%).',
      baselineValue: 200,
      observedValue: 380,
      changePercent: 90,
    },
  ],
  memoryLeakDetected: true,
  overallMetrics: emptyMetricSummary,
  passed: false,
  summary: 'Memory leak detected.',
};

const baseConfig: ReportConfig = {
  title: 'Load Test Report',
  outputDir: '', // filled in per test
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('ReportGenerator — validation', () => {
  const gen = new ReportGenerator();

  it('throws when title is empty', async () => {
    const tmpDir = makeTmpDir();
    await expect(
      gen.generate(stressResult, { title: '', outputDir: tmpDir }),
    ).rejects.toThrow('title is required');
  });

  it('throws when outputDir is empty', async () => {
    await expect(
      gen.generate(stressResult, { title: 'Test', outputDir: '' }),
    ).rejects.toThrow('outputDir is required');
  });
});

// ---------------------------------------------------------------------------
// Stress report generation
// ---------------------------------------------------------------------------

describe('ReportGenerator — stress test report', () => {
  it('creates an HTML file in the output directory', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(stressResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    expect(report.reportPath).toMatch(/\.html$/);
    expect(fs.existsSync(report.reportPath)).toBe(true);
  });

  it('returns correct metadata', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(stressResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    expect(report.title).toBe('Load Test Report');
    expect(report.passed).toBe(false);
    expect(report.generatedAt).toBeTruthy();
    expect(report.charts.length).toBeGreaterThan(0);
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it('uses custom fileName when provided', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(stressResult, {
      ...baseConfig,
      outputDir: tmpDir,
      fileName: 'my-custom-report',
    });

    expect(report.reportPath).toContain('my-custom-report.html');
  });

  it('generates response time, throughput, and error rate charts', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(stressResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    const titles = report.charts.map((c) => c.title);
    expect(titles.some((t) => t.toLowerCase().includes('response time'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('throughput'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('error'))).toBe(true);
  });

  it('HTML includes the chart.js CDN script tag', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(stressResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    const html = fs.readFileSync(report.reportPath, 'utf8');
    expect(html).toContain('chart.js');
    expect(html).toContain('<canvas');
  });

  it('HTML shows FAILED status for a failed test', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(stressResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    const html = fs.readFileSync(report.reportPath, 'utf8');
    expect(html).toContain('FAILED');
  });

  it('HTML shows PASSED status for a passing test', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const passingResult: StressTestResult = {
      ...stressResult,
      passed: true,
      breakingPointStageIndex: null,
      stages: [stressResult.stages[0]],
    };

    const report = await gen.generate(passingResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    const html = fs.readFileSync(report.reportPath, 'utf8');
    expect(html).toContain('PASSED');
  });
});

// ---------------------------------------------------------------------------
// Soak report generation
// ---------------------------------------------------------------------------

describe('ReportGenerator — soak test report', () => {
  it('creates an HTML file for soak test results', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(soakResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    expect(fs.existsSync(report.reportPath)).toBe(true);
  });

  it('HTML includes degradation pattern details', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(soakResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    const html = fs.readFileSync(report.reportPath, 'utf8');
    expect(html).toContain('RESPONSE TIME INCREASE');
  });

  it('charts include elapsed time as x-axis labels', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(soakResult, {
      ...baseConfig,
      outputDir: tmpDir,
    });

    const responseTimeChart = report.charts.find((c) =>
      c.title.toLowerCase().includes('response time over time'),
    );
    expect(responseTimeChart).toBeDefined();
    expect(responseTimeChart!.labels).toHaveLength(soakResult.snapshots.length);
  });

  it('omits raw data table when includeRawData is false', async () => {
    const tmpDir = makeTmpDir();
    const gen = new ReportGenerator();
    const report = await gen.generate(soakResult, {
      ...baseConfig,
      outputDir: tmpDir,
      includeRawData: false,
    });

    const html = fs.readFileSync(report.reportPath, 'utf8');
    expect(html).not.toContain('Raw Data');
  });
});
