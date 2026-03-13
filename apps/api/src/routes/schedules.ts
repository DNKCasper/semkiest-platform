import { Router, type Request, type Response, type NextFunction } from 'express';
import { schedulerService } from '../services/scheduler';
import { validateCronExpression, SCHEDULE_TEMPLATES, getNextRunTimes } from '../services/cron-manager';
import type {
  CreateScheduleInput,
  UpdateScheduleInput,
  ScheduleQueryParams,
} from '@semkiest/shared-types';

const router = Router();

// =============================================================================
// Helper
// =============================================================================

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ message });
}

// =============================================================================
// GET /api/schedules/templates
// Returns the built-in schedule templates.
// =============================================================================
router.get('/templates', (_req: Request, res: Response) => {
  res.json(SCHEDULE_TEMPLATES);
});

// =============================================================================
// POST /api/schedules/validate
// Validates a cron expression and returns next run times.
// =============================================================================
router.post(
  '/validate',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { cronExpression, timezone = 'UTC' } = req.body as {
        cronExpression?: string;
        timezone?: string;
      };

      if (!cronExpression) {
        sendError(res, 400, 'cronExpression is required');
        return;
      }

      const validation = validateCronExpression(cronExpression, timezone);
      if (!validation.valid) {
        res.status(400).json(validation);
        return;
      }

      const nextRunTimes = getNextRunTimes(cronExpression, timezone, 5).map((d) =>
        d.toISOString(),
      );

      res.json({ valid: true, nextRunTimes });
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// GET /api/schedules
// Lists schedules with optional filtering.
// =============================================================================
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params: ScheduleQueryParams = {
      projectId: req.query['projectId'] as string | undefined,
      status: req.query['status'] as ScheduleQueryParams['status'],
      page: req.query['page'] ? Number(req.query['page']) : undefined,
      pageSize: req.query['pageSize'] ? Number(req.query['pageSize']) : undefined,
    };

    const result = await schedulerService.listSchedules(params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// POST /api/schedules
// Creates a new schedule.
// =============================================================================
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = req.body as CreateScheduleInput;

    if (!input.name || !input.cronExpression || !input.projectId) {
      sendError(res, 400, 'name, cronExpression, and projectId are required');
      return;
    }

    const schedule = await schedulerService.createSchedule(input);
    res.status(201).json(schedule);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid cron expression')) {
      sendError(res, 400, err.message);
      return;
    }
    next(err);
  }
});

// =============================================================================
// GET /api/schedules/:id
// Returns a single schedule by ID.
// =============================================================================
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await schedulerService.getSchedule(req.params['id'] as string);
    res.json(schedule);
  } catch (err) {
    if (err instanceof Error && err.message.includes('No Schedule found')) {
      sendError(res, 404, 'Schedule not found');
      return;
    }
    next(err);
  }
});

// =============================================================================
// PUT /api/schedules/:id
// Updates a schedule.
// =============================================================================
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = req.body as UpdateScheduleInput;
    const schedule = await schedulerService.updateSchedule(req.params['id'] as string, input);
    res.json(schedule);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('No Schedule found')) {
        sendError(res, 404, 'Schedule not found');
        return;
      }
      if (err.message.includes('Invalid cron expression')) {
        sendError(res, 400, err.message);
        return;
      }
    }
    next(err);
  }
});

// =============================================================================
// DELETE /api/schedules/:id
// Permanently deletes a schedule and all its run history.
// =============================================================================
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await schedulerService.deleteSchedule(req.params['id'] as string);
    res.status(204).send();
  } catch (err) {
    if (err instanceof Error && err.message.includes('No Schedule found')) {
      sendError(res, 404, 'Schedule not found');
      return;
    }
    next(err);
  }
});

// =============================================================================
// POST /api/schedules/:id/pause
// Pauses an active schedule.
// =============================================================================
router.post('/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await schedulerService.pauseSchedule(req.params['id'] as string);
    res.json(schedule);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('No Schedule found')) {
        sendError(res, 404, 'Schedule not found');
        return;
      }
      if (err.message.includes('not active')) {
        sendError(res, 409, err.message);
        return;
      }
    }
    next(err);
  }
});

// =============================================================================
// POST /api/schedules/:id/resume
// Resumes a paused schedule.
// =============================================================================
router.post('/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await schedulerService.resumeSchedule(req.params['id'] as string);
    res.json(schedule);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('No Schedule found')) {
        sendError(res, 404, 'Schedule not found');
        return;
      }
      if (err.message.includes('not paused')) {
        sendError(res, 409, err.message);
        return;
      }
    }
    next(err);
  }
});

// =============================================================================
// GET /api/schedules/:id/runs
// Returns paginated run history for a schedule.
// =============================================================================
router.get('/:id/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query['page'] ? Number(req.query['page']) : 1;
    const pageSize = req.query['pageSize'] ? Number(req.query['pageSize']) : 20;
    const result = await schedulerService.getScheduleRuns(
      req.params['id'] as string,
      page,
      pageSize,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// POST /api/schedules/:id/runs/:runId/start
// Internal: marks a run as started (called by worker).
// =============================================================================
router.post(
  '/:id/runs/:runId/start',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId, attempt } = req.body as { jobId?: string; attempt?: number };
      const runId = await schedulerService.startRun(
        req.params['id'] as string,
        jobId ?? 'unknown',
        attempt ?? 1,
      );
      res.json({ runId });
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// POST /api/schedules/:id/runs/:runId/complete
// Internal: marks a run as complete (called by worker).
// =============================================================================
router.post(
  '/:id/runs/:runId/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, errorMessage } = req.body as {
        status: 'success' | 'failed' | 'cancelled';
        errorMessage?: string;
      };

      if (!['success', 'failed', 'cancelled'].includes(status)) {
        sendError(res, 400, 'status must be one of: success, failed, cancelled');
        return;
      }

      await schedulerService.completeRun(
        req.params['runId'] as string,
        status,
        errorMessage,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
