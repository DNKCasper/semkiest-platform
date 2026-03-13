import { AsanaClient } from './client';
import {
  AsanaConfig,
  AsanaStory,
  SectionMapping,
  StatusMapping,
  TestResult,
} from './types';

/**
 * Synchronises SemkiEst test results back to Asana by:
 * - Updating task status (moving to sections or updating custom fields)
 * - Posting formatted test-result comments as Asana stories
 * - Marking tasks complete/incomplete based on outcome
 */
export class AsanaStatusSync {
  private readonly client: AsanaClient;

  constructor(config: AsanaConfig) {
    this.client = new AsanaClient(config);
  }

  /**
   * Moves a task into the given section (status column) within its project.
   */
  async updateTaskStatus(taskId: string, sectionId: string): Promise<void> {
    await this.client.post(`/sections/${sectionId}/addTask`, { task: taskId });
  }

  /**
   * Sets the `completed` flag on a task.
   */
  async completeTask(taskId: string, completed = true): Promise<void> {
    await this.client.put(`/tasks/${taskId}`, { completed });
  }

  /**
   * Updates a single custom field enum value on a task.
   *
   * @param taskId - GID of the Asana task to update.
   * @param customFieldId - GID of the custom field to set.
   * @param enumValueId - GID of the enum value to assign.
   */
  async updateCustomField(
    taskId: string,
    customFieldId: string,
    enumValueId: string,
  ): Promise<void> {
    await this.client.put(`/tasks/${taskId}`, {
      custom_fields: { [customFieldId]: enumValueId },
    });
  }

  /**
   * Posts a formatted test-result comment to a task's story feed.
   *
   * @returns The newly created Asana story object.
   */
  async addTestResultComment(taskId: string, result: TestResult): Promise<AsanaStory> {
    const text = this.formatTestResultComment(result);
    return this.client.post<AsanaStory>(`/tasks/${taskId}/stories`, { text });
  }

  /**
   * Applies all side effects for a completed test run:
   * 1. Posts a comment with the full result.
   * 2. Moves the task to the matching section (if a mapping exists).
   * 3. Marks the task complete when the test passed.
   *
   * @param taskId - Asana task GID to update.
   * @param result - The test outcome.
   * @param statusMappings - Unused here but passed for future custom-field mapping.
   * @param sectionMappings - Maps test status strings to Asana section GIDs.
   */
  async syncTestResult(
    taskId: string,
    result: TestResult,
    statusMappings: StatusMapping[],
    sectionMappings?: Array<{ testStatus: string; sectionId: string }>,
  ): Promise<void> {
    // Always post a comment — fire in parallel with any status update.
    const ops: Promise<unknown>[] = [this.addTestResultComment(taskId, result)];

    const sectionMapping = sectionMappings?.find(
      (m) => m.testStatus === result.status,
    );
    if (sectionMapping) {
      ops.push(this.updateTaskStatus(taskId, sectionMapping.sectionId));
    }

    if (result.status === 'passed') {
      ops.push(this.completeTask(taskId, true));
    }

    await Promise.all(ops);

    // Suppress the unused-variable lint warning for statusMappings while keeping
    // it in the signature for future custom-field support.
    void statusMappings;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a human-readable, Markdown-compatible comment for an Asana task.
   */
  private formatTestResultComment(result: TestResult): string {
    const statusEmoji: Record<TestResult['status'], string> = {
      passed: '✅',
      failed: '❌',
      skipped: '⏭️',
      pending: '⏳',
    };

    const lines: string[] = [
      `${statusEmoji[result.status]} Test Result: ${result.status.toUpperCase()}`,
      '',
      `Test: ${result.testName}`,
      `Status: ${result.status}`,
      `Timestamp: ${result.timestamp.toISOString()}`,
    ];

    if (result.duration !== undefined) {
      lines.push(`Duration: ${result.duration}ms`);
    }
    if (result.projectId) {
      lines.push(`Project: ${result.projectId}`);
    }
    if (result.runId) {
      lines.push(`Run ID: ${result.runId}`);
    }
    if (result.error) {
      lines.push('', 'Error:', '---', result.error);
    }

    return lines.join('\n');
  }
}
