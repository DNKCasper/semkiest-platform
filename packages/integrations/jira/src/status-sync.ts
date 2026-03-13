/**
 * Bidirectional status synchronisation between SemkiEst and Jira.
 *
 * Handles:
 * - Transitioning Jira issues based on test suite outcomes
 * - Posting formatted test result comments to Jira tickets
 * - Configurable delay before status updates
 */

import { JiraClient, JiraDocument } from './client.js';
import { JiraIntegrationConfig, SemTestStatus, WorkflowMapping } from './config.js';

/** A single test result within a suite. */
export interface TestResult {
  testId: string;
  testName: string;
  status: SemTestStatus;
  durationMs: number;
  errorMessage?: string;
  /** URL to the full test report for this individual test */
  reportUrl?: string;
}

/** Payload describing the outcome of a test suite run. */
export interface TestSuiteResult {
  /** Jira issue key that this suite corresponds to */
  issueKey: string;
  /** Internal SemkiEst test suite identifier */
  suiteId: string;
  /** Overall suite status derived from individual test outcomes */
  suiteStatus: SemTestStatus;
  results: TestResult[];
  /** URL to the full test report for the suite */
  reportUrl?: string;
  /** ISO 8601 timestamp when the suite run completed */
  completedAt: string;
  /** SemkiEst project ID – used to look up per-project sync settings */
  semProjectId: string;
}

/** Result of a status-sync operation. */
export interface SyncOutcome {
  issueKey: string;
  commentAdded: boolean;
  transitionApplied: boolean;
  transitionName?: string;
  scheduledDelayMs?: number;
}

// ---------------------------------------------------------------------------
// ADF helpers
// ---------------------------------------------------------------------------

function textNode(text: string): JiraDocument['content'][0] {
  return { type: 'text', text };
}

function paragraph(...texts: string[]): JiraDocument['content'][0] {
  return {
    type: 'paragraph',
    content: texts.map(textNode),
  };
}

function heading(level: number, text: string): JiraDocument['content'][0] {
  return {
    type: 'heading',
    attrs: { level },
    content: [textNode(text)],
  };
}

function bulletList(items: string[]): JiraDocument['content'][0] {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  };
}

function rule(): JiraDocument['content'][0] {
  return { type: 'rule' };
}

// ---------------------------------------------------------------------------
// Comment formatting
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<SemTestStatus, string> = {
  passed: '✅',
  failed: '❌',
  skipped: '⏭️',
  error: '💥',
};

/**
 * Build an Atlassian Document Format comment body from a test suite result.
 */
