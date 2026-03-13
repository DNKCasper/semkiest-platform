/**
 * GitHub PR status check integration for SemkiEst.
 *
 * Uses the GitHub Commit Statuses REST API to attach pass/fail indicators
 * to commits and report them in the PR checks UI.
 *
 * @see https://docs.github.com/en/rest/commits/statuses
 */

import type { PRCheckOptions, PRCommentOptions } from './types.js';

const GITHUB_API_URL = 'https://api.github.com';
const DEFAULT_CHECK_CONTEXT = 'semkiest/test-run';
const USER_AGENT = 'semkiest-github-integration/1.0.0';
const MAX_DESCRIPTION_LENGTH = 140;

/** Shape of the GitHub commit status create/update request body */
interface GitHubCommitStatusBody {
  state: string;
  context: string;
  description: string;
  target_url?: string;
}

/**
 * Creates a GitHub commit status check on the specified commit SHA.
 *
 * This attaches a status (pending/success/failure/error) to a commit,
 * which surfaces as a check in the PR UI with an optional link to a report.
 *
 * @throws {Error} If the GitHub API returns a non-2xx response
 */
export async function createCommitStatus(options: PRCheckOptions): Promise<void> {
  const {
    token,
    owner,
    repo,
    commitSha,
    state,
    description,
    targetUrl,
    context = DEFAULT_CHECK_CONTEXT,
  } = options;

  const url = `${GITHUB_API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/statuses/${encodeURIComponent(commitSha)}`;

  const body: GitHubCommitStatusBody = {
    state,
    context,
    description: description.slice(0, MAX_DESCRIPTION_LENGTH),
  };

  if (targetUrl) {
    body.target_url = targetUrl;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create commit status: HTTP ${response.status} - ${errorText}`,
    );
  }
}

/**
 * Posts a Markdown comment on a GitHub Pull Request.
 *
 * Used to surface detailed test summaries and report links directly
 * in the PR conversation thread.
 *
 * @throws {Error} If the GitHub API returns a non-2xx response
 */
export async function postPRComment(options: PRCommentOptions): Promise<void> {
  const { token, owner, repo, prNumber, body } = options;

  const url = `${GITHUB_API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${prNumber}/comments`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to post PR comment: HTTP ${response.status} - ${errorText}`,
    );
  }
}
