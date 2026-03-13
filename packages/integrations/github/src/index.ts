/**
 * @semkiest/github-integration
 *
 * Platform-side library for GitHub CI/CD integration.
 * Provides utilities for creating PR status checks, building test result
 * comments, and interacting with the SemkiEst test run API.
 */

export { createCommitStatus, postPRComment } from './pr-check.js';
export { buildTestSummaryComment, buildErrorComment } from './comment-builder.js';
export {
  triggerTestRun,
  getTestRunStatus,
  pollTestRunToCompletion,
} from './semkiest-client.js';
export type {
  TestRunStatus,
  TriggerSource,
  GitHubTriggerMetadata,
  TriggerTestRunRequest,
  TriggerTestRunResponse,
  TestRunSummary,
  TestRunResult,
  PRCheckOptions,
  PRCommentOptions,
  TriggerTestRunOptions,
  PollTestRunOptions,
  GetTestRunStatusOptions,
} from './types.js';
