import { StressTester } from './stress-tester';
import type { StressTestConfig } from './types';
import * as k6Runner from './k6-runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validConfig: StressTestConfig = {
  name: 'Test Stress Run',
  endpoints: [{ url: 'http://localhost:3000/api/health' }],
  stages: [
    { targetVus: 10, rampUpDuration: '10s', holdDuration: '30s' },
    { targetVus: 20, rampUpDuration: '10s', holdDuration: '30s' },
    { targetVus: 50, rampUpDuration: '10s', holdDuration: '30s' },
  ],
  thresholds: {
    maxP95ResponseTimeMs: 2000,
    maxP99ResponseTimeMs: 5000,
    maxErrorRate: 0.05,
    minThroughputRps: 1,
  },
  outputDir: '/tmp/test-output',
  breakingPointErrorRateThreshold: 0.1,
  breakingPointLatencyMs: 5000,
};

// ---------------------------------------------------------------------------
// Validation tests (these don't need k6 installed)
// ---------------------------------------------------------------------------

describe('StressTester — validation', () => {
  const tester = new StressTester();

  // Mock k6 availability check so it fails immediately on invalid config
  // without trying to actually run k6
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

  it('throws when stages array is empty', async () => {
    await expect(
      tester.run({ ...validConfig, stages: [] }),
    ).rejects.toThrow('stages must have at least one entry');
  });

  it('throws when targetVus is zero', async () => {
    await expect(
      tester.run({
        ...validConfig,
        stages: [{ targetVus: 0, rampUpDuration: '10s', holdDuration: '30s' }],
      }),
    ).rejects.toThrow('targetVus must be greater than 0');
  });

  it('throws when breakingPointErrorRateThreshold is out of range', async () => {
    await expect(
      tester.run({
        ...validConfig,
        breakingPointErrorRateThreshold: 1.5,
      }),
    ).rejects.toThrow('between 0 and 1');
  });

  it('throws when rampUpDuration is missing', async () => {
    await expect(
      tester.run({
        ...validConfig,
        stages: [{ targetVus: 10, rampUpDuration: '', holdDuration: '30s' }],
      }),
    ).rejects.toThrow('rampUpDuration is required');
  });
});

// ---------------------------------------------------------------------------
// k6 availability check
// ---------------------------------------------------------------------------

describe('StressTester — k6 not available', () => {
  it('throws when k6 is not installed', async () => {
    jest
      .spyOn(k6Runner, 'checkK6Available')
      .mockResolvedValueOnce(false);

    const tester = new StressTester();
    await expect(tester.run(validConfig)).rejects.toThrow(
      'k6 is not installed',
    );

    jest.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Full run simulation (all k6 I/O mocked)
// ---------------------------------------------------------------------------

describe('StressTester — run (mocked k6)', () => {
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

  it('returns a result with the correct number of stages', async () => {
    const tester = new StressTester();
    const result = await tester.run(validConfig);

    expect(result.stages).toHaveLength(validConfig.stages.length);
    expect(result.name).toBe(validConfig.name);
    expect(result.startedAt).toBeTruthy();
    expect(result.finishedAt).toBeTruthy();
  });

  it('marks no breaking point when all stages pass', async () => {
    const tester = new StressTester();
    const result = await tester.run(validConfig);

    expect(result.breakingPointStageIndex).toBeNull();
    expect(result.passed).toBe(true);
  });

  it('detects breaking point when error rate exceeds threshold', async () => {
    // Simulate stage 2 (index 1) having 50% error rate
    jest.spyOn(k6Runner, 'aggregateMetrics').mockImplementation((params) => {
      const windowStart = params.windowStart;
      // Determine which stage by window start order — use a flag on call count
      return {
        windowStart,
        windowEnd: params.windowEnd,
        avgResponseTimeMs: 100,
        p50ResponseTimeMs: 90,
        p95ResponseTimeMs: 200,
        p99ResponseTimeMs: 300,
        minResponseTimeMs: 50,
        maxResponseTimeMs: 500,
        totalRequests: 100,
        requestsPerSecond: 10,
        errorRate: 0, // all fine
        virtualUsers: 10,
      };
    });

    // Override for stage at index 1 — error rate over threshold
    const aggSpy = jest.spyOn(k6Runner, 'aggregateMetrics');
    let callCount = 0;
    aggSpy.mockImplementation((params) => {
      callCount++;
      const errorRate = callCount === 2 ? 0.5 : 0.01; // stage 2 breaks
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
        virtualUsers: validConfig.stages[callCount - 1]?.targetVus ?? 10,
      };
    });

    const tester = new StressTester();
    const result = await tester.run(validConfig);

    expect(result.breakingPointStageIndex).toBe(1);
    expect(result.stages[1].isBreakingPoint).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('detects breaking point when p95 latency exceeds threshold', async () => {
    const aggSpy = jest.spyOn(k6Runner, 'aggregateMetrics');
    let callCount = 0;
    aggSpy.mockImplementation((params) => {
      callCount++;
      const p95ResponseTimeMs = callCount === 3 ? 6000 : 500; // stage 3 breaks
      return {
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        avgResponseTimeMs: 100,
        p50ResponseTimeMs: 200,
        p95ResponseTimeMs,
        p99ResponseTimeMs: 300,
        minResponseTimeMs: 50,
        maxResponseTimeMs: 800,
        totalRequests: 100,
        requestsPerSecond: 10,
        errorRate: 0.01,
        virtualUsers: 10,
      };
    });

    const tester = new StressTester();
    const result = await tester.run(validConfig);

    expect(result.breakingPointStageIndex).toBe(2);
    expect(result.stages[2].isBreakingPoint).toBe(true);
  });

  it('includes a non-empty summary string', async () => {
    const tester = new StressTester();
    const result = await tester.run(validConfig);

    expect(result.summary).toBeTruthy();
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it('sets maxSustainableVus to last stage VUs when no breaking point', async () => {
    const tester = new StressTester();
    const result = await tester.run(validConfig);

    const lastStageVus =
      validConfig.stages[validConfig.stages.length - 1].targetVus;
    expect(result.maxSustainableVus).toBe(lastStageVus);
  });
});
