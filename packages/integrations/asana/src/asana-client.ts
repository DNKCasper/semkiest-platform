import type {
  AsanaAttachment,
  AsanaErrorResponse,
  AsanaProject,
  AsanaSection,
  AsanaTag,
  AsanaTask,
  Attachment,
  CreateTaskInput,
} from './types';

const ASANA_API_BASE = 'https://app.asana.com/api/1.0';

/**
 * Error thrown when the Asana REST API returns a non-2xx response.
 */
export class AsanaApiError extends Error {
  readonly statusCode: number;
  readonly errors: AsanaErrorResponse['errors'];

  constructor(
    message: string,
    statusCode: number,
    response: AsanaErrorResponse,
  ) {
    super(message);
    this.name = 'AsanaApiError';
    this.statusCode = statusCode;
    this.errors = response.errors;
  }
}

/**
 * Lightweight Asana REST API v1 client.
 *
 * Authenticates using a personal access token (PAT) via Bearer scheme.
 * Uses the Node 18+ native `fetch` API — no external HTTP dependencies required.
 *
 * @example
 * ```ts
 * const client = new AsanaClient('1/xxxxxxxx:yyyyyyyy');
 * const task = await client.createTask({ name: 'Bug: …', notes: '…', … });
 * ```
 */
export class AsanaClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new Error('AsanaClient: accessToken must not be empty');
    }
    this.accessToken = accessToken;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
  }

  /**
   * Performs a JSON request and returns the unwrapped `data` field.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${ASANA_API_BASE}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify({ data: body }) : undefined,
    });

    if (!response.ok) {
      const errorData = (await response
        .json()
        .catch(() => ({}))) as AsanaErrorResponse;
      const message =
        errorData.errors?.[0]?.message ??
        `Asana API error ${response.status}: ${response.statusText}`;
      throw new AsanaApiError(message, response.status, errorData);
    }

    const json = (await response.json()) as { data: T };
    return json.data;
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  /**
   * Creates a new task in Asana.
   *
   * @param taskData - Fields for the new task (name, notes, projects, memberships, assignee).
   */
  async createTask(taskData: CreateTaskInput): Promise<AsanaTask> {
    return this.request<AsanaTask>('POST', '/tasks', taskData);
  }

  /**
   * Retrieves a task by its GID.
   */
  async getTask(taskGid: string): Promise<AsanaTask> {
    return this.request<AsanaTask>('GET', `/tasks/${taskGid}`);
  }

  /**
   * Adds a tag to an existing task.
   */
  async addTagToTask(taskGid: string, tagGid: string): Promise<void> {
    await this.request<Record<string, never>>(
      'POST',
      `/tasks/${taskGid}/addTag`,
      { tag: tagGid },
    );
  }

  // ─── Attachments ──────────────────────────────────────────────────────────

  /**
   * Attaches a file to a task using multipart/form-data.
   * Supports screenshots, logs, HAR files, and other binary artifacts.
   *
   * @param taskGid - GID of the target task.
   * @param attachment - File data, name, and MIME type.
   */
  async addAttachment(
    taskGid: string,
    attachment: Attachment,
  ): Promise<AsanaAttachment> {
    const blob = new Blob([attachment.data], { type: attachment.mimeType });
    const formData = new FormData();
    formData.append('file', blob, attachment.name);

    const url = `${ASANA_API_BASE}/tasks/${taskGid}/attachments`;

    // Do NOT set Content-Type manually — fetch adds the multipart boundary.
    const response = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const errorData = (await response
        .json()
        .catch(() => ({}))) as AsanaErrorResponse;
      const message =
        errorData.errors?.[0]?.message ??
        `Asana API error ${response.status}: ${response.statusText}`;
      throw new AsanaApiError(message, response.status, errorData);
    }

    const json = (await response.json()) as { data: AsanaAttachment };
    return json.data;
  }

  // ─── Projects ─────────────────────────────────────────────────────────────

  /**
   * Lists all projects in a workspace.
   *
   * @param workspaceGid - GID of the Asana workspace.
   */
  async getProjects(workspaceGid: string): Promise<AsanaProject[]> {
    return this.request<AsanaProject[]>(
      'GET',
      `/projects?workspace=${encodeURIComponent(workspaceGid)}&limit=100`,
    );
  }

  /**
   * Lists all sections within a project.
   *
   * @param projectGid - GID of the Asana project.
   */
  async getSections(projectGid: string): Promise<AsanaSection[]> {
    return this.request<AsanaSection[]>(
      'GET',
      `/projects/${projectGid}/sections`,
    );
  }

  // ─── Tags ─────────────────────────────────────────────────────────────────

  /**
   * Lists all tags in a workspace.
   *
   * @param workspaceGid - GID of the Asana workspace.
   */
  async getTags(workspaceGid: string): Promise<AsanaTag[]> {
    return this.request<AsanaTag[]>(
      'GET',
      `/tags?workspace=${encodeURIComponent(workspaceGid)}&limit=100`,
    );
  }

  /**
   * Creates a new tag in a workspace.
   *
   * @param workspaceGid - GID of the Asana workspace.
   * @param name - Display name for the tag.
   * @param color - Asana colour identifier (defaults to "none").
   */
  async createTag(
    workspaceGid: string,
    name: string,
    color = 'none',
  ): Promise<AsanaTag> {
    return this.request<AsanaTag>('POST', '/tags', {
      name,
      color,
      workspace: { gid: workspaceGid },
    });
  }
}
