/**
 * Jira REST API v3 client.
 *
 * Handles authentication via Basic auth (email + API token) and provides
 * typed wrappers for the Jira REST API endpoints used by this integration.
 */

export interface JiraClientConfig {
  /** Jira instance base URL, e.g. https://yourorg.atlassian.net */
  baseUrl: string;
  /** Atlassian account email */
  email: string;
  /** Jira API token generated from id.atlassian.com */
  apiToken: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: JiraIssueFields;
}

export interface JiraIssueFields {
  summary: string;
  description: JiraDocument | null;
  status: JiraStatus;
  issuetype: JiraIssueType;
  project: JiraProject;
  assignee: JiraUser | null;
  reporter: JiraUser | null;
  priority: JiraPriority | null;
  labels: string[];
  /** Acceptance criteria custom field (commonly customfield_10016 or similar) */
  [customField: string]: unknown;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    name: string;
  };
}

export interface JiraIssueType {
  id: string;
  name: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraPriority {
  id: string;
  name: string;
}

/** Atlassian Document Format (ADF) root node */
export interface JiraDocument {
  version: number;
  type: 'doc';
  content: JiraDocNode[];
}

export interface JiraDocNode {
  type: string;
  content?: JiraDocNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

export interface JiraAddCommentResponse {
  id: string;
  self: string;
  body: JiraDocument;
  created: string;
}

export class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: JiraClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/rest/api/3${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw new JiraApiError(
        `Jira API error ${response.status}: ${response.statusText}`,
        response.status,
        body,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  /** Retrieve a Jira issue by key or ID. */
  async getIssue(issueKeyOrId: string, fields?: string[]): Promise<JiraIssue> {
    const params = fields ? `?fields=${fields.join(',')}` : '';
    return this.request<JiraIssue>(`/issue/${issueKeyOrId}${params}`);
  }

  /** List available transitions for a Jira issue. */
  async getTransitions(issueKeyOrId: string): Promise<JiraTransition[]> {
    const response = await this.request<JiraTransitionsResponse>(
      `/issue/${issueKeyOrId}/transitions`,
    );
    return response.transitions;
  }

  /** Transition a Jira issue to a new status. */
  async transitionIssue(issueKeyOrId: string, transitionId: string): Promise<void> {
    await this.request<void>(`/issue/${issueKeyOrId}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }

  /**
   * Add a comment to a Jira issue.
   * @param body Atlassian Document Format content
   */
  async addComment(issueKeyOrId: string, body: JiraDocument): Promise<JiraAddCommentResponse> {
    return this.request<JiraAddCommentResponse>(`/issue/${issueKeyOrId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  /** Retrieve a Jira project by key or ID. */
  async getProject(projectKeyOrId: string): Promise<JiraProject> {
    return this.request<JiraProject>(`/project/${projectKeyOrId}`);
  }
}
