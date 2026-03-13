import { NotificationBuilder } from '../notification-builder';
import { SlackClient } from '../slack-client';
import type {
  TestRunResult,
  CriticalBug,
  QualityScoreChange,
  ProjectChannelConfig,
} from '../types';

// Mock SlackClient
jest.mock('../slack-client');

const MockSlackClient = SlackClient as jest.MockedClass<typeof SlackClient>;

const baseConfig: ProjectChannelConfig = {
  projectId: 'proj-1',
  channelId: 'C012AB3CD',
  notifyOnCompletion: true,
  notifyOnCriticalBugs: true,
  notifyOnQualityChange: true,
  qualityChangeThreshold: 5,
};

const baseTestRun: TestRunResult = {
  id: 'run-1',
  projectId: 'proj-1',
  projectName: 'SemkiEst API',
  timestamp: new Date('2024-03-15T10:30:00Z'),
  totalTests: 200,
  passedTests: 190,
  failedTests: 10,
  skippedTests: 0,
  duration: 90000,
  qualityScore: 82,
  dashboardUrl: 'https://app.semkiest.com/runs/run-1',
};

const baseBug: CriticalBug = {
  id: 'bug-1',
  projectId: 'proj-1',
  projectName: 'SemkiEst API',
  title: 'NPE in auth middleware',
  severity: 'critical',
  description: 'Auth middleware NPE on malformed token.',
  testRunId: 'run-1',
  discoveredAt: new Date('2024-03-15T10:31:00Z'),
  dashboardUrl: 'https://app.semkiest.com/bugs/bug-1',
};

const baseQualityChange: QualityScoreChange = {
  projectId: 'proj-1',
  projectName: 'SemkiEst API',
  previousScore: 75,
  currentScore: 82,
  changeAmount: 7,
  changePercent: 9.33,
  timestamp: new Date('2024-03-15T10:32:00Z'),
  dashboardUrl: 'https://app.semkiest.com/projects/proj-1',
};

describe('NotificationBuilder', () => {
  let mockClient: jest.Mocked<SlackClient>;
  let builder: NotificationBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    MockSlackClient.mockImplementation(() => ({
      postBlocks: jest.fn().mockResolvedValue({ ok: true, ts: '123', channel: 'C012AB3CD' }),
      postText: jest.fn().mockResolvedValue({ ok: true }),
      verifyAuth: jest.fn().mockResolvedValue({ userId: 'U1', teamName: 'Test' }),
      listJoinedChannels: jest.fn().mockResolvedValue([]),
    } as unknown as SlackClient));

    mockClient = new MockSlackClient({ botToken: 'xoxb-test' }) as jest.Mocked<SlackClient>;
    builder = new NotificationBuilder(mockClient);
  });

  // ---------------------------------------------------------------------------
  // sendTestRunNotification
  // ---------------------------------------------------------------------------
  describe('sendTestRunNotification', () => {
    it('sends a notification when notifyOnCompletion is true', async () => {
      const result = await builder.sendTestRunNotification(baseTestRun, baseConfig);
      expect(result).not.toBeNull();
      expect(mockClient.postBlocks).toHaveBeenCalledTimes(1);
    });

    it('returns null when notifyOnCompletion is false', async () => {
      const config: ProjectChannelConfig = { ...baseConfig, notifyOnCompletion: false };
      const result = await builder.sendTestRunNotification(baseTestRun, config);
      expect(result).toBeNull();
      expect(mockClient.postBlocks).not.toHaveBeenCalled();
    });

    it('posts to the correct channel', async () => {
      await builder.sendTestRunNotification(baseTestRun, baseConfig);
      expect(mockClient.postBlocks).toHaveBeenCalledWith(
        baseConfig.channelId,
        expect.any(String),
        expect.any(Array),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // sendCriticalBugNotification
  // ---------------------------------------------------------------------------
  describe('sendCriticalBugNotification', () => {
    it('sends a notification for critical severity bugs', async () => {
      const result = await builder.sendCriticalBugNotification(baseBug, baseConfig);
      expect(result).not.toBeNull();
      expect(mockClient.postBlocks).toHaveBeenCalledTimes(1);
    });

    it('sends a notification for high severity bugs', async () => {
      const highBug: CriticalBug = { ...baseBug, severity: 'high' };
      const result = await builder.sendCriticalBugNotification(highBug, baseConfig);
      expect(result).not.toBeNull();
    });

    it('returns null for medium severity bugs', async () => {
      const mediumBug: CriticalBug = { ...baseBug, severity: 'medium' };
      const result = await builder.sendCriticalBugNotification(mediumBug, baseConfig);
      expect(result).toBeNull();
    });

    it('returns null for low severity bugs', async () => {
      const lowBug: CriticalBug = { ...baseBug, severity: 'low' };
      const result = await builder.sendCriticalBugNotification(lowBug, baseConfig);
      expect(result).toBeNull();
    });

    it('returns null when notifyOnCriticalBugs is false', async () => {
      const config: ProjectChannelConfig = { ...baseConfig, notifyOnCriticalBugs: false };
      const result = await builder.sendCriticalBugNotification(baseBug, config);
      expect(result).toBeNull();
      expect(mockClient.postBlocks).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // sendQualityScoreNotification
  // ---------------------------------------------------------------------------
  describe('sendQualityScoreNotification', () => {
    it('sends a notification when change meets threshold', async () => {
      // change is 7, threshold is 5 → should send
      const result = await builder.sendQualityScoreNotification(
        baseQualityChange,
        baseConfig,
      );
      expect(result).not.toBeNull();
      expect(mockClient.postBlocks).toHaveBeenCalledTimes(1);
    });

    it('returns null when change is below threshold', async () => {
      const smallChange: QualityScoreChange = {
        ...baseQualityChange,
        changeAmount: 3,
        changePercent: 4,
      };
      const result = await builder.sendQualityScoreNotification(
        smallChange,
        baseConfig,
      );
      expect(result).toBeNull();
    });

    it('sends notification for negative changes meeting threshold', async () => {
      const decline: QualityScoreChange = {
        ...baseQualityChange,
        changeAmount: -8,
        changePercent: -10,
      };
      const result = await builder.sendQualityScoreNotification(decline, baseConfig);
      expect(result).not.toBeNull();
    });

    it('returns null when notifyOnQualityChange is false', async () => {
      const config: ProjectChannelConfig = { ...baseConfig, notifyOnQualityChange: false };
      const result = await builder.sendQualityScoreNotification(
        baseQualityChange,
        config,
      );
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // sendTestRunSummary
  // ---------------------------------------------------------------------------
  describe('sendTestRunSummary', () => {
    it('sends test run, bugs, and quality change notifications', async () => {
      const result = await builder.sendTestRunSummary(
        baseTestRun,
        baseConfig,
        [baseBug],
        baseQualityChange,
      );

      expect(result.testRun).not.toBeNull();
      expect(result.bugs).toHaveLength(1);
      expect(result.qualityChange).not.toBeNull();
      // postBlocks called 3 times total
      expect(mockClient.postBlocks).toHaveBeenCalledTimes(3);
    });

    it('returns null for qualityChange when none is provided', async () => {
      const result = await builder.sendTestRunSummary(
        baseTestRun,
        baseConfig,
        [],
        undefined,
      );

      expect(result.qualityChange).toBeNull();
    });

    it('returns empty bugs array when no bugs are provided', async () => {
      const result = await builder.sendTestRunSummary(
        baseTestRun,
        baseConfig,
      );

      expect(result.bugs).toHaveLength(0);
    });
  });
});
