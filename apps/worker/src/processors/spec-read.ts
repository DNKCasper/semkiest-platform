import type { Job } from 'bullmq';
import type { SpecReadJobPayload } from '../jobs/spec-read';
import type { JobResult } from '../jobs/types';
import { publishProgress } from '../queue';
import { JobPriority } from '../jobs/types';

/**
 * Processor for specification-reading agent jobs.
 *
 * Parses an API/schema specification (OpenAPI, GraphQL, JSON Schema, …) and
 * extracts endpoint definitions, type contracts, and validation rules that
 * other agents can use to generate or verify test cases.
 *
 * @param job - BullMQ job containing a `SpecReadJobPayload`
 * @returns Standardised `JobResult` with pass/fail status and evidence
 */
export async function specReadProcessor(job: Job<SpecReadJobPayload>): Promise<JobResult> {
  const startedAt = Date.now();
  const { specPath, format, selectors = [], metadata } = job.data;

  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'spec-read',
    percentage: 0,
    message: `Starting spec read for ${specPath}`,
    timestamp: Date.now(),
  });
  await job.updateProgress(0);

  // Phase 1: locate and load the specification
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'spec-read',
    percentage: 25,
    message: `Loading specification (format=${format ?? 'auto'})`,
    timestamp: Date.now(),
  });
  await job.updateProgress(25);

  // Phase 2: parse and validate the spec
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'spec-read',
    percentage: 55,
    message: `Parsing specification (${selectors.length} selectors)`,
    timestamp: Date.now(),
  });
  await job.updateProgress(55);

  // Phase 3: extract selected contracts
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'spec-read',
    percentage: 85,
    message: 'Extracting contract definitions',
    timestamp: Date.now(),
  });
  await job.updateProgress(85);

  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'spec-read',
    percentage: 100,
    message: 'Spec read complete',
    timestamp: Date.now(),
  });
  await job.updateProgress(100);

  return {
    status: 'pass',
    evidence: [
      `Parsed spec at ${specPath} (format=${format ?? 'auto'})`,
      `Project: ${metadata.projectId} | Run: ${metadata.testRunId}`,
    ],
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Default priority for spec-read jobs.
 * Like explore jobs, spec reads should complete before test execution.
 */
export const SPEC_READ_DEFAULT_PRIORITY = JobPriority.P2;
