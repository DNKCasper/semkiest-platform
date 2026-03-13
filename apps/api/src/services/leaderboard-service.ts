import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import {
  calculateQualityScore,
  type CategoryWeights,
  type QualityBadge,
  type TrendDirection,
  type ScoringCategory,
} from './quality-scorer';
import { ScoringConfigService } from './scoring-config';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single entry in the quality leaderboard. */
export interface LeaderboardEntry {
  rank: number;
  projectId: string;
  projectName: string;
  team: string | null;
  organizationId: string;
  score: number;
  badge: QualityBadge;
  trend: TrendDirection;
  /** Absolute score change since the previous snapshot. Positive = improved. */
  trendDelta: number;
  categoryScores: Record<string, number | null>;
  calculatedAt: Date;
}

/** Paginated leaderboard response. */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  pageSize: number;
  generatedAt: Date;
}

/** Scoring history entry for a single project. */
export interface ScoringHistoryEntry {
  id: string;
  projectId: string;
  score: number;
  badge: QualityBadge;
  trend: TrendDirection;
  trendDelta: number;
  calculatedAt: Date;
}

// ─── Validation Schemas ───────────────────────────────────────────────────────

export const leaderboardQuerySchema = z.object({
  organizationId: z.string().uuid(),
  team: z.string().optional(),
  category: z
    .enum(['functional', 'visual', 'performance', 'accessibility', 'security', 'api'])
    .optional(),
  badge: z.enum(['excellent', 'good', 'needs_attention', 'critical']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const scoringHistoryQuerySchema = z.object({
  projectId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(90).default(30),
});

export type ScoringHistoryQuery = z.infer<typeof scoringHistoryQuerySchema>;

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Simple TTL cache. Replace with Redis in production for multi-instance deployments. */
class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(pattern: string): void {
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key);
      }
    }
  }
}

// ─── Leaderboard Service ──────────────────────────────────────────────────────

const LEADERBOARD_CACHE_TTL_MS = 60_000; // 1 minute

/**
 * LeaderboardService aggregates quality scores across an organization's projects,
 * applies configurable weights, sorts entries with tiebreaker logic, and caches
 * results for dashboard performance.
 */
export class LeaderboardService {
  private readonly cache = new TtlCache<LeaderboardResponse>();
  private readonly configService: ScoringConfigService;

  constructor(private readonly db: PrismaClient) {
    this.configService = new ScoringConfigService(db);
  }

  /**
   * Returns the ranked leaderboard for an organization.
   *
   * Ranking order:
   *   1. Composite score (descending)
   *   2. Trend (improving > stable > declining) — tiebreaker
   *   3. Most recent pass rate of any single category — final tiebreaker
   *
   * Results are cached for LEADERBOARD_CACHE_TTL_MS to meet the <500ms SLA.
   */
  async getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    const cacheKey = this.buildCacheKey(query);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const weights = await this.configService.getWeights(query.organizationId);
    const entries = await this.buildEntries(query, weights);

    const paged = entries.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    const response: LeaderboardResponse = {
      entries: paged,
      total: entries.length,
      page: query.page,
      pageSize: query.pageSize,
      generatedAt: new Date(),
    };

