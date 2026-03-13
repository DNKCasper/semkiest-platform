/**
 * SemkiEst API client for test run management.
 *
 * Provides functions to trigger test runs, poll for completion, and fetch
 * run status — all used during GitHub CI/CD integration workflows.
 */

import type {
  TriggerTestRunOptions,
  TriggerTestRunResponse,
  PollTestRunOptions,
  GetTestRunStatusOptions,
  TestRunResult,
} from './types.js';

const USER_AGENT = 'semkiest-github-integration/1.0.0';

/** Terminal states that indicate a test run has finished */
const TERMINAL_STATES = new Set(['passed', 'failed', 'cancelled', 'timeout']);

/**
 * Triggers a new SemkiEst test run via the platform API.
 *
 * @returns The created test run with its ID and initial status
 * @throws {Error} If the API returns a non-2xx response
 */
export async function triggerTestRun(
  options: TriggerTestRunOptions,
): Promise<TriggerTestRunResponse> {
  const { apiUrl, apiToken, request } = options;

  const url = `${apiUrl}/api/test-runs`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to trigger test run: HTTP ${response.status} - ${errorText}`,
    );
  }

  return response.json() as Promise<TriggerTestRunResponse>;
}

/**
 * Fetches the current status and result of a single test run.
 *
 * @throws {Error} If the API returns a non-2xx response
 */
export async function getTestRunStatus(
  options: GetTestRunStatusOptions,
): Promise<TestRunResult> {
  const { apiUrl, apiToken, runId } = options;

  const url = `${apiUrl}/api/test-runs/${encodeURIComponent(runId)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get test run status: HTTP ${response.status} - ${errorText}`,
    );
  }

  return response.json() as Promise<TestRunResult>;
}

/**
 * Polls the SemkiEst API at a regular interval until the test run reaches
 * a terminal state (passed, failed, cancelled, or timeout).
 *
 * @returns The final test run result once a terminal state is reached
 * @throws {Error} If the polling timeout is exceeded or the API is unreachable
 */
export async function pollTestRunToCompletion(
  options: PollTestRunOptions,
): Promise<TestRunResult> {
  const {
    apiUrl,
    apiToken,
    runId,
    intervalMs = 5_000,
    timeoutMs = 600_000,
  } = options;

  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;

    if (elapsed >= timeoutMs) {
      throw new Error(
        `Test run ${runId} did not complete within ${Math.round(timeoutMs / 1000)}s`,
      );
    }

    const result = await getTestRunStatus({ apiUrl, apiToken, runId });

    if (TERMINAL_STATES.has(result.status)) {
      return result;
    }

    await sleep(intervalMs);
  }
}

/** Resolves after the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
