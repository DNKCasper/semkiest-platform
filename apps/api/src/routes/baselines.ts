/**
 * Baseline management API routes.
 *
 * Provides endpoints for listing, approving, rejecting, and reviewing the
 * history of visual regression baselines.
 *
 * All mutation endpoints require a `userId` in the request body; in a
 * production system this would be extracted from a verified JWT.
 *
 * Routes:
 *   GET    /api/baselines                  – List baselines with optional filters
 *   GET    /api/baselines/:id              – Get a single baseline with diff data
 *   GET    /api/baselines/:id/diff         – Get diff viewer data payload
 *   POST   /api/baselines/:id/approve      – Approve a single baseline
 *   POST   /api/baselines/:id/reject       – Reject a single baseline
 *   POST   /api/baselines/batch            – Batch approve or reject
 *   GET    /api/baselines/:id/history      – Get approval history
 *   PUT    /api/baselines/:id/threshold    – Update per-baseline auto-approve threshold
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '@semkiest/db';
import {
  ApprovalWorkflow,
  BaselineNotFoundError,
  InvalidStatusTransitionError,
  InsufficientPermissionsError,
  mapDbBaselineToVisualBaseline,
  mapDbApprovalRecord,
} from '@semkiest/visual-regression';
import type {
  ApproveBaselineInput,
  AutoApproveConfig,
  BaselineQuery,
  BaselineRepository,
  BaselineStatus,
  BaselineUpdateData,
  BatchApprovalInput,
  CreateApprovalRecordData,
  RejectBaselineInput,
  VisualBaseline,
  ApprovalRecord,
} from '@semkiest/visual-regression';

// ─── Prisma-backed Repository ─────────────────────────────────────────────────

/**
 * Production repository implementation backed by Prisma / PostgreSQL.
 */
const prismaRepository: BaselineRepository = {
  async findById(id: string): Promise<VisualBaseline | null> {
    const row = await prisma.visualBaseline.findUnique({ where: { id } });
    if (!row) return null;
    return mapDbBaselineToVisualBaseline(row);
  },

  async findMany(query: BaselineQuery): Promise<VisualBaseline[]> {
    const {
      projectId,
      status,
      componentName,
      viewport,
      page = 1,
      pageSize = 20,
    } = query;

    const rows = await prisma.visualBaseline.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(status ? { status } : {}),
        ...(componentName ? { componentName } : {}),
        ...(viewport ? { viewport } : {}),
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapDbBaselineToVisualBaseline);
  },

  async update(id: string, data: BaselineUpdateData): Promise<VisualBaseline> {
    const row = await prisma.visualBaseline.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.autoApproveThreshold !== undefined
          ? { autoApproveThreshold: data.autoApproveThreshold }
          : {}),
        ...(data.version !== undefined ? { version: data.version } : {}),
      },
    });
    return mapDbBaselineToVisualBaseline(row);
  },

  async createApprovalRecord(
    data: CreateApprovalRecordData,
  ): Promise<ApprovalRecord> {
    const row = await prisma.approvalRecord.create({
      data: {
        baselineId: data.baselineId,
        action: data.action,
        userId: data.userId,
        userName: data.userName ?? null,
        comment: data.comment ?? null,
        previousStatus: data.previousStatus,
        newStatus: data.newStatus,
        version: data.version,
      },
    });
    return mapDbApprovalRecord(row);
  },

  async findApprovalHistory(baselineId: string): Promise<ApprovalRecord[]> {
    const rows = await prisma.approvalRecord.findMany({
      where: { baselineId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapDbApprovalRecord);
  },
};

// ─── Workflow Instance ────────────────────────────────────────────────────────

const workflow = new ApprovalWorkflow(prismaRepository);

// ─── Error Handler Helper ─────────────────────────────────────────────────────

function handleWorkflowError(
  err: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof BaselineNotFoundError) {
    res.status(404).json({ message: err.message });
    return;
  }
  if (err instanceof InvalidStatusTransitionError) {
    res.status(409).json({ message: err.message });
    return;
  }
  if (err instanceof InsufficientPermissionsError) {
    res.status(403).json({ message: err.message });
    return;
  }
  next(err);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const baselinesRouter = Router();

/**
 * GET /api/baselines
 *
 * List baselines. Supports optional query parameters:
 *   - projectId, status, componentName, viewport, page, pageSize
 */
baselinesRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        projectId,
        status,
        componentName,
        viewport,
        page,
        pageSize,
      } = req.query as Record<string, string | undefined>;

      const query: BaselineQuery = {
        ...(projectId ? { projectId } : {}),
        ...(status ? { status: status as BaselineStatus } : {}),
        ...(componentName ? { componentName } : {}),
        ...(viewport ? { viewport } : {}),
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      };

      const baselines = await workflow.listBaselines(query);
      res.json({ data: baselines, count: baselines.length });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/baselines/:id
 *
 * Get a single baseline record.
 */
baselinesRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const baseline = await workflow.getBaseline(req.params['id'] as string);
      res.json(baseline);
    } catch (err) {
      handleWorkflowError(err, res, next);
    }
  },
);

/**
 * GET /api/baselines/:id/diff
 *
 * Get the full diff viewer data payload for a baseline.
 */
baselinesRouter.get(
  '/:id/diff',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await workflow.prepareDiffViewerData(
        req.params['id'] as string,
      );
      res.json(data);
    } catch (err) {
      handleWorkflowError(err, res, next);
    }
  },
);

/**
 * POST /api/baselines/:id/approve
 *
 * Approve a single baseline diff.
 *
 * Body: { userId: string; userName?: string; comment?: string }
 */
baselinesRouter.post(
  '/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, userName, comment } = req.body as ApproveBaselineInput;

      if (!userId) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }

      const updated = await workflow.approve(req.params['id'] as string, {
        userId,
        userName,
        comment,
      });

      res.json(updated);
    } catch (err) {
      handleWorkflowError(err, res, next);
    }
  },
);

/**
 * POST /api/baselines/:id/reject
 *
 * Reject a single baseline diff.
 *
 * Body: { userId: string; userName?: string; reason: string }
 */
baselinesRouter.post(
  '/:id/reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, userName, reason } = req.body as RejectBaselineInput;

      if (!userId) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }
      if (!reason) {
        res.status(400).json({ message: 'reason is required' });
        return;
      }

      const updated = await workflow.reject(req.params['id'] as string, {
        userId,
        userName,
        reason,
      });

      res.json(updated);
    } catch (err) {
      handleWorkflowError(err, res, next);
    }
  },
);

/**
 * POST /api/baselines/batch
 *
 * Batch approve or reject multiple baselines.
 *
 * Body: { baselineIds: string[]; action: 'approve' | 'reject'; userId: string; userName?: string; comment?: string }
 */
baselinesRouter.post(
  '/batch',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { baselineIds, action, userId, userName, comment } =
        req.body as BatchApprovalInput;

      if (!Array.isArray(baselineIds) || baselineIds.length === 0) {
        res
          .status(400)
          .json({ message: 'baselineIds must be a non-empty array' });
        return;
      }
      if (action !== 'approve' && action !== 'reject') {
        res
          .status(400)
          .json({ message: 'action must be "approve" or "reject"' });
        return;
      }
      if (!userId) {
        res.status(400).json({ message: 'userId is required' });
        return;
      }

      const result = await workflow.batchProcess({
        baselineIds,
        action,
        userId,
        userName,
        comment,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/baselines/:id/history
 *
 * Retrieve the approval history for a baseline.
 */
baselinesRouter.get(
  '/:id/history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = await workflow.getHistory(req.params['id'] as string);
      res.json({ data: history, count: history.length });
    } catch (err) {
      handleWorkflowError(err, res, next);
    }
  },
);

/**
 * PUT /api/baselines/:id/threshold
 *
 * Update the per-baseline auto-approve threshold.
 *
 * Body: { threshold: number | null }
 */
baselinesRouter.put(
  '/:id/threshold',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { threshold } = req.body as { threshold: number | null };

      if (threshold !== null && typeof threshold !== 'number') {
        res
          .status(400)
          .json({ message: 'threshold must be a number or null' });
        return;
      }

      const updated = await workflow.setAutoApproveThreshold(
        req.params['id'] as string,
        threshold,
      );

      res.json(updated);
    } catch (err) {
      if (err instanceof RangeError) {
        res.status(400).json({ message: err.message });
        return;
      }
      handleWorkflowError(err, res, next);
    }
  },
);

/**
 * POST /api/baselines/:id/auto-approve
 *
 * Trigger auto-approval evaluation for a single baseline.
 * Optionally accepts a global config override in the request body.
 *
 * Body: { config?: AutoApproveConfig }
 */
baselinesRouter.post(
  '/:id/auto-approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { config } = req.body as { config?: AutoApproveConfig };

      const updated = await workflow.checkAndAutoApprove(
        req.params['id'] as string,
        config,
      );

      res.json(updated);
    } catch (err) {
      handleWorkflowError(err, res, next);
    }
  },
);
