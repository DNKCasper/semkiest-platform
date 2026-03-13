/**
 * @semkiest/shared-types
 *
 * Shared TypeScript types used across the SemkiEst platform.
 * Import from this package in api, worker, and web apps.
 */

// =============================================================================
// Schedule Types (SEM-100: Cron-Based Scheduling Engine)
// =============================================================================

/** Operational status of a schedule. */
export type ScheduleStatus = 'active' | 'paused' | 'deleted';

/** Outcome of a single scheduled run. */
export type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

/** Identifiers for built-in schedule templates. */
export type ScheduleTemplateId =
  | 'hourly'
  | 'daily_smoke'
  | 'daily_regression'
  | 'weekly_regression'
  | 'monthly_full';

/** A cron-based schedule that triggers automated test runs. */
export interface Schedule {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone: string;
  projectId: string;
  status: ScheduleStatus;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: RunStatus;
  missedRuns: number;
  retryAttempts: number;
  retryDelay: number;
  notifications: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** A single execution record for a Schedule. */
export interface ScheduleRun {
  id: string;
  scheduleId: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  jobId?: string;
  attempt: number;
  createdAt: string;
}

/** Input for creating a new schedule. */
export interface CreateScheduleInput {
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  projectId: string;
  retryAttempts?: number;
  retryDelay?: number;
  notifications?: boolean;
  metadata?: Record<string, unknown>;
}

/** Input for updating an existing schedule. */
export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  cronExpression?: string;
  timezone?: string;
  retryAttempts?: number;
  retryDelay?: number;
  notifications?: boolean;
  metadata?: Record<string, unknown>;
}

/** Paginated list of schedules. */
export interface ScheduleListResponse {
  data: Schedule[];
  total: number;
  page: number;
  pageSize: number;
}

/** Paginated list of schedule run history. */
export interface ScheduleRunListResponse {
  data: ScheduleRun[];
  total: number;
  scheduleId: string;
}

/** A built-in schedule template definition. */
export interface ScheduleTemplateDefinition {
  id: ScheduleTemplateId;
  name: string;
  description: string;
  cronExpression: string;
  timezone: string;
}

/** Data payload for a BullMQ scheduled test job. */
export interface ScheduledTestJobData {
  scheduleId: string;
  projectId: string;
  runId: string;
  attempt: number;
}

/** Result produced by a completed scheduled test job. */
export interface ScheduledTestJobResult {
  runId: string;
  scheduleId: string;
  status: RunStatus;
  completedAt: string;
  errorMessage?: string;
}

/** Cron expression validation result. */
export interface CronValidationResult {
  valid: boolean;
  error?: string;
  nextRunTimes?: string[];
}

/** Query parameters for listing schedules. */
export interface ScheduleQueryParams {
  projectId?: string;
  status?: ScheduleStatus;
  page?: number;
  pageSize?: number;
}
