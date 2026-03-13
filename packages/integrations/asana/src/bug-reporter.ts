import { AsanaClient } from './asana-client';
import { decryptToken } from './encryption';
import { FieldMapper } from './field-mapper';
import type {
  AsanaTag,
  AsanaTask,
  BugReporterConfig,
  FailedTestResult,
} from './types';
import type { AsanaTagColor } from './field-mapper';

/**
 * Creates Asana bug tasks from SemkiEst failed test results.
 *
 * Responsibilities:
 * - Authenticate to Asana using a PAT (plaintext or decrypted from storage)
 * - Build the task name/notes via FieldMapper
 * - Create the task in the configured project/section
 * - Apply the appropriate severity tag (created on-demand if absent)
 * - Attach screenshots and artifacts to the task
 * - Assign the task to a configured or per-test assignee
 *
 * @example
 * ```ts
 * const reporter = new BugReporter({
 *   accessToken: process.env.ASANA_PAT,
 *   workspaceGid: '123456789',
 *   projectGid: '987654321',
 * });
 *
 * await reporter.reportFailedTest({
 *   testName: 'login redirects to dashboard',
 *   suiteName: 'AuthFlow',
 *   errorMessage: 'Expected URL "/dashboard", got "/login"',
 *   severity: 'high',
 *   testRunId: 'run-abc-001',
 *   timestamp: new Date(),
 * });
 * ```
 */
export class BugReporter {
  private readonly client: AsanaClient;
  private readonly fieldMapper: FieldMapper;
  private readonly config: BugReporterConfig;

  constructor(config: BugReporterConfig) {
    const token = resolveToken(config);
    this.client = new AsanaClient(token);
    this.fieldMapper = new FieldMapper();
    this.config = config;
  }

  /**
   * Creates an Asana task for a failed test and attaches any screenshots or
   * artifacts. Returns the created task.
   *
   * @param testResult - Details of the failed test.
   */
  async reportFailedTest(testResult: FailedTestResult): Promise<AsanaTask> {
    const { severity } = testResult;
    const severityMapping = this.fieldMapper.getSeverityMapping(severity);

    const name = this.fieldMapper.formatTaskName(testResult.testName, severity);
    const notes = this.fieldMapper.formatTaskNotes({
      testName: testResult.testName,
      suiteName: testResult.suiteName,
      errorMessage: testResult.errorMessage,
      stackTrace: testResult.stackTrace,
      severity,
      testRunId: testResult.testRunId,
      timestamp: testResult.timestamp,
    });

    // Build project membership — optionally pinned to a specific section.
    const membership = buildMembership(
      this.config.projectGid,
      this.config.sectionGid,
    );

    // Per-test assignee takes precedence over the config-level default.
    const assignee = testResult.assigneeGid ?? this.config.assigneeGid;

    const task = await this.client.createTask({
      name,
      notes,
      projects: [this.config.projectGid],
      memberships: [membership],
      ...(assignee ? { assignee } : {}),
    });

    // Resolve (or lazily create) the severity tag and apply it.
    const tagGid = await this.resolveTag(
      severityMapping.tagName,
      severityMapping.tagColor,
    );
    await this.client.addTagToTask(task.gid, tagGid);

    // Attach evidence — failures are non-fatal so the task is always returned.
    await this.attachEvidence(task.gid, testResult);

    return task;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Returns the GID of an existing tag with the given name, or creates one.
   * This avoids duplicate tags across multiple bug reports.
   */
  private async resolveTag(
    name: string,
    color: AsanaTagColor,
  ): Promise<string> {
    const tags: AsanaTag[] = await this.client.getTags(
      this.config.workspaceGid,
    );
    const existing = tags.find((t) => t.name === name);
    if (existing) {
      return existing.gid;
    }
    const created = await this.client.createTag(
      this.config.workspaceGid,
      name,
      color,
    );
    return created.gid;
  }

  /**
   * Uploads all screenshots and artifacts to the task.
   * Individual upload failures are swallowed so they do not block the overall
   * report — each failure is forwarded to the optional error logger.
   */
  private async attachEvidence(
    taskGid: string,
    testResult: FailedTestResult,
  ): Promise<void> {
    const attachments = [
      ...(testResult.screenshots ?? []),
      ...(testResult.artifacts ?? []),
    ];

    for (const attachment of attachments) {
      try {
        await this.client.addAttachment(taskGid, attachment);
      } catch (err) {
        // Non-fatal: log the error but keep going to attach remaining files.
        const message =
          err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[BugReporter] Failed to attach "${attachment.name}" to task ${taskGid}: ${message}\n`,
        );
      }
    }
  }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

/**
 * Resolves the plaintext Asana access token from the reporter config.
 * Accepts either a raw token or an AES-256-GCM encrypted token + key pair.
 */
function resolveToken(config: BugReporterConfig): string {
  if (config.accessToken) {
    return config.accessToken;
  }
  if (config.encryptedToken && config.encryptionKey) {
    return decryptToken(config.encryptedToken, config.encryptionKey);
  }
  throw new Error(
    'BugReporter: provide either `accessToken` or both `encryptedToken` and `encryptionKey`.',
  );
}

/**
 * Constructs the membership object for the `createTask` call.
 */
function buildMembership(
  projectGid: string,
  sectionGid?: string,
): { project: string; section?: string } {
  return sectionGid
    ? { project: projectGid, section: sectionGid }
    : { project: projectGid };
}
