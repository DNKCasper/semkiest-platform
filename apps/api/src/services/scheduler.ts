import { Queue, type ConnectionOptions } from 'bullmq';
import type IORedis from 'ioredis';
import { prisma } from '@semkiest/db';
import { ScheduleStatus, RunStatus } from '@semkiest/db';
import type {
  Schedule,
  CreateScheduleInput,
  UpdateScheduleInput,
  ScheduleListResponse,
  ScheduleRunListResponse,
  ScheduledTestJobData,
  ScheduleQueryParams,
} from '@semkiest/shared-types';
import { getNextRunTime, getNextRunTimes, validateCronExpression } from './cron-manager';

/** Name of the BullMQ queue used for scheduled test executions. */
export const SCHEDULER_QUEUE_NAME = 'scheduled-tests';

// =============================================================================
// Helper: convert Prisma record to shared Schedule type
// =============================================================================

function mapSchedule(record: {
  id: string;
  name: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  projectId: string;
  status: ScheduleStatus;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastRunStatus: RunStatus | null;
  missedRuns: number;
  retryAttempts: number;
  retryDelay: number;
  notifications: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Schedule {
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? undefined,
    cronExpression: record.cronExpression,
    timezone: record.timezone,
    projectId: record.projectId,
    status: record.status.toLowerCase() as Schedule['status'],
    nextRunAt: record.nextRunAt?.toISOString(),
    lastRunAt: record.lastRunAt?.toISOString(),
    lastRunStatus: record.lastRunStatus?.toLowerCase() as Schedule['lastRunStatus'],
    missedRuns: record.missedRuns,
    retryAttempts: record.retryAttempts,
    retryDelay: record.retryDelay,
    notifications: record.notifications,
    metadata: record.metadata as Record<string, unknown> | undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// =============================================================================
// SchedulerService
// =============================================================================

/**
 * SchedulerService manages cron-based test schedules backed by BullMQ and
 * PostgreSQL via Prisma.
 *
 * Lifecycle:
 *   1. `initialize(connection)` – call once at API startup
 *   2. `handleMissedSchedules()` – re-enqueue any runs missed during downtime
 *   3. CRUD methods for managing individual schedules
 *   4. `shutdown()` – drain and close the queue on shutdown
 */
export class SchedulerService {
  private queue: Queue | null = null;

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Initialises the BullMQ queue connection.
   * Must be called before any other method.
   */
  initialize(connection: IORedis | ConnectionOptions): void {
    this.queue = new Queue(SCHEDULER_QUEUE_NAME, {
      connection: connection as ConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }

  /** Gracefully closes the BullMQ queue. */
  async shutdown(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  private getQueue(): Queue {
    if (!this.queue) {
      throw new Error('SchedulerService not initialized. Call initialize() first.');
    }
    return this.queue;
  }

  // --------------------------------------------------------------------------
  // Missed schedule recovery
  // --------------------------------------------------------------------------

  /**
   * On service startup, detect any ACTIVE schedules whose `nextRunAt` is in
   * the past and enqueue an immediate catch-up job.
   *
   * This implements the "missed schedule handling" requirement: if the service
   * was down when a run should have fired, it runs immediately on next start.
   */
  async handleMissedSchedules(): Promise<void> {
    const now = new Date();
    const missed = await prisma.schedule.findMany({
      where: {
        status: ScheduleStatus.ACTIVE,
        nextRunAt: { lt: now },
      },
    });

    for (const schedule of missed) {
      // Increment missed counter
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: { missedRuns: { increment: 1 } },
      });

      // Enqueue an immediate one-shot catch-up run
      const runRecord = await prisma.scheduleRun.create({
        data: {
          scheduleId: schedule.id,
          status: RunStatus.PENDING,
          attempt: 1,
        },
      });

      const jobData: ScheduledTestJobData = {
        scheduleId: schedule.id,
        projectId: schedule.projectId,
        runId: runRecord.id,
        attempt: 1,
      };

      await this.getQueue().add('scheduled-test', jobData, {
        attempts: schedule.retryAttempts,
        backoff: { type: 'exponential', delay: schedule.retryDelay },
        jobId: `catchup-${runRecord.id}`,
      });

      // Recalculate and persist next run time
      const nextRunAt = getNextRunTime(schedule.cronExpression, schedule.timezone);
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: { nextRunAt },
      });
    }
  }

  // --------------------------------------------------------------------------
  // CRUD operations
  // --------------------------------------------------------------------------

  /**
   * Creates a new schedule, persists it to the database, and registers a
   * BullMQ repeating job so it fires automatically at the specified cron interval.
   */
  async createSchedule(input: CreateScheduleInput): Promise<Schedule> {
    const timezone = input.timezone ?? 'UTC';

    // Validate the cron expression before persisting
    const validation = validateCronExpression(input.cronExpression, timezone);
    if (!validation.valid) {
      throw new Error(`Invalid cron expression: ${validation.error}`);
    }

    const nextRunAt = getNextRunTime(input.cronExpression, timezone);

    const record = await prisma.schedule.create({
      data: {
        name: input.name,
        description: input.description,
        cronExpression: input.cronExpression,
        timezone,
        projectId: input.projectId,
        status: ScheduleStatus.ACTIVE,
        nextRunAt,
        retryAttempts: input.retryAttempts ?? 3,
        retryDelay: input.retryDelay ?? 5000,
        notifications: input.notifications ?? false,
        metadata: input.metadata ? (input.metadata as object) : undefined,
      },
    });

    // Register repeating job in BullMQ
    await this.registerRepeatJob(record.id, record.projectId, {
      cronExpression: record.cronExpression,
      timezone: record.timezone,
      retryAttempts: record.retryAttempts,
      retryDelay: record.retryDelay,
    });

    return mapSchedule(record);
  }

  /**
   * Updates schedule fields. If the cron expression or timezone changes the
   * BullMQ repeating job is replaced to reflect the new schedule.
   */
  async updateSchedule(id: string, input: UpdateScheduleInput): Promise<Schedule> {
    const existing = await prisma.schedule.findUniqueOrThrow({ where: { id } });

    const cronChanged =
      (input.cronExpression !== undefined && input.cronExpression !== existing.cronExpression) ||
      (input.timezone !== undefined && input.timezone !== existing.timezone);

    const newCron = input.cronExpression ?? existing.cronExpression;
    const newTz = input.timezone ?? existing.timezone;

    if (input.cronExpression !== undefined) {
      const validation = validateCronExpression(newCron, newTz);
      if (!validation.valid) {
        throw new Error(`Invalid cron expression: ${validation.error}`);
      }
    }

    const nextRunAt = cronChanged ? getNextRunTime(newCron, newTz) : existing.nextRunAt;

    const record = await prisma.schedule.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.cronExpression !== undefined && { cronExpression: input.cronExpression }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.retryAttempts !== undefined && { retryAttempts: input.retryAttempts }),
        ...(input.retryDelay !== undefined && { retryDelay: input.retryDelay }),
        ...(input.notifications !== undefined && { notifications: input.notifications }),
        ...(input.metadata !== undefined && { metadata: input.metadata as object }),
        ...(cronChanged && { nextRunAt }),
      },
    });

    // Re-register BullMQ job only if cron schedule changed and schedule is active
    if (cronChanged && record.status === ScheduleStatus.ACTIVE) {
      await this.removeRepeatJob(id, existing.cronExpression, existing.timezone);
      await this.registerRepeatJob(id, record.projectId, {
        cronExpression: record.cronExpression,
        timezone: record.timezone,
        retryAttempts: record.retryAttempts,
        retryDelay: record.retryDelay,
      });
    }

    return mapSchedule(record);
  }

  /**
   * Pauses an active schedule without losing its configuration.
   * The BullMQ repeating job is removed; the DB record is marked PAUSED.
   */
  async pauseSchedule(id: string): Promise<Schedule> {
    const record = await prisma.schedule.findUniqueOrThrow({ where: { id } });

    if (record.status !== ScheduleStatus.ACTIVE) {
      throw new Error(`Schedule ${id} is not active (current status: ${record.status})`);
    }

    await this.removeRepeatJob(id, record.cronExpression, record.timezone);

    const updated = await prisma.schedule.update({
      where: { id },
      data: { status: ScheduleStatus.PAUSED, nextRunAt: null },
    });

    return mapSchedule(updated);
  }

  /**
   * Resumes a paused schedule.
   * Re-registers the BullMQ repeating job and recalculates `nextRunAt`.
   */
  async resumeSchedule(id: string): Promise<Schedule> {
    const record = await prisma.schedule.findUniqueOrThrow({ where: { id } });

    if (record.status !== ScheduleStatus.PAUSED) {
      throw new Error(`Schedule ${id} is not paused (current status: ${record.status})`);
    }

    const nextRunAt = getNextRunTime(record.cronExpression, record.timezone);

    await this.registerRepeatJob(id, record.projectId, {
      cronExpression: record.cronExpression,
      timezone: record.timezone,
      retryAttempts: record.retryAttempts,
      retryDelay: record.retryDelay,
    });

    const updated = await prisma.schedule.update({
      where: { id },
      data: { status: ScheduleStatus.ACTIVE, nextRunAt },
    });

    return mapSchedule(updated);
  }

  /**
   * Permanently deletes a schedule. Removes the BullMQ repeating job and
   * hard-deletes the DB record (cascade removes all ScheduleRuns).
   */
  async deleteSchedule(id: string): Promise<void> {
    const record = await prisma.schedule.findUniqueOrThrow({ where: { id } });

    if (record.status === ScheduleStatus.ACTIVE) {
      await this.removeRepeatJob(id, record.cronExpression, record.timezone);
    }

    await prisma.schedule.delete({ where: { id } });
  }

  // --------------------------------------------------------------------------
  // Query operations
  // --------------------------------------------------------------------------

  /** Returns a paginated list of schedules, optionally filtered by project or status. */
  async listSchedules(params: ScheduleQueryParams = {}): Promise<ScheduleListResponse> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = {
      ...(params.projectId && { projectId: params.projectId }),
      ...(params.status && { status: params.status.toUpperCase() as ScheduleStatus }),
      // Exclude soft-deleted records from default listing
      NOT: { status: ScheduleStatus.DELETED },
    };

    const [total, records] = await Promise.all([
      prisma.schedule.count({ where }),
      prisma.schedule.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: records.map(mapSchedule),
      total,
      page,
      pageSize,
    };
  }

  /** Returns a single schedule by ID. */
  async getSchedule(id: string): Promise<Schedule> {
    const record = await prisma.schedule.findUniqueOrThrow({ where: { id } });
    return mapSchedule(record);
  }

  /** Returns the run history for a schedule (most recent first). */
  async getScheduleRuns(
    scheduleId: string,
    page = 1,
    pageSize = 20,
  ): Promise<ScheduleRunListResponse> {
    const skip = (page - 1) * pageSize;

    const [total, records] = await Promise.all([
      prisma.scheduleRun.count({ where: { scheduleId } }),
      prisma.scheduleRun.findMany({
        where: { scheduleId },
        skip,
        take: pageSize,
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    return {
      data: records.map((r) => ({
        id: r.id,
        scheduleId: r.scheduleId,
        status: r.status.toLowerCase() as ScheduleRunListResponse['data'][number]['status'],
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt?.toISOString(),
        errorMessage: r.errorMessage ?? undefined,
        jobId: r.jobId ?? undefined,
        attempt: r.attempt,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      scheduleId,
    };
  }

  // --------------------------------------------------------------------------
  // Run lifecycle (called by the worker via API callback or directly)
  // --------------------------------------------------------------------------

  /** Creates a ScheduleRun record and marks the schedule as RUNNING. */
  async startRun(scheduleId: string, jobId: string, attempt = 1): Promise<string> {
    const run = await prisma.scheduleRun.create({
      data: {
        scheduleId,
        status: RunStatus.RUNNING,
        jobId,
        attempt,
      },
    });

    await prisma.schedule.update({
      where: { id: scheduleId },
      data: { lastRunAt: new Date() },
    });

    return run.id;
  }

  /** Marks a ScheduleRun as complete and updates the schedule's last run status. */
  async completeRun(
    runId: string,
    status: 'success' | 'failed' | 'cancelled',
    errorMessage?: string,
  ): Promise<void> {
    const run = await prisma.scheduleRun.update({
      where: { id: runId },
      data: {
        status: status.toUpperCase() as RunStatus,
        completedAt: new Date(),
        errorMessage,
      },
    });

    const nextRunAt = await this.recalculateNextRunAt(run.scheduleId);

    await prisma.schedule.update({
      where: { id: run.scheduleId },
      data: {
        lastRunStatus: status.toUpperCase() as RunStatus,
        nextRunAt,
      },
    });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async recalculateNextRunAt(scheduleId: string): Promise<Date | null> {
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!schedule || schedule.status !== ScheduleStatus.ACTIVE) return null;
    return getNextRunTime(schedule.cronExpression, schedule.timezone);
  }

  /**
   * Registers (or replaces) a BullMQ repeating job for the given schedule.
   * Uses `upsertJobScheduler` (BullMQ v5) for idempotent creation.
   */
  private async registerRepeatJob(
    scheduleId: string,
    projectId: string,
    opts: {
      cronExpression: string;
      timezone: string;
      retryAttempts: number;
      retryDelay: number;
    },
  ): Promise<void> {
    const queue = this.getQueue();
    const schedulerId = `sched-${scheduleId}`;

    const jobData: Omit<ScheduledTestJobData, 'runId'> = {
      scheduleId,
      projectId,
      attempt: 1,
    };

    // BullMQ v5: upsertJobScheduler creates/updates a repeating job scheduler
    await (queue as QueueWithScheduler).upsertJobScheduler(
      schedulerId,
      { pattern: opts.cronExpression, tz: opts.timezone },
      {
        name: 'scheduled-test',
        data: jobData,
        opts: {
          attempts: opts.retryAttempts,
          backoff: { type: 'exponential', delay: opts.retryDelay },
        },
      },
    );
  }

  /**
   * Removes the BullMQ repeating job for the given schedule.
   * Gracefully handles the case where the job does not exist.
   */
  private async removeRepeatJob(
    scheduleId: string,
    _cronExpression: string,
    _timezone: string,
  ): Promise<void> {
    const queue = this.getQueue();
    const schedulerId = `sched-${scheduleId}`;

    try {
      await (queue as QueueWithScheduler).removeJobScheduler(schedulerId);
    } catch {
      // Job scheduler may not exist if this is a first-time cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// Type augmentation for BullMQ v5 upsertJobScheduler / removeJobScheduler
// ---------------------------------------------------------------------------
interface RepeatOpts {
  pattern: string;
  tz?: string;
}

interface JobSchedulerTemplate {
  name: string;
  data?: unknown;
  opts?: {
    attempts?: number;
    backoff?: { type: string; delay: number };
  };
}

interface QueueWithScheduler extends Queue {
  upsertJobScheduler(
    schedulerId: string,
    repeat: RepeatOpts,
    template?: JobSchedulerTemplate,
  ): Promise<unknown>;
  removeJobScheduler(schedulerId: string): Promise<boolean>;
}

/** Singleton instance used by route handlers. */
export const schedulerService = new SchedulerService();
