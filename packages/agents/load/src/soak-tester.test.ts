import { SoakTester } from './soak-tester';
import type { SoakTestConfig } from './types';
import * as k6Runner from './k6-runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validConfig: SoakTestConfig = {
  name: 'Soak Test Run',
  endpoints: [{ url: 'http://localhost:3000/api/health' }],
  virtualUsers: 20,
  rampUpDuration: '1m',
  holdDuration: '10m',
  rampDownDuration: '30s',
  snapshotIntervalSeconds: 60,
  degradationThresholdPercent: 20,
  thresholds: {
    maxP95ResponseTimeMs: 2000,
    maxP99ResponseTimeMs: 5000,
    maxErrorRate: 0.05,
    minThroughputRps: 1,
  },
  outputDir: '/tmp/test-output',
};

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe('SoakTester — validation', () => {
  const tester = new SoakTester();

  it('throws when name is empty', async () => {
    await expect(
      tester.run({ ...validConfig, name: '' }),
    ).rejects.toThrow('name is required');
  });

  it('throws when endpoints array is empty', async () => {
    await expect(
      tester.run({ ...validConfig, endpoints: [] }),
    ).rejects.toThrow('endpoints must have at least one entry');
  });

  it('throws when virtualUsers is zero', async () => {
    await expect(
      tester.run({ ...validConfig, virtualUsers: 0 }),
    ).rejects.toThrow('virtualUsers must be greater than 0');
  });

  it('throws when rampUpDuration is missing', async () => {
    await expect(
      tester.run({ ...validConfig, rampUpDuration: '' }),
    ).rejects.toThrow('rampUpDuration is required');
  });

  it('throws when holdDuration is missing', async () => {
    await expect(
      tester.run({ ...validConfig, holdDuration: '' }),
    ).rejects.toThrow('holdDuration is required');
  });

  it('throws when rampDownDuration is missing', async () => {
    await expect(
      tester.run({ ...validConfig, rampDownDuration: '' }),
    ).rejects.toThrow('rampDownDuration is required');
  });

  it('throws when snapshotIntervalSeconds is zero', async () => {
    await expect(
      tester.run({ ...validConfig, snapshotIntervalSeconds: 0 }),
    ).rejects.toThrow('snapshotIntervalSeconds must be greater than 0');
  });

  it('throws when degradationThresholdPercent is out of range', async () => {
    await expect(
      tester.run({ ...validConfig, degradationThresholdPercent: 150 }),
    ).rejects.toThrow('between 0 and 100');
  });
});

// ---------------------------------------------------------------------------
// k6 availability check
// ---------------------------------------------------------------------------