    this.cache.set(cacheKey, response, LEADERBOARD_CACHE_TTL_MS);
    return response;
  }

  /**
   * Retrieves the historical quality scores for a single project,
   * ordered from most recent to oldest.
   */
  async getScoringHistory(query: ScoringHistoryQuery): Promise<ScoringHistoryEntry[]> {
    const scores = await this.db.qualityScore.findMany({
      where: { projectId: query.projectId },
      orderBy: { calculatedAt: 'desc' },
      take: query.limit,
    });

    return scores.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      score: s.score,
      badge: s.badge as QualityBadge,
      trend: s.trend as TrendDirection,
      trendDelta: 0, // delta is stored relative at write time; caller can compute if needed
      calculatedAt: s.calculatedAt,
    }));
  }

  /**
   * Computes and persists a quality score snapshot for a project.
   * Invalidates the leaderboard cache for the project's organization.
   *
   * Call this after a test run completes or on a scheduled cadence.
   */
  async recordScore(
    projectId: string,
    passRates: Record<string, number | undefined>,
    organizationId: string,
  ): Promise<void> {
    const weights = await this.configService.getWeights(organizationId);

    // Fetch previous score for trend calculation
    const previous = await this.db.qualityScore.findFirst({
      where: { projectId },
      orderBy: { calculatedAt: 'desc' },
      select: { score: true },
    });

    const result = calculateQualityScore(
      passRates,
      weights,
      previous?.score ?? null,
    );

    await this.db.qualityScore.create({
      data: {
        projectId,
        score: result.score,
        functionalPassRate: passRates['functional'] ?? null,
        visualPassRate: passRates['visual'] ?? null,
        performancePassRate: passRates['performance'] ?? null,
        accessibilityPassRate: passRates['accessibility'] ?? null,
        securityPassRate: passRates['security'] ?? null,
        apiPassRate: passRates['api'] ?? null,
        badge: result.badge,
        trend: result.trend,
        calculatedAt: result.calculatedAt,
      },
    });

    // Bust leaderboard cache for this org
    this.cache.invalidate(organizationId);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async buildEntries(
    query: LeaderboardQuery,
    weights: CategoryWeights,
  ): Promise<LeaderboardEntry[]> {
    // Fetch latest quality score per project in the org
    const projects = await this.db.project.findMany({
      where: {
        organizationId: query.organizationId,
        ...(query.team ? { team: query.team } : {}),
      },
      include: {
        qualityScores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
    });

    // Build entries with scores
    let entries: Array<LeaderboardEntry & { _sortPassRate: number }> = projects
      .filter((p) => p.qualityScores.length > 0)
      .map((project) => {
        const latest = project.qualityScores[0];

        const categoryScores: Record<string, number | null> = {
          functional: latest.functionalPassRate,
          visual: latest.visualPassRate,
          performance: latest.performancePassRate,
          accessibility: latest.accessibilityPassRate,
          security: latest.securityPassRate,
          api: latest.apiPassRate,
        };

        // Category filter: skip projects with no data in the requested category
        if (query.category) {
          const val = categoryScores[query.category];
          if (val === null || val === undefined) return null;
        }

        const badge = latest.badge as QualityBadge;
        const trend = latest.trend as TrendDirection;

        if (query.badge && badge !== query.badge) return null;

        // Pick highest available pass rate as tiebreaker signal
        const validRates = Object.values(categoryScores).filter(
          (v): v is number => v !== null && v !== undefined,
        );
        const maxPassRate = validRates.length > 0 ? Math.max(...validRates) : 0;

        return {
          rank: 0, // assigned after sorting
          projectId: project.id,
          projectName: project.name,
          team: project.team,
          organizationId: project.organizationId,
          score: latest.score,
          badge,
          trend,
          trendDelta: 0,
          categoryScores,
          calculatedAt: latest.calculatedAt,
          _sortPassRate: maxPassRate,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Sort: 1) score desc, 2) trend priority desc, 3) max pass rate desc
    const trendPriority: Record<TrendDirection, number> = {
      improving: 2,
      stable: 1,
      declining: 0,
    };

    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const tp = trendPriority[b.trend] - trendPriority[a.trend];
      if (tp !== 0) return tp;
      return b._sortPassRate - a._sortPassRate;
    });

    // Assign ranks (ties share the same rank)
    let currentRank = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].score !== entries[i - 1].score) {
        currentRank = i + 1;
      }
      entries[i].rank = currentRank;
    }

    return entries;
  }

  private buildCacheKey(query: LeaderboardQuery): string {
    return [
      query.organizationId,
      query.team ?? 'all',
      query.category ?? 'all',
      query.badge ?? 'all',
      query.page,
      query.pageSize,
    ].join(':');
  }
}
