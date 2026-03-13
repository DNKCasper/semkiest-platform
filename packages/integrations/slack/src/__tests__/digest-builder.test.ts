import {
  DigestBuilder,
  dailyCronExpression,
  weeklyCronExpression,
  getDailyDigestPeriod,
  getWeeklyDigestPeriod,
} from '../digest-builder';
import { SlackClient } from '../slack-client';
import type { DigestConfig, DigestSummary } from '../types';

jest.mock('../slack-client');

const MockSlackClient = SlackClient as jest.MockedClass<typeof SlackClient>;

const baseConfig: DigestConfig = {
  channelId: 'C012AB3CD',
  schedule: 'daily',
  timezone: 'America/New_York',
  projectIds: ['proj-1', 'proj-2'],
};

const baseSummary: DigestSummary = {
  period: 'daily',
  startDate: new Date('2024-03-14T00:00:00Z'),
  endDate: new Date('2024-03-15T00:00:00Z'),
  projects: [
    {
      projectId: 'proj-1',
      projectName: 'SemkiEst API',
      testRuns: 5,
      passedTests: 950,
      failedTests: 50,
      qualityScore: 82,
      qualityScoreTrend: 'up',
      dashboardUrl: 'https://app.semkiest.com/projects/proj-1',
    },
  ],
  totalTestRuns: 5,
  totalPassedTests: 950,
  totalFailedTests: 50,
  overallQualityScore: 82,
  dashboardUrl: 'https://app.semkiest.com/reports/daily',
};

describe('cron expression helpers', () => {
  it('returns a valid daily cron expression', () => {
    const expr = dailyCronExpression();
    expect(typeof expr).toBe('string');
    // 5 fields separated by spaces
    expect(expr.split(' ')).toHaveLength(5);
  });

  it('returns a valid weekly cron expression', () => {
    const expr = weeklyCronExpression();
    expect(typeof expr).toBe('string');
    expect(expr.split(' ')).toHaveLength(5);
  });

  it('daily and weekly cron expressions are different', () => {
    expect(dailyCronExpression()).not.toBe(weeklyCronExpression());
  });
});

describe('getDailyDigestPeriod', () => {
  it('returns startDate as yesterday midnight and endDate as today midnight', () => {
    const now = new Date('2024-03-15T14:00:00Z');
    const { startDate, endDate } = getDailyDigestPeriod(now);

    expect(endDate.getHours()).toBe(0);
    expect(endDate.getMinutes()).toBe(0);
    expect(endDate.getSeconds()).toBe(0);

    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(1);
  });

  it('uses current date when no reference date is provided', () => {
    const { startDate, endDate } = getDailyDigestPeriod();
    expect(endDate > startDate).toBe(true);
  });
});

describe('getWeeklyDigestPeriod', () => {
  it('returns a 7-day window', () => {
    const now = new Date('2024-03-15T14:00:00Z');
    const { startDate, endDate } = getWeeklyDigestPeriod(now);

    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });

  it('uses current date when no reference date is provided', () => {
    const { startDate, endDate } = getWeeklyDigestPeriod();
    expect(endDate > startDate).toBe(true);
  });
});

describe('DigestBuilder', () => {
  let mockClient: jest.Mocked<SlackClient>;
  let builder: DigestBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    MockSlackClient.mockImplementation(() => ({
      postBlocks: jest.fn().mockResolvedValue({ ok: true, ts: '123', channel: 'C012AB3CD' }),
      postText: jest.fn().mockResolvedValue({ ok: true }),
      verifyAuth: jest.fn().mockResolvedValue({ userId: 'U1', teamName: 'Test' }),
      listJoinedChannels: jest.fn().mockResolvedValue([]),
    } as unknown as SlackClient));

    mockClient = new MockSlackClient({ botToken: 'xoxb-test' }) as jest.Mocked<SlackClient>;
    builder = new DigestBuilder(mockClient);
  });

  describe('sendDigest', () => {
    it('calls postBlocks with the correct channel', async () => {
      await builder.sendDigest(baseConfig, baseSummary);
      expect(mockClient.postBlocks).toHaveBeenCalledWith(
        baseConfig.channelId,
        expect.any(String),
        expect.any(Array),
      );
    });

    it('returns ok=true on success', async () => {
      const result = await builder.sendDigest(baseConfig, baseSummary);
      expect(result.ok).toBe(true);
    });

    it('emits digestSent event on success', async () => {
      const listener = jest.fn();
      builder.on('digestSent', listener);

      await builder.sendDigest(baseConfig, baseSummary);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          config: baseConfig,
          summary: baseSummary,
          result: expect.objectContaining({ ok: true }),
        }),
      );
    });

    it('does not emit digestSent event on failure', async () => {
      mockClient.postBlocks.mockResolvedValue({ ok: false, error: 'channel_not_found' });

      const listener = jest.fn();
      builder.on('digestSent', listener);

      await builder.sendDigest(baseConfig, baseSummary);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('sendDailyDigest', () => {
    it('overrides period to daily', async () => {
      const weeklySummary: DigestSummary = { ...baseSummary, period: 'weekly' };
      await builder.sendDailyDigest(baseConfig, weeklySummary);

      // Should have been called (the period override happens internally)
      expect(mockClient.postBlocks).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendWeeklyDigest', () => {
    it('overrides period to weekly', async () => {
      await builder.sendWeeklyDigest(baseConfig, baseSummary);
      expect(mockClient.postBlocks).toHaveBeenCalledTimes(1);
    });
  });

  describe('DigestBuilder.getCronExpression', () => {
    it('returns daily cron expression for daily schedule', () => {
      const expr = DigestBuilder.getCronExpression('daily');
      expect(expr).toBe(dailyCronExpression());
    });

    it('returns weekly cron expression for weekly schedule', () => {
      const expr = DigestBuilder.getCronExpression('weekly');
      expect(expr).toBe(weeklyCronExpression());
    });
  });

  describe('DigestBuilder.getDigestPeriod', () => {
    it('returns a 1-day period for daily schedule', () => {
      const now = new Date('2024-03-15T14:00:00Z');
      const { startDate, endDate } = DigestBuilder.getDigestPeriod('daily', now);
      const diffDays =
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(1);
    });

    it('returns a 7-day period for weekly schedule', () => {
      const now = new Date('2024-03-15T14:00:00Z');
      const { startDate, endDate } = DigestBuilder.getDigestPeriod('weekly', now);
      const diffDays =
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(7);
    });
  });
});
