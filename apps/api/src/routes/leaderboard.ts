import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import type { PrismaClient } from '@prisma/client';
import {
  LeaderboardService,
  leaderboardQuerySchema,
  scoringHistoryQuerySchema,
} from '../services/leaderboard-service';
import {
  ScoringConfigService,
  updateWeightsInputSchema,
} from '../services/scoring-config';

/**
 * Creates the leaderboard router.
 *
 * Endpoints:
 *   GET  /leaderboard              – Ranked project leaderboard for an org
 *   GET  /leaderboard/history/:id  – Scoring history for a project
 *   GET  /leaderboard/config/:orgId – Scoring weight config for an org
 *   PUT  /leaderboard/config/:orgId – Update scoring weights for an org
 *   DELETE /leaderboard/config/:orgId – Reset weights to platform defaults
 */
export function createLeaderboardRouter(db: PrismaClient): Router {
  const router = Router();
  const leaderboardService = new LeaderboardService(db);
  const configService = new ScoringConfigService(db);

  // ─── GET /leaderboard ──────────────────────────────────────────────────────

  router.get(
    '/',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = leaderboardQuerySchema.parse({
          organizationId: req.query['organizationId'],
          team: req.query['team'],
          category: req.query['category'],
          badge: req.query['badge'],
          page: req.query['page'],
          pageSize: req.query['pageSize'],
        });

        const result = await leaderboardService.getLeaderboard(query);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // ─── GET /leaderboard/history/:projectId ──────────────────────────────────

  router.get(
    '/history/:projectId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = scoringHistoryQuerySchema.parse({
          projectId: req.params['projectId'],
          limit: req.query['limit'],
        });

        const history = await leaderboardService.getScoringHistory(query);
        res.json({ history });
      } catch (err) {
        next(err);
      }
    },
  );

  // ─── GET /leaderboard/config/:organizationId ──────────────────────────────

  router.get(
    '/config/:organizationId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { organizationId } = req.params;
        const config = await configService.getConfig(organizationId as string);

        if (!config) {
          // Return defaults when no custom config exists
          const weights = await configService.getWeights(organizationId as string);
          res.json({ organizationId, weights, isDefault: true });
          return;
        }

        res.json({ ...config, isDefault: false });
      } catch (err) {
        next(err);
      }
    },
  );

  // ─── PUT /leaderboard/config/:organizationId ──────────────────────────────

  router.put(
    '/config/:organizationId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { organizationId } = req.params;
        const input = updateWeightsInputSchema.parse(req.body);

        const config = await configService.upsertWeights(
          organizationId as string,
          input,
        );

        res.json(config);
      } catch (err) {
        next(err);
      }
    },
  );

  // ─── DELETE /leaderboard/config/:organizationId ───────────────────────────

  router.delete(
    '/config/:organizationId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { organizationId } = req.params;
        await configService.resetToDefaults(organizationId as string);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  // ─── Error handler ─────────────────────────────────────────────────────────

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: err.flatten().fieldErrors,
      });
      return;
    }

    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}
