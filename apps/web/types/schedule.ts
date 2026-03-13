/**
 * Schedule domain types for the SemkiEst web dashboard.
 * These mirror @semkiest/shared-types but are kept local so the web bundle
 * does not need to depend on the shared-types package at runtime.
 */

export type ScheduleStatus = 'active' | 'paused' | 'deleted';
export type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export type ScheduleTemplateId =
  | 'hourly'
  | 'daily_smoke'
  | 'daily_regression'
  | 'weekly_regression'
  | 'monthly_full';

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

export interface ScheduleTemplateDefinition {
  id: ScheduleTemplateId;
  name: string;
  description: string;
  cronExpression: string;
  timezone: string;
}

export interface CreateScheduleInput {
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  projectId: string;
  retryAttempts?: number;
  retryDelay?: number;
  notifications?: boolean;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  cronExpression?: string;
  timezone?: string;
  retryAttempts?: number;
  retryDelay?: number;
  notifications?: boolean;
}

export interface ScheduleListResponse {
  data: Schedule[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ScheduleRunListResponse {
  data: ScheduleRun[];
  total: number;
  scheduleId: string;
}

export interface CronValidationResult {
  valid: boolean;
  error?: string;
  nextRunTimes?: string[];
}

/** Upcoming run times used to render the schedule calendar. */
export interface ScheduledEvent {
  scheduleId: string;
  scheduleName: string;
  date: Date;
  status: 'upcoming' | 'running' | 'completed' | 'failed';
}
