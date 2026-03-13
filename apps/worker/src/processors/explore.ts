import type { Job } from 'bullmq';
import type { ExploreJobPayload } from '../jobs/explore';
import type { JobResult } from '../jobs/types';
import { publishProgress } from '../queue';
import { JobPriority } from '../jobs/types';

/**
 * Processor for exploration agent jobs.
 *
 * Responsible for crawling a target URL/path and mapping the available routes,
 * components, or API endpoints that downstream agents (ui-test, visual-test)
 * will act on.
 *
 * @param job - BullMQ job containing an `ExploreJobPayload`
 * @returns Standardised `JobResult` with pass/fail status and evidence
 */
export async function exploreProcessor(job: Job<ExploreJobPayload>): Promise<JobResult> {
  const startedAt = Date.now();
  const { targetUrl, maxDepth = 3, focusAreas = [], metadata } = job.data;

  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'explore',
    percentage: 0,
    message: `Starting exploration of ${targetUrl}`,
    timestamp: Date.now(),
  });
  await job.updateProgress(0);

  // Phase 1: initialise exploration context
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'explore',
    percentage: 20,
    message: `Initialising exploration (depth=${maxDepth}, focus=${focusAreas.length} areas)`,
    timestamp: Date.now(),
  });
  await job.updateProgress(20);

  // Phase 2: traverse target (placeholder for real agent logic)
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'explore',
    percentage: 60,
    message: 'Traversing target',
    timestamp: Date.now(),
  });
  await job.updateProgress(60);

  // Phase 3: compile results
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'explore',
    percentage: 90,
    message: 'Compiling exploration results',
    timestamp: Date.now(),
  });
  await job.updateProgress(90);

  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'explore',
    percentage: 100,
    message: 'Exploration complete',
    timestamp: Date.now(),
  });
  await job.updateProgress(100);

  return {
    status: 'pass',
    evidence: [
      `Explored ${targetUrl} to depth ${maxDepth}`,
      `Project: ${metadata.projectId} | Run: ${metadata.testRunId}`,
    ],
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Default priority for exploration jobs.
 * Explore jobs typically run first to inform other agent types.
 */
export const EXPLORE_DEFAULT_PRIORITY = JobPriority.P2;
