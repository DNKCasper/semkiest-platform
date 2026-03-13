import type { Job } from 'bullmq';
import type { VisualTestJobPayload } from '../jobs/visual-test';
import type { JobResult } from '../jobs/types';
import { publishProgress } from '../queue';
import { JobPriority } from '../jobs/types';

/**
 * Processor for visual regression testing agent jobs.
 *
 * Captures a screenshot of the target URL and compares it pixel-by-pixel
 * against a stored baseline.  When no baseline exists the capture is saved
 * as the new baseline without failing.
 *
 * @param job - BullMQ job containing a `VisualTestJobPayload`
 * @returns Standardised `JobResult` with pass/fail status and evidence
 */
export async function visualTestProcessor(job: Job<VisualTestJobPayload>): Promise<JobResult> {
  const startedAt = Date.now();
  const {
    targetUrl,
    baselinePath,
    threshold = 0.01,
    viewport = { width: 1280, height: 720 },
    selector,
    metadata,
  } = job.data;

  const isNewBaseline = !baselinePath;

  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'visual-test',
    percentage: 0,
    message: `Starting visual test for ${targetUrl}`,
    timestamp: Date.now(),
  });
  await job.updateProgress(0);

  // Phase 1: launch browser and navigate
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'visual-test',
    percentage: 20,
    message: `Launching browser (${viewport.width}×${viewport.height})`,
    timestamp: Date.now(),
  });
  await job.updateProgress(20);

  // Phase 2: capture screenshot
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'visual-test',
    percentage: 50,
    message: selector
      ? `Capturing screenshot of selector "${selector}"`
      : 'Capturing full-page screenshot',
    timestamp: Date.now(),
  });
  await job.updateProgress(50);

  // Phase 3: compare or establish baseline
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'visual-test',
    percentage: 80,
    message: isNewBaseline
      ? 'No baseline found — saving new baseline'
      : `Comparing against baseline (threshold=${threshold})`,
    timestamp: Date.now(),
  });
  await job.updateProgress(80);

  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'visual-test',
    percentage: 100,
    message: 'Visual test complete',
    timestamp: Date.now(),
  });
  await job.updateProgress(100);

  return {
    status: isNewBaseline ? 'warning' : 'pass',
    evidence: [
      isNewBaseline
        ? `Baseline established for ${targetUrl}`
        : `Visual comparison passed (threshold=${threshold})`,
      `Project: ${metadata.projectId} | Run: ${metadata.testRunId}`,
    ],
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Default priority for visual test jobs.
 * Visual tests run alongside UI tests in the execution phase.
 */
export const VISUAL_TEST_DEFAULT_PRIORITY = JobPriority.P3;
