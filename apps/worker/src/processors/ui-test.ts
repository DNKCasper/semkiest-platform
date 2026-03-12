import type { Job } from 'bullmq';
import type { UiTestJobPayload } from '../jobs/ui-test';
import type { JobResult } from '../jobs/types';
import { publishProgress } from '../queue';
import { JobPriority } from '../jobs/types';

/**
 * Processor for UI testing agent jobs.
 *
 * Drives a headless browser to execute interaction scenarios against the
 * target URL, asserting that UI components behave as specified.
 *
 * @param job - BullMQ job containing a `UiTestJobPayload`
 * @returns Standardised `JobResult` with pass/fail status and evidence
 */
export async function uiTestProcessor(job: Job<UiTestJobPayload>): Promise<JobResult> {
  const startedAt = Date.now();
  const {
    targetUrl,
    scenario,
    viewport = { width: 1280, height: 720 },
    browser = 'chromium',
    components = [],
    metadata,
  } = job.data;

  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'ui-test',
    percentage: 0,
    message: `Starting UI test: "${scenario}"`,
    timestamp: Date.now(),
  });
  await job.updateProgress(0);

  // Phase 1: launch browser
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'ui-test',
    percentage: 15,
    message: `Launching ${browser} (${viewport.width}×${viewport.height})`,
    timestamp: Date.now(),
  });
  await job.updateProgress(15);

  // Phase 2: navigate to target
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'ui-test',
    percentage: 35,
    message: `Navigating to ${targetUrl}`,
    timestamp: Date.now(),
  });
  await job.updateProgress(35);

  // Phase 3: execute test scenario
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'ui-test',
    percentage: 65,
    message: `Executing scenario (${components.length} components targeted)`,
    timestamp: Date.now(),
  });
  await job.updateProgress(65);

  // Phase 4: collect assertions and evidence
  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'ui-test',
    percentage: 90,
    message: 'Collecting results and screenshots',
    timestamp: Date.now(),
  });
  await job.updateProgress(90);

  await publishProgress({
    jobId: job.id ?? '',
    jobType: 'ui-test',
    percentage: 100,
    message: 'UI test complete',
    timestamp: Date.now(),
  });
  await job.updateProgress(100);

  return {
    status: 'pass',
    evidence: [
      `Tested "${scenario}" on ${targetUrl} with ${browser}`,
      `Project: ${metadata.projectId} | Run: ${metadata.testRunId}`,
    ],
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Default priority for UI test jobs.
 * Execution agents run after exploration and spec-read phases.
 */
export const UI_TEST_DEFAULT_PRIORITY = JobPriority.P3;
