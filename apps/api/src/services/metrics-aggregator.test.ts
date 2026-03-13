import {
  toLocalDateString,
  parseLocalDateString,
  applyRetentionPolicy,
} from './metrics-aggregator';

// ─── toLocalDateString ────────────────────────────────────────────────────────

describe('toLocalDateString', () => {
  it('returns correct UTC date string', () => {
    const date = new Date('2024-03-15T12:00:00Z');
    expect(toLocalDateString(date, 'UTC')).toBe('2024-03-15');
  });

  it('converts UTC date to New York date when crossing midnight', () => {
    // 2024-03-15 23:00 UTC = 2024-03-15 19:00 ET (UTC-4 DST)
    const date = new Date('2024-03-15T23:00:00Z');
    expect(toLocalDateString(date, 'America/New_York')).toBe('2024-03-15');
  });

  it('converts to next day in UTC+12 timezone', () => {
    // 2024-03-15 14:00 UTC = 2024-03-16 02:00 in Pacific/Auckland (UTC+13 in NZ summer)
    const date = new Date('2024-03-15T14:00:00Z');
    const result = toLocalDateString(date, 'Pacific/Auckland');
    // 14:00 UTC + 13 hours = 03:00 next day
    expect(result).toBe('2024-03-16');
  });

  it('falls back to UTC date string for invalid timezone', () => {
    const date = new Date('2024-03-15T12:00:00Z');
    const result = toLocalDateString(date, 'Invalid/Timezone');
    expect(result).toBe('2024-03-15');
  });

  it('returns correct date for UTC+5:30 (India) timezone', () => {
    // 2024-01-01 00:00 UTC = 2024-01-01 05:30 IST — same calendar day
    const date = new Date('2024-01-01T00:00:00Z');
    expect(toLocalDateString(date, 'Asia/Kolkata')).toBe('2024-01-01');
  });

  it('returns previous day for UTC-8 timezone when time is 01:00 UTC', () => {
    // 2024-03-15 01:00 UTC = 2024-03-14 17:00 PST (UTC-8)
    const date = new Date('2024-03-15T01:00:00Z');
    expect(toLocalDateString(date, 'America/Los_Angeles')).toBe('2024-03-14');
  });
});

// ─── parseLocalDateString ─────────────────────────────────────────────────────

describe('parseLocalDateString', () => {
  it('parses a YYYY-MM-DD string to UTC midnight', () => {
    const date = parseLocalDateString('2024-03-15');
    expect(date.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('round-trips through toLocalDateString for UTC', () => {
    const original = new Date('2024-06-21T00:00:00Z');
    const str = toLocalDateString(original, 'UTC');
    const parsed = parseLocalDateString(str);
    expect(parsed.toISOString()).toBe(original.toISOString());
  });
});

// ─── applyRetentionPolicy ─────────────────────────────────────────────────────

// Mock Prisma for retention tests
jest.mock('@semkiest/db', () => ({
  __esModule: true,
  default: {
    testRun: {
      deleteMany: jest.fn(),
    },
    dailyQualityMetric: {
      deleteMany: jest.fn(),
    },
  },
}));

import prisma from '@semkiest/db';

describe('applyRetentionPolicy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes raw runs older than 90 days', async () => {
    (prisma.testRun.deleteMany as jest.Mock).mockResolvedValue({ count: 42 });
    (prisma.dailyQualityMetric.deleteMany as jest.Mock).mockResolvedValue({ count: 7 });

    const now = new Date('2024-04-01T00:00:00Z');
    const result = await applyRetentionPolicy(now);

    expect(result.rawRunsDeleted).toBe(42);
    expect(result.aggregatedMetricsDeleted).toBe(7);

    const rawCall = (prisma.testRun.deleteMany as jest.Mock).mock.calls[0][0] as {
      where: { runAt: { lt: Date } };
    };
    const rawCutoff = rawCall.where.runAt.lt;
    // Cutoff should be 90 days before 2024-04-01
    expect(rawCutoff.toISOString()).toBe('2024-01-02T00:00:00.000Z');
  });

  it('deletes aggregated metrics older than 730 days', async () => {
    (prisma.testRun.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.dailyQualityMetric.deleteMany as jest.Mock).mockResolvedValue({ count: 15 });

    const now = new Date('2026-01-01T00:00:00Z');
    await applyRetentionPolicy(now);

    const aggCall = (prisma.dailyQualityMetric.deleteMany as jest.Mock).mock.calls[0][0] as {
      where: { metricDate: { lt: Date } };
    };
    const aggCutoff = aggCall.where.metricDate.lt;
    // 730 days before 2026-01-01 = 2024-01-02
    expect(aggCutoff.toISOString()).toBe('2024-01-02T00:00:00.000Z');
  });
});