describe('SoakTester — k6 not available', () => {
  it('throws when k6 is not installed', async () => {
    jest
      .spyOn(k6Runner, 'checkK6Available')
      .mockResolvedValueOnce(false);

    const tester = new SoakTester();
    await expect(tester.run(validConfig)).rejects.toThrow(
      'k6 is not installed',
    );

    jest.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Full run simulation (all k6 I/O mocked)
// ---------------------------------------------------------------------------

describe('SoakTester — run (mocked k6)', () => {
  beforeEach(() => {
    jest.spyOn(k6Runner, 'checkK6Available').mockResolvedValue(true);
    jest.spyOn(k6Runner, 'ensureDir').mockResolvedValue(undefined);
    jest.spyOn(k6Runner, 'writeK6Script').mockResolvedValue('/tmp/script.js');
    jest.spyOn(k6Runner, 'runK6').mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    jest.spyOn(k6Runner, 'readAllK6DataPoints').mockResolvedValue(new Map());
    jest.spyOn(k6Runner, 'readK6Summary').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a result with correct structure', async () => {
    const tester = new SoakTester();
    const result = await tester.run(validConfig);

    expect(result.name).toBe(validConfig.name);
    expect(Array.isArray(result.snapshots)).toBe(true);
    expect(Array.isArray(result.degradationPatterns)).toBe(true);
    expect(typeof result.memoryLeakDetected).toBe('boolean');
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.summary).toBe('string');
    expect(result.startedAt).toBeTruthy();
    expect(result.finishedAt).toBeTruthy();
  });

  it('passes when no degradation patterns are found', async () => {
    const tester = new SoakTester();
    const result = await tester.run(validConfig);

    expect(result.degradationPatterns).toHaveLength(0);
    expect(result.passed).toBe(true);
    expect(result.memoryLeakDetected).toBe(false);
  });

  it('includes a non-empty summary string', async () => {
    const tester = new SoakTester();
    const result = await tester.run(validConfig);

    expect(result.summary.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Degradation detection (unit tests on the private logic via a real run)
// ---------------------------------------------------------------------------

describe('SoakTester — degradation detection', () => {
  beforeEach(() => {
    jest.spyOn(k6Runner, 'checkK6Available').mockResolvedValue(true);
    jest.spyOn(k6Runner, 'ensureDir').mockResolvedValue(undefined);
    jest.spyOn(k6Runner, 'writeK6Script').mockResolvedValue('/tmp/script.js');
    jest.spyOn(k6Runner, 'readAllK6DataPoints').mockResolvedValue(new Map());
    jest.spyOn(k6Runner, 'readK6Summary').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('detects error rate spike', async () => {
    // Simulate k6 exit code 1 (threshold violated) + provide mock data later
    jest.spyOn(k6Runner, 'runK6').mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'thresholds exceeded',
    });

    // Build snapshots with an error rate spike in the second snapshot by
    // mocking aggregateMetrics
    const aggSpy = jest.spyOn(k6Runner, 'aggregateMetrics');
    let callCount = 0;
    aggSpy.mockImplementation((params) => {
      callCount++;
      const errorRate = callCount === 2 ? 0.2 : 0.01; // spike at snapshot 2
      return {
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        avgResponseTimeMs: 100,
        p50ResponseTimeMs: 90,
        p95ResponseTimeMs: 200,
        p99ResponseTimeMs: 300,
        minResponseTimeMs: 50,
        maxResponseTimeMs: 500,
        totalRequests: 100,
        requestsPerSecond: 10,
        errorRate,
        virtualUsers: 20,
      };
    });

    const tester = new SoakTester();
    // Use a short hold duration so snapshots are generated
    const result = await tester.run({
      ...validConfig,
      holdDuration: '2m',
      snapshotIntervalSeconds: 30,
    });

    const errorSpike = result.degradationPatterns.find(
      (p) => p.type === 'error_rate_spike',
    );
    expect(errorSpike).toBeDefined();
    expect(result.passed).toBe(false);
  });

  it('detects response time increase', async () => {
    jest.spyOn(k6Runner, 'runK6').mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    const aggSpy = jest.spyOn(k6Runner, 'aggregateMetrics');
    let callCount = 0;
    aggSpy.mockImplementation((params) => {
      callCount++;
      // Baseline p95 = 100ms; last snapshot = 200ms (+100% > 20% threshold)
      const p95ResponseTimeMs = callCount === 1 ? 100 : 200;
      return {
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        avgResponseTimeMs: p95ResponseTimeMs * 0.8,
        p50ResponseTimeMs: p95ResponseTimeMs * 0.7,
        p95ResponseTimeMs,
        p99ResponseTimeMs: p95ResponseTimeMs * 1.2,
        minResponseTimeMs: 50,
        maxResponseTimeMs: p95ResponseTimeMs * 1.5,
        totalRequests: 100,
        requestsPerSecond: 10,
        errorRate: 0.01,
        virtualUsers: 20,
      };
    });

    const tester = new SoakTester();
    const result = await tester.run({
      ...validConfig,
      holdDuration: '2m',
      snapshotIntervalSeconds: 30,
    });

    const responseTimeIncrease = result.degradationPatterns.find(
      (p) =>
        p.type === 'response_time_increase' ||
        p.type === 'memory_leak_indicator',
    );
    expect(responseTimeIncrease).toBeDefined();
  });
});