export function formatTestResultComment(result: TestSuiteResult): JiraDocument {
  const icon = STATUS_ICONS[result.suiteStatus];
  const passCount = result.results.filter((r) => r.status === 'passed').length;
  const failCount = result.results.filter((r) => r.status === 'failed').length;
  const skipCount = result.results.filter((r) => r.status === 'skipped').length;
  const total = result.results.length;

  const summaryLine = `${icon} Test suite ${result.suiteStatus.toUpperCase()} — ${passCount}/${total} passed`;

  const content: JiraDocument['content'] = [
    heading(3, 'SemkiEst Test Results'),
    paragraph(summaryLine),
    paragraph(`Suite ID: ${result.suiteId}`),
    paragraph(`Completed: ${result.completedAt}`),
    rule(),
    heading(4, 'Test Summary'),
    paragraph(`Passed: ${passCount}  |  Failed: ${failCount}  |  Skipped: ${skipCount}`),
  ];

  if (failCount > 0) {
    const failedTests = result.results
      .filter((r) => r.status === 'failed' || r.status === 'error')
      .map((r) => `${STATUS_ICONS[r.status]} ${r.testName}${r.errorMessage ? ': ' + r.errorMessage : ''}`);

    content.push(heading(4, 'Failed Tests'));
    content.push(bulletList(failedTests));
  }

  if (result.reportUrl) {
    content.push(rule());
    content.push(paragraph(`Full report: ${result.reportUrl}`));
  }

  return {
    version: 1,
    type: 'doc',
    content,
  };
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function evaluateCondition(
  condition: WorkflowMapping['condition'],
  results: TestResult[],
): boolean {
  switch (condition) {
    case 'all_pass':
      return results.length > 0 && results.every((r) => r.status === 'passed');
    case 'any_pass':
      return results.some((r) => r.status === 'passed');
    case 'any_fail':
      return results.some((r) => r.status === 'failed' || r.status === 'error');
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// StatusSync class
// ---------------------------------------------------------------------------

/**
 * Synchronises SemkiEst test results back to Jira.
 */
export class StatusSync {
  private readonly client: JiraClient;
  private readonly config: JiraIntegrationConfig;

  constructor(config: JiraIntegrationConfig) {
    this.config = config;
    this.client = new JiraClient({
      baseUrl: config.baseUrl,
      email: config.email,
      apiToken: config.apiToken,
    });
  }

  /**
   * Process a completed test suite result:
   * 1. Optionally post a formatted comment to the Jira issue.
   * 2. Optionally transition the Jira issue based on workflow mappings.
   *
   * Per-project settings (autoUpdateStatus, postResultComments, statusSyncDelayMs)
   * are read from {@link JiraIntegrationConfig.projectMappings}.
   */
  async syncResult(suiteResult: TestSuiteResult): Promise<SyncOutcome> {
    const projectMapping = this.config.projectMappings.find(
      (m) => m.semProjectId === suiteResult.semProjectId,
    );

    const outcome: SyncOutcome = {
      issueKey: suiteResult.issueKey,
      commentAdded: false,
      transitionApplied: false,
    };

    if (!projectMapping?.syncEnabled) {
      return outcome;
    }

    if (projectMapping.postResultComments) {
      await this.postResultComment(suiteResult);
      outcome.commentAdded = true;
    }

    if (projectMapping.autoUpdateStatus) {
      const delayMs = projectMapping.statusSyncDelayMs ?? 0;
      const transition = await this.resolveTransition(suiteResult);

      if (transition) {
        if (delayMs > 0) {
          outcome.scheduledDelayMs = delayMs;
          this.scheduleTransition(suiteResult.issueKey, transition.id, delayMs);
        } else {
          await this.client.transitionIssue(suiteResult.issueKey, transition.id);
          outcome.transitionApplied = true;
          outcome.transitionName = transition.name;
        }
      }
    }

    return outcome;
  }

  /** Post a formatted test result comment to the Jira issue. */
  async postResultComment(suiteResult: TestSuiteResult): Promise<void> {
    const body = formatTestResultComment(suiteResult);
    await this.client.addComment(suiteResult.issueKey, body);
  }

  /**
   * Find the first workflow mapping whose condition is satisfied by the suite
   * results and whose transition exists on the Jira issue.
   */
  private async resolveTransition(
    suiteResult: TestSuiteResult,
  ): Promise<{ id: string; name: string } | null> {
    const workflowMappings = this.config.workflowMappings.filter(
      (m) => m.semStatus === suiteResult.suiteStatus,
    );

    const applicableMappings = workflowMappings.filter((m) =>
      evaluateCondition(m.condition, suiteResult.results),
    );

    if (applicableMappings.length === 0) return null;

    const availableTransitions = await this.client.getTransitions(suiteResult.issueKey);

    for (const mapping of applicableMappings) {
      const transition = availableTransitions.find((t) => t.id === mapping.jiraTransitionId);
      if (transition) {
        return { id: transition.id, name: transition.name };
      }
    }

    return null;
  }

  /**
   * Schedule a Jira issue transition after a configurable delay.
   * Uses Node.js `setTimeout` – for production workloads consider a proper
   * job queue (e.g. BullMQ).
   */
  private scheduleTransition(issueKey: string, transitionId: string, delayMs: number): void {
    setTimeout(() => {
      this.client.transitionIssue(issueKey, transitionId).catch((err: unknown) => {
        // Delayed transitions are best-effort; log the error but don't throw.
        console.error(
          `[StatusSync] Failed to apply delayed transition for ${issueKey}:`,
          err,
        );
      });
    }, delayMs);
  }
}
