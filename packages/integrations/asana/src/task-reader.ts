import { AsanaClient } from './client';
import {
  AsanaConfig,
  AsanaTask,
  AsanaTaskWithSubtasks,
  ExtractedTestCase,
} from './types';

const TASK_OPT_FIELDS =
  'gid,name,notes,completed,due_on,' +
  'assignee,assignee.name,assignee.email,' +
  'projects,projects.name,' +
  'memberships,memberships.project,memberships.project.name,' +
  'memberships.section,memberships.section.name,' +
  'custom_fields,custom_fields.name,custom_fields.type,' +
  'custom_fields.enum_value,custom_fields.text_value,custom_fields.number_value,' +
  'tags,tags.name,created_at,modified_at';

const TASK_LIST_OPT_FIELDS =
  'gid,name,notes,completed,' +
  'assignee,assignee.name,' +
  'memberships,memberships.section,memberships.section.name,' +
  'custom_fields,custom_fields.name,custom_fields.enum_value,' +
  'tags,tags.name';

/**
 * Reads tasks from the Asana REST API and extracts structured test-case
 * information from task descriptions.
 */
export class AsanaTaskReader {
  private readonly client: AsanaClient;

  constructor(config: AsanaConfig) {
    this.client = new AsanaClient(config);
  }

  /**
   * Fetches a single Asana task by GID with all fields required for test-case
   * extraction.
   */
  async getTask(taskId: string): Promise<AsanaTask> {
    return this.client.get<AsanaTask>(`/tasks/${taskId}`, {
      opt_fields: TASK_OPT_FIELDS,
    });
  }

  /**
   * Fetches all tasks belonging to an Asana project.
   */
  async getProjectTasks(projectId: string): Promise<AsanaTask[]> {
    return this.client.get<AsanaTask[]>(`/projects/${projectId}/tasks`, {
      opt_fields: TASK_LIST_OPT_FIELDS,
    });
  }

  /**
   * Fetches a task together with its subtasks in a single logical operation.
   */
  async getTaskWithSubtasks(taskId: string): Promise<AsanaTaskWithSubtasks> {
    const [task, subtasks] = await Promise.all([
      this.getTask(taskId),
      this.client.get<AsanaTask[]>(`/tasks/${taskId}/subtasks`, {
        opt_fields: 'gid,name,notes,completed',
      }),
    ]);
    return { ...task, subtasks };
  }

  /**
   * Parses an Asana task and returns structured test-case information suitable
   * for automatic test-case generation.
   */
  extractTestCaseInfo(task: AsanaTask): ExtractedTestCase {
    const notes = task.notes ?? '';
    return {
      title: task.name,
      description: notes,
      steps: this.parseSteps(notes),
      expectedResult: this.parseExpectedResult(notes),
      tags: task.tags?.map((t) => t.name) ?? [],
      priority: this.determinePriority(task),
      asanaTaskId: task.gid,
      asanaTaskName: task.name,
    };
  }

  /**
   * Convenience method: fetch a task and immediately extract test-case info.
   */
  async fetchAndExtract(taskId: string): Promise<ExtractedTestCase> {
    const task = await this.getTask(taskId);
    return this.extractTestCaseInfo(task);
  }

  /**
   * Extracts all tasks from a project as structured test cases.
   */
  async extractProjectTestCases(projectId: string): Promise<ExtractedTestCase[]> {
    const tasks = await this.getProjectTasks(projectId);
    return tasks.map((task) => this.extractTestCaseInfo(task));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempts to parse ordered test steps from the task notes.
   *
   * Supports two formats:
   * 1. A labelled section (e.g. "Steps:" or "Steps to reproduce:") followed by
   *    numbered or bulleted lines.
   * 2. Top-level numbered lines anywhere in the notes.
   */
  private parseSteps(notes: string): string[] {
    // Try to find a labelled steps section first.
    const sectionMatch = notes.match(
      /(?:steps?(?:\s+to\s+reproduce)?|how\s+to\s+test)[:：]?\s*\n([\s\S]*?)(?:\n\n|(?:\n(?=\S*(?:expected|result|note|acceptance)[\s:]))|$)/i,
    );

    if (sectionMatch?.[1]) {
      return this.splitIntoSteps(sectionMatch[1]);
    }

    // Fallback: collect every numbered line in the notes.
    const numberedLines = notes.match(/^\d+\.\s+.+$/gm);
    if (numberedLines) {
      return numberedLines.map((line) => line.replace(/^\d+\.\s+/, '').trim());
    }

    return [];
  }

  private splitIntoSteps(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.replace(/^[-*•]?\s*\d*\.?\s*/, '').trim())
      .filter(Boolean);
  }

  /**
   * Attempts to parse the expected result from the task notes.
   */
  private parseExpectedResult(notes: string): string {
    const match = notes.match(
      /(?:expected\s+(?:result|behavior|outcome)|acceptance\s+criteria)[:：]?\s*\n([\s\S]*?)(?:\n\n|$)/i,
    );
    return match?.[1]?.trim() ?? '';
  }

  /**
   * Infers test priority from Asana custom fields or tag names.
   */
  private determinePriority(task: AsanaTask): 'high' | 'medium' | 'low' {
    const priorityField = task.custom_fields?.find((f) =>
      f.name.toLowerCase().includes('priority'),
    );

    if (priorityField?.enum_value) {
      const value = priorityField.enum_value.name.toLowerCase();
      if (value.includes('high') || value.includes('urgent') || value.includes('critical')) {
        return 'high';
      }
      if (value.includes('low') || value.includes('minor') || value.includes('trivial')) {
        return 'low';
      }
    }

    const tagNames = task.tags?.map((t) => t.name.toLowerCase()) ?? [];
    if (tagNames.some((n) => ['high', 'urgent', 'critical', 'p0', 'p1'].includes(n))) {
      return 'high';
    }
    if (tagNames.some((n) => ['low', 'minor', 'trivial', 'p3', 'p4'].includes(n))) {
      return 'low';
    }

    return 'medium';
  }
}
