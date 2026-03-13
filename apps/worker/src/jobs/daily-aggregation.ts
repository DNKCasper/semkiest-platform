/**
 * Daily Aggregation BullMQ Job (SEM-96)
 *
 * Triggered once per day (via a repeatable job or external scheduler).
 * Calls the Quality Trends API endpoint to aggregate metrics for all active
 * projects, then triggers the data retention policy cleanup.
 *
 * Job name:    daily-aggregation
 * Queue name:  quality-metrics
 * Schedule:    Every day at 01:00 UTC (configured in registerDailyAggregationSchedule)
 */

import { Worker, Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import prisma from '@semkiest/db';

// ─── Job Payload ──────────────────────────────────────────────────────────────

export interface DailyAggregationJobData {
  /** ISO date string (YYYY-MM-DD) for the day to aggregate. Defaults to yesterday. */
  targetDate?: string;
  /** IANA timezone for metric bucketing. Defaults to "UTC". */
  timezone?: string;
  /** If true, also run the data retention cleanup after aggregation. */
  applyRetention?: boolean;
}

export interface ProjectAggregationResult {
  projectId: string;
  aggregated: boolean;
  alertsCreated: number;
  error?: string;
}

export interface DailyAggregationJobResult {
  targetDate: string;
  timezone: string;
  projectResults: ProjectAggregationResult[];
  retentionResult?: { rawRunsDeleted: number; aggregatedMetricsDeleted: number };
  processedAt: string;
}

// ─── Queue & Worker Names ─────────────────────────────────────────────────────

export const QUALITY_METRICS_QUEUE = 'quality-metrics';
export const DAILY_AGGREGATION_JOB = 'daily-aggregation';

// ─── API Client Helpers ───────────────────────────────────────────────────────

function getApiBaseUrl(): string {
  const url = process.env['API_BASE_URL'];
  if (url === undefined || url === '') {
    throw new Error('API_BASE_URL environment variable is not set');
  }
  return url.replace(/\/$/, '');
}

function getInternalApiKey(): string {
  return process.env['INTERNAL_API_KEY'] ?? '';
}

async function callApiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-api-key': getInternalApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API call to ${path} failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

// ─── Job Processor ────────────────────────────────────────────────────────────

/**
 * Processes a daily aggregation job by calling the Quality Trends API for
 * each project, then optionally triggering the retention policy.
 */
export async function processDailyAggregation(
  job: Job<DailyAggregationJobData, DailyAggregationJobResult>,
): Promise<DailyAggregationJobResult> {
  const timezone = job.data.timezone ?? 'UTC';
  const applyRetentionFlag = job.data.applyRetention ?? true;

  // Default: aggregate for yesterday to ensure all runs have completed
  let targetDate: string;
  if (job.data.targetDate !== undefined) {
    targetDate = job.data.targetDate;
  } else {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    targetDate = yesterday.toISOString().slice(0, 10);
  }

  await job.updateProgress(10);

  // Fetch all project IDs via DB (worker has direct DB access)
  const projects = await prisma.project.findMany({ select: { id: true } });

  await job.updateProgress(20);

  // Aggregate each project via the API
  const projectResults: ProjectAggregationResult[] = [];
  const total = projects.length;

  for (let i = 0; i < total; i++) {
    const project = projects[i];
    if (project === undefined) continue;

    try {
      const result = await callApiPost<ProjectAggregationResult>(
        `/api/quality-trends/${project.id}/aggregate`,
        { date: targetDate, timezone },
      );
      projectResults.push(result);
    } catch (err) {
      projectResults.push({
        projectId: project.id,
        aggregated: false,
        alertsCreated: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const progress = 20 + Math.round(((i + 1) / total) * 60);
    await job.updateProgress(progress);
  }

  await job.updateProgress(80);

  // Trigger retention cleanup
  let retentionResult:
    | { rawRunsDeleted: number; aggregatedMetricsDeleted: number }
    | undefined;

  if (applyRetentionFlag) {
    try {
      retentionResult = await callApiPost<{
        rawRunsDeleted: number;
        aggregatedMetricsDeleted: number;
      }>('/api/quality-trends/retention', {});
    } catch (err) {
      console.warn('[daily-aggregation] Retention policy call failed:', err);
    }
  }

  await job.updateProgress(100);

  return {
    targetDate,
    timezone,
    projectResults,
    retentionResult,
    processedAt: new Date().toISOString(),
  };
}

// ─── Worker Factory ───────────────────────────────────────────────────────────

/**
 * Creates and returns a BullMQ Worker for the quality-metrics queue.
 */
export function createDailyAggregationWorker(
  connection: Redis,
  concurrency: number = 1,
): Worker<DailyAggregationJobData, DailyAggregationJobResult> {
  const worker = new Worker<DailyAggregationJobData, DailyAggregationJobResult>(
    QUALITY_METRICS_QUEUE,
    processDailyAggregation,
    { connection, concurrency },
  );

  worker.on('completed', (job, result) => {
    const succeeded = result.projectResults.filter((r) => r.aggregated).length;
    const failed = result.projectResults.filter((r) => r.error !== undefined).length;
    console.info(
      `[${DAILY_AGGREGATION_JOB}] Job ${job.id} completed for ${result.targetDate}. ` +
        `Projects: ${succeeded} aggregated, ${failed} failed.`,
    );
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[${DAILY_AGGREGATION_JOB}] Job ${job?.id ?? 'unknown'} failed: ${err.message}`,
    );
  });

  return worker;
}

// ─── Repeatable Job Registration ──────────────────────────────────────────────

/**
 * Registers (or updates) the daily aggregation repeatable job.
 * Should be called once at worker startup.
 * Runs at 01:00 UTC every day.
 */
export async function registerDailyAggregationSchedule(
  connection: Redis,
): Promise<void> {
  const queue = new Queue<DailyAggregationJobData>(QUALITY_METRICS_QUEUE, {
    connection,
  });

  await queue.upsertJobScheduler(
    DAILY_AGGREGATION_JOB,
    { pattern: '0 1 * * *' }, // 01:00 UTC daily
    {
      name: DAILY_AGGREGATION_JOB,
      data: { timezone: 'UTC', applyRetention: true },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    },
  );

  await queue.close();
}
