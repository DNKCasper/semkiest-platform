/**
 * Quality Trends API Routes (SEM-96)
 *
 * GET  /api/quality-trends/:projectId          - Full trend report for a project
 * GET  /api/quality-trends/:projectId/alerts   - Regression alerts for a project
 * GET  /api/quality-trends/org/:orgId/summary  - Org-wide trend summaries
 * POST /api/quality-trends/:projectId/aggregate - Trigger on-demand aggregation
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  getQualityTrends,
  getOrganizationTrendSummaries,
  type TrendWindow,
} from '../services/quality-trends';
import {
  runAggregationPipeline,
  applyRetentionPolicy,
} from '../services/metrics-aggregator';
import prisma from '@semkiest/db';

export const qualityTrendsRouter = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

const trendQuerySchema = z.object({
  timezone: z.string().default('UTC'),
  window: z
    .enum(['7', '30', '90'])
    .transform((v) => Number(v) as TrendWindow)
    .optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const alertQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('20'),
  offset: z.string().transform(Number).pipe(z.number().int().min(0)).default('0'),
});

const aggregateBodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timezone: z.string().default('UTC'),
});

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * GET /api/quality-trends/:projectId
 * Returns quality trend data for dashboard charts.
 */
qualityTrendsRouter.get(
  '/:projectId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const queryResult = trendQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: queryResult.error.flatten() });
      return;
    }

    const { timezone, window: windowDays, startDate, endDate } = queryResult.data;

    try {
      const report = await getQualityTrends(req.params['projectId'] ?? '', {
        timezone,
        windowDays,
        startDate,
        endDate,
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/quality-trends/:projectId/alerts
 * Returns regression alerts for a project.
 */
qualityTrendsRouter.get(
  '/:projectId/alerts',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const queryResult = alertQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: queryResult.error.flatten() });
      return;
    }

    const { status, limit, offset } = queryResult.data;

    try {
      const alerts = await prisma.regressionAlert.findMany({
        where: {
          projectId: req.params['projectId'] ?? '',
          ...(status !== undefined ? { status } : {}),
        },
        orderBy: { detectedAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.regressionAlert.count({
        where: {
          projectId: req.params['projectId'] ?? '',
          ...(status !== undefined ? { status } : {}),
        },
      });

      res.json({ alerts, total, limit, offset });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/quality-trends/org/:orgId/summary
 * Returns lightweight summaries for all projects in an organization.
 */
qualityTrendsRouter.get(
  '/org/:orgId/summary',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const timezone =
      typeof req.query['timezone'] === 'string' ? req.query['timezone'] : 'UTC';

    try {
      const summaries = await getOrganizationTrendSummaries(
        req.params['orgId'] ?? '',
        timezone,
      );
      res.json({ summaries });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/quality-trends/:projectId/aggregate
 * Triggers on-demand metrics aggregation for a project.
 * Protected — should be called by internal services or workers only.
 */
qualityTrendsRouter.post(
  '/:projectId/aggregate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bodyResult = aggregateBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'Invalid request body', details: bodyResult.error.flatten() });
      return;
    }

    const { date: dateStr, timezone } = bodyResult.data;
    const date = dateStr !== undefined ? new Date(`${dateStr}T00:00:00Z`) : new Date();

    try {
      const result = await runAggregationPipeline(
        req.params['projectId'] ?? '',
        date,
        timezone,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/quality-trends/retention
 * Triggers the data retention cleanup job.
 * Protected — internal use only.
 */
qualityTrendsRouter.post(
  '/retention',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await applyRetentionPolicy();
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
