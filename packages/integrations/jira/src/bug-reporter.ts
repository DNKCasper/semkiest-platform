import { JiraClient } from './jira-client';
import {
  mapSeverityToPriority,
  buildBugLabels,
  buildIssueSummary,
} from './field-mapper';
import { attachScreenshotToIssue } from './attachment-handler';
import type {
  AdfDocument,
  CreateBugReportOptions,
  CreateBugReportResult,
  JiraClientConfig,
  TestFailure,
} from './types';

/**
 * Builds an Atlassian Document Format (ADF) description for a bug ticket.
 *
 * The description includes:
 *  - Error message
 *  - Steps to reproduce (if provided)
 *  - Stack trace (if provided)
 *  - Browser / viewport information (if provided)
 *  - Environment metadata (if provided)
 *  - Failure timestamp (if provided)
 *
 * @param failure - Test failure data.
 * @returns ADF document ready to be sent to Jira.
 */
export function buildBugDescription(failure: TestFailure): AdfDocument {
  const content: AdfDocument['content'] = [];

  // Error summary heading
  content.push(JiraClient.buildAdfHeading('Error Details', 3));
  content.push(JiraClient.buildAdfParagraph(failure.errorMessage));

  // Steps to reproduce
  if (failure.stepsToReproduce?.length) {
    content.push(JiraClient.buildAdfHeading('Steps to Reproduce', 3));
    content.push(JiraClient.buildAdfBulletList(failure.stepsToReproduce));
  }

  // Stack trace
  if (failure.stackTrace) {
    content.push(JiraClient.buildAdfHeading('Stack Trace', 3));
    content.push(JiraClient.buildAdfCodeBlock(failure.stackTrace));
  }

  // Browser / Viewport information
  const envLines: string[] = [];
  if (failure.browser) envLines.push(`Browser: ${failure.browser}`);
  if (failure.viewport) {
    envLines.push(`Viewport: ${failure.viewport.width}×${failure.viewport.height}`);
  }
  if (failure.failedAt) envLines.push(`Failed at: ${failure.failedAt}`);

  if (envLines.length > 0) {
    content.push(JiraClient.buildAdfHeading('Environment', 3));
    content.push(JiraClient.buildAdfBulletList(envLines));
  }

  // Extra environment metadata
  if (failure.environment && Object.keys(failure.environment).length > 0) {
    const metaLines = Object.entries(failure.environment).map(
      ([key, value]) => `${key}: ${value}`,
    );
    content.push(JiraClient.buildAdfHeading('Test Metadata', 3));
    content.push(JiraClient.buildAdfBulletList(metaLines));
  }

  // Screenshot reference note (shown even before the attachment is uploaded)
  if (failure.screenshotUrl) {
    content.push(JiraClient.buildAdfHeading('Evidence', 3));
    content.push(
      JiraClient.buildAdfParagraph(
        'Screenshot evidence attached. See attachments for visual context.',
      ),
    );
  }

  // Test identifier
  content.push(JiraClient.buildAdfHeading('Test Reference', 3));
  content.push(
    JiraClient.buildAdfParagraph(`Test ID: ${failure.id}\nTest Name: ${failure.testName}`),
  );

  return { version: 1, type: 'doc', content };
}

/**
 * High-level helper that ties together Jira issue creation, attachment
 * uploads, and issue linking for a set of test failures.
 *
 * Usage:
 * ```ts
 * const reporter = new BugReporter({ baseUrl, email, apiToken });
 * const result = await reporter.createBugReport({
 *   projectKey: 'SEM',
 *   failure: myTestFailure,
 *   relatedFailures: [otherFailure],
 * });
 * console.log(result.issueKey); // e.g. "SEM-42"
 * ```
 */
export class BugReporter {
  private readonly client: JiraClient;

  constructor(config: JiraClientConfig) {
    this.client = new JiraClient(config);
  }

  /**
   * Creates a Jira bug ticket from a SemkiEst test failure.
   *
   * Steps:
   * 1. Map severity to Jira priority.
   * 2. Build ADF description.
   * 3. Create the primary Jira issue.
   * 4. Upload screenshot attachment (if a screenshot URL is provided).
   * 5. Create linked issues for each related failure and link them.
   *
   * @param options - Configuration for the bug report.
   * @returns Result containing the issue key, URL, linked keys, and attachment count.
   */
  async createBugReport(options: CreateBugReportOptions): Promise<CreateBugReportResult> {
    const { projectKey, failure, relatedFailures = [], labels, assigneeAccountId } = options;

    const priority = mapSeverityToPriority(failure.severity);
    const summary = buildIssueSummary(failure.testName, failure.severity);
    const description = buildBugDescription(failure);
    const bugLabels = buildBugLabels(failure.severity, labels);

    // 1. Create the primary issue.
    const primaryIssue = await this.client.createIssue({
      projectKey,
      summary,
      description,
      issueType: 'Bug',
      priority,
      labels: bugLabels,
      assigneeAccountId,
    });

    const issueKey = primaryIssue.key;
    const issueUrl = `${primaryIssue.self.split('/rest/')[0]}/browse/${issueKey}`;

    // 2. Attach screenshot to the primary issue.
    let attachmentsUploaded = 0;
    if (failure.screenshotUrl) {
      const result = await attachScreenshotToIssue(
        this.client,
        issueKey,
        failure.screenshotUrl,
      );
      if (result.success) attachmentsUploaded += 1;
    }

    // 3. Create linked issues for related failures and link them back to the primary.
    const linkedIssueKeys: string[] = [];

    for (const related of relatedFailures) {
      const relatedIssue = await this.createRelatedIssue(projectKey, related, bugLabels);
      linkedIssueKeys.push(relatedIssue.key);

      // Attach screenshot for related failure.
      if (related.screenshotUrl) {
        const attachResult = await attachScreenshotToIssue(
          this.client,
          relatedIssue.key,
          related.screenshotUrl,
        );
        if (attachResult.success) attachmentsUploaded += 1;
      }

      // Link related issue to the primary one.
      await this.client.linkIssues(issueKey, relatedIssue.key, 'Relates');
    }

    return {
      issueKey,
      issueUrl,
      linkedIssueKeys,
      attachmentsUploaded,
    };
  }

  /**
   * Creates a secondary issue for a related failure and links it to the primary.
   *
   * @param projectKey - Jira project key.
   * @param failure - Related test failure.
   * @param labels - Labels to apply.
   * @returns The created Jira issue.
   */
  private async createRelatedIssue(
    projectKey: string,
    failure: TestFailure,
    labels: string[],
  ) {
    const priority = mapSeverityToPriority(failure.severity);
    const summary = buildIssueSummary(failure.testName, failure.severity);
    const description = buildBugDescription(failure);

    return this.client.createIssue({
      projectKey,
      summary,
      description,
      issueType: 'Bug',
      priority,
      labels,
    });
  }

  /**
   * Adds a comment to an existing Jira issue describing an additional test failure.
   * Useful when the same test fails again and you want to update an existing ticket.
   *
   * @param issueKey - Existing Jira issue key, e.g. "SEM-42".
   * @param failure - New test failure data to append as a comment.
   */
  async addFailureComment(issueKey: string, failure: TestFailure): Promise<void> {
    const description = buildBugDescription(failure);
    await this.client.addComment(issueKey, { body: description });

    if (failure.screenshotUrl) {
      await attachScreenshotToIssue(this.client, issueKey, failure.screenshotUrl);
    }
  }
}
