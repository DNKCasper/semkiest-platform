import { LeaderboardService, type LeaderboardQuery } from '../leaderboard-service';
import type { PrismaClient } from '@prisma/client';

// ─── Mock PrismaClient ────────────────────────────────────────────────────────

const makeDbMock = () => ({
  scoringConfig: {
    findUnique: jest.fn().mockResolvedValue(null), // return null => use DEFAULT_WEIGHTS
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  project: {
    findMany: jest.fn(),
  },
  qualityScore: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
});

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const PROJ_A = '00000000-0000-0000-0000-000000000010';
const PROJ_B = '00000000-0000-0000-0000-000000000011';

const makeProjectWithScore = (
  id: string,
  name: string,
  score: number,
  trend: string,
  team: string | null = null,
) => ({
  id,
  name,
  team,
  organizationId: ORG_ID,
  qualityScores: [
    {
      id: `score-${id}`,
      projectId: id,
      score,
      trend,
      badge: score >= 95 ? 'excellent' : score >= 85 ? 'good' : score >= 70 ? 'needs_attention' : 'critical',
      functionalPassRate: score,
      visualPassRate: null,
      performancePassRate: null,
      accessibilityPassRate: null,
      securityPassRate: null,
      apiPassRate: null,
      calculatedAt: new Date('2024-06-01'),
    },
  ],
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeaderboardService', () => {
  let db: ReturnType<typeof makeDbMock>;
  let service: LeaderboardService;
  const baseQuery: LeaderboardQuery = {
    organizationId: ORG_ID,
    page: 1,
    pageSize: 20,
  };

  beforeEach(() => {
    db = makeDbMock();
    service = new LeaderboardService(db as unknown as PrismaClient);
  });

  // ─── getLeaderboard ────────────────────────────────────────────────────────

  describe('getLeaderboard', () => {
    it('returns an empty leaderboard when no projects have scores', async () => {
      db.project.findMany.mockResolvedValue([]);
      const result = await service.getLeaderboard(baseQuery);
      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('ranks projects by score descending', async () => {
      db.project.findMany.mockResolvedValue([
        makeProjectWithScore(PROJ_A, 'Project A', 70, 'stable'),
        makeProjectWithScore(PROJ_B, 'Project B', 95, 'stable'),
      ]);

      const result = await service.getLeaderboard(baseQuery);
      expect(result.entries[0].projectId).toBe(PROJ_B);
      expect(result.entries[1].projectId).toBe(PROJ_A);
      expect(result.entries[0].rank).toBe(1);
      expect(result.entries[1].rank).toBe(2);
    });

    it('applies tiebreaker: improving > stable > declining', async () => {
      const same = 85;
      db.project.findMany.mockResolvedValue([
        makeProjectWithScore(PROJ_A, 'A', same, 'declining'),
        makeProjectWithScore(PROJ_B, 'B', same, 'improving'),
      ]);

      const result = await service.getLeaderboard(baseQuery);
      expect(result.entries[0].projectId).toBe(PROJ_B);
      expect(result.entries[1].projectId).toBe(PROJ_A);
    });

    it('gives tied entries the same rank', async () => {
      db.project.findMany.mockResolvedValue([
        makeProjectWithScore(PROJ_A, 'A', 85, 'stable'),
        makeProjectWithScore(PROJ_B, 'B', 85, 'stable'),
      ]);

      const result = await service.getLeaderboard(baseQuery);
      expect(result.entries[0].rank).toBe(result.entries[1].rank);
    });

    it('filters by team', async () => {
      db.project.findMany.mockResolvedValue([
        makeProjectWithScore(PROJ_B, 'B', 90, 'stable', 'team-alpha'),
      ]);

      const query: LeaderboardQuery = { ...baseQuery, team: 'team-alpha' };
      const result = await service.getLeaderboard(query);
      expect(db.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ team: 'team-alpha' }),
        }),
      );
      expect(result.entries).toHaveLength(1);
    });

    it('filters by badge', async () => {
      db.project.findMany.mockResolvedValue([
        makeProjectWithScore(PROJ_A, 'A', 50, 'stable'), // critical
        makeProjectWithScore(PROJ_B, 'B', 90, 'stable'), // good
      ]);

      const query: LeaderboardQuery = { ...baseQuery, badge: 'good' };
      const result = await service.getLeaderboard(query);
      expect(result.entries.every((e) => e.badge === 'good')).toBe(true);
    });

    it('paginates results correctly', async () => {
      db.project.findMany.mockResolvedValue([
        makeProjectWithScore(PROJ_A, 'A', 90, 'stable'),
        makeProjectWithScore(PROJ_B, 'B', 80, 'stable'),
      ]);

      const query: LeaderboardQuery = { ...baseQuery, page: 2, pageSize: 1 };
      const result = await service.getLeaderboard(query);
      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.page).toBe(2);
    });

    it('returns cached response on second call with same query', async () => {
      db.project.findMany.mockResolvedValue([
        makeProjectWithScore(PROJ_A, 'A', 90, 'stable'),
      ]);

      await service.getLeaderboard(baseQuery);
      await service.getLeaderboard(baseQuery);

      // DB should only be queried once (second call served from cache)
      expect(db.project.findMany).toHaveBeenCalledTimes(1);
    });

    it('includes generatedAt timestamp', async () => {
      db.project.findMany.mockResolvedValue([]);
      const result = await service.getLeaderboard(baseQuery);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });
  });

  // ─── getScoringHistory ─────────────────────────────────────────────────────

  describe('getScoringHistory', () => {
    it('returns history entries ordered by calculatedAt desc', async () => {
      db.qualityScore.findMany.mockResolvedValue([
        {
          id: 'h1',
          projectId: PROJ_A,
          score: 92,
          badge: 'excellent',
          trend: 'improving',
          calculatedAt: new Date('2024-06-02'),
        },
        {
          id: 'h2',
          projectId: PROJ_A,
          score: 85,
          badge: 'good',
          trend: 'stable',
          calculatedAt: new Date('2024-06-01'),
        },
      ]);

      const history = await service.getScoringHistory({ projectId: PROJ_A, limit: 30 });
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('h1');
      expect(history[0].score).toBe(92);
    });

    it('respects the limit parameter', async () => {
      db.qualityScore.findMany.mockResolvedValue([]);
      await service.getScoringHistory({ projectId: PROJ_A, limit: 7 });
      expect(db.qualityScore.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 7 }),
      );
    });
  });

  // ─── recordScore ──────────────────────────────────────────────────────────

  describe('recordScore', () => {
    it('creates a new quality score record', async () => {
      db.qualityScore.findFirst.mockResolvedValue(null);
      db.qualityScore.create.mockResolvedValue({});

      await service.recordScore(PROJ_A, { functional: 90, api: 80 }, ORG_ID);

      expect(db.qualityScore.create).toHaveBeenCalledTimes(1);
      const data = (db.qualityScore.create as jest.Mock).mock.calls[0][0].data;
      expect(data.projectId).toBe(PROJ_A);
      expect(data.functionalPassRate).toBe(90);
      expect(data.apiPassRate).toBe(80);
    });

    it('uses previous score for trend calculation', async () => {
      db.qualityScore.findFirst.mockResolvedValue({ score: 70 });
      db.qualityScore.create.mockResolvedValue({});

      await service.recordScore(PROJ_A, { functional: 95 }, ORG_ID);

      const data = (db.qualityScore.create as jest.Mock).mock.calls[0][0].data;
      expect(data.trend).toBe('improving');
    });

    it('assigns "stable" trend when there is no previous score', async () => {
      db.qualityScore.findFirst.mockResolvedValue(null);
      db.qualityScore.create.mockResolvedValue({});

      await service.recordScore(PROJ_A, { functional: 80 }, ORG_ID);

      const data = (db.qualityScore.create as jest.Mock).mock.calls[0][0].data;
      expect(data.trend).toBe('stable');
    });

    it('stores null for untested categories', async () => {
      db.qualityScore.findFirst.mockResolvedValue(null);
      db.qualityScore.create.mockResolvedValue({});

      await service.recordScore(PROJ_A, { functional: 80 }, ORG_ID);

      const data = (db.qualityScore.create as jest.Mock).mock.calls[0][0].data;
      expect(data.visualPassRate).toBeNull();
      expect(data.securityPassRate).toBeNull();
    });
  });
});
