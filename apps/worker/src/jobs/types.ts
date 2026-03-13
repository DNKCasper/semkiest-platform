import type { JobsOptions } from 'bullmq';

/** Agent job type identifiers */
export type AgentJobType = 'explore' | 'spec-read' | 'ui-test' | 'visual-test';

/**
 * Job priority levels.
 * P1 is the highest priority (processed first), P5 is the lowest.
 * BullMQ processes higher numeric values first.
 */
export enum JobPriority {
  P1 = 5,
  P2 = 4,
  P3 = 3,
  P4 = 2,
  P5 = 1,
}

/** Common metadata attached to every agent job */
export interface JobMetadata {
  /** Project this job belongs to */
  projectId: string;
  /** Test run this job is part of */
  testRunId: string;
  /** User or system that requested the job */
  requestedBy?: string;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
}

/** Base payload shared across all agent job types */
export interface BaseJobPayload {
  /** Contextual metadata for the job */
  metadata: JobMetadata;
  /** Scheduling priority */
  priority: JobPriority;
  /**
   * Multiplier applied to the exponential backoff base delay.
   * Useful for slowing down retries for expensive agent operations.
   * Default: 1
   */
  delayMultiplier?: number;
}

/** Standardised result schema for completed agent jobs */
export interface JobResult {
  /** Outcome of the agent run */
  status: 'pass' | 'fail' | 'warning' | 'skip';
  /** Supporting evidence (screenshots, logs, diffs, etc.) */
  evidence?: string[];
  /** Human-readable error description when status is 'fail' */
  error?: string;
  /** Wall-clock time the job took in milliseconds */
  durationMs: number;
}

/** Progress update published via Redis pub/sub */
export interface JobProgressUpdate {
  jobId: string;
  jobType: AgentJobType;
  /** 0–100 completion percentage */
  percentage: number;
  /** Optional human-readable status message */
  message?: string;
  /** Unix timestamp (ms) when this update was emitted */
  timestamp: number;
}

/** Retry policy configuration */
export interface RetryConfig {
  /** Maximum number of attempts (including the initial attempt) */
  attempts: number;
  backoff: {
    type: 'exponential' | 'fixed';
    /** Base delay in milliseconds */
    delay: number;
    /** Multiplier applied to the base delay (default: 1) */
    multiplier?: number;
  };
}

/**
 * Default retry policy: 3 attempts with exponential backoff starting at 1 s.
 * Retry schedule: 1 s → 2 s → 4 s
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
    multiplier: 1,
  },
};

/**
 * Build BullMQ job options from a priority and retry config.
 *
 * @param priority - Scheduling priority for this job
 * @param retryConfig - Override the default retry/backoff policy
 * @returns BullMQ-compatible `JobsOptions` object
 */
export function buildJobOptions(
  priority: JobPriority,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
): JobsOptions {
  const baseDelay = retryConfig.backoff.delay * (retryConfig.backoff.multiplier ?? 1);
  return {
    priority,
    attempts: retryConfig.attempts,
    backoff: {
      type: retryConfig.backoff.type,
      delay: baseDelay,
    },
    removeOnComplete: { count: 1000, age: 24 * 3600 },
    // Keep failed jobs so they can be inspected and retried manually
    removeOnFail: false,
  };
}
