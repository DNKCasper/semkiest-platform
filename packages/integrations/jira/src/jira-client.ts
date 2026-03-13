import axios, { type AxiosInstance, type AxiosError } from 'axios';
import FormData from 'form-data';
import type {
  AdfDocument,
  AddCommentOptions,
  CreateIssueOptions,
  IssueLinkTypeName,
  JiraClientConfig,
  JiraIssue,
} from './types';

/** Error thrown when a Jira API call fails. */
export class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}

/**
 * Lightweight Jira REST API v3 client.
 *
 * Authenticates via HTTP Basic auth using an Atlassian API token:
 *   Authorization: Basic base64(email:apiToken)
 *
 * @example
 * ```ts
 * const client = new JiraClient({
 *   baseUrl: 'https://your-domain.atlassian.net',
 *   email: 'user@example.com',
 *   apiToken: 'MY_TOKEN',
 * });
 * const issue = await client.createIssue({ projectKey: 'SEM', summary: 'Bug', ... });
 * ```
 */
export class JiraClient {
  private readonly http: AxiosInstance;

  constructor(config: JiraClientConfig) {
    const { baseUrl, email, apiToken } = config;

    // Basic auth: base64(email:apiToken)
    const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');

    this.http = axios.create({
      baseURL: `${baseUrl.replace(/\/$/, '')}/rest/api/3`,
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
  }

  /**
   * Creates a new Jira issue.
   *
   * @returns The created issue (id, key, self).
   */
  async createIssue(options: CreateIssueOptions): Promise<JiraIssue> {
    const {
      projectKey,
      summary,
      description,
      issueType = 'Bug',
      priority,
      labels,
      assigneeAccountId,
    } = options;

    const body: Record<string, unknown> = {
      fields: {
        project: { key: projectKey },
        summary,
        description,
        issuetype: { name: issueType },
        ...(priority ? { priority: { name: priority } } : {}),
        ...(labels?.length ? { labels } : {}),
        ...(assigneeAccountId ? { assignee: { id: assigneeAccountId } } : {}),
      },
    };

    try {
      const response = await this.http.post<JiraIssue>('/issue', body);
      return response.data;
    } catch (err) {
      throw this.wrapError('Failed to create Jira issue', err);
    }
  }

  /**
   * Retrieves a Jira issue by key.
   *
   * @param issueKey - Issue key, e.g. "SEM-42".
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    try {
      const response = await this.http.get<JiraIssue>(`/issue/${issueKey}`);
      return response.data;
    } catch (err) {
      throw this.wrapError(`Failed to get Jira issue ${issueKey}`, err);
    }
  }

  /**
   * Adds a comment to an existing Jira issue.
   *
   * @param issueKey - Issue key, e.g. "SEM-42".
   * @param options - Comment options containing the ADF body.
   */
  async addComment(issueKey: string, options: AddCommentOptions): Promise<void> {
    try {
      await this.http.post(`/issue/${issueKey}/comment`, { body: options.body });
    } catch (err) {
      throw this.wrapError(`Failed to add comment to Jira issue ${issueKey}`, err);
    }
  }

  /**
   * Links two Jira issues using the specified link type.
   *
   * @param inwardIssueKey - The issue that is the "inward" end of the link.
   * @param outwardIssueKey - The issue that is the "outward" end of the link.
   * @param linkType - Human-readable link type, e.g. "Relates".
   */
  async linkIssues(
    inwardIssueKey: string,
    outwardIssueKey: string,
    linkType: IssueLinkTypeName = 'Relates',
  ): Promise<void> {
    const body = {
      type: { name: linkType },
      inwardIssue: { key: inwardIssueKey },
      outwardIssue: { key: outwardIssueKey },
    };

    try {
      await this.http.post('/issueLink', body);
    } catch (err) {
      throw this.wrapError(
        `Failed to link Jira issues ${inwardIssueKey} → ${outwardIssueKey}`,
        err,
      );
    }
  }

  /**
   * Attaches a file to a Jira issue.
   *
   * Jira requires multipart/form-data with an `X-Atlassian-Token: no-check` header
   * to bypass XSRF protection on the attachment endpoint.
   *
   * @param issueKey - Issue key, e.g. "SEM-42".
   * @param fileName - Name of the file to attach.
   * @param fileBuffer - Raw file contents.
   * @param mimeType - MIME type of the file, e.g. "image/png".
   */
  async addAttachment(
    issueKey: string,
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    const form = new FormData();
    form.append('file', fileBuffer, { filename: fileName, contentType: mimeType });

    try {
      await this.http.post(`/issue/${issueKey}/attachments`, form, {
        headers: {
          ...form.getHeaders(),
          'X-Atlassian-Token': 'no-check',
          // Override the default Content-Type so axios uses multipart
          'Content-Type': undefined,
        },
      });
    } catch (err) {
      throw this.wrapError(
        `Failed to attach file "${fileName}" to Jira issue ${issueKey}`,
        err,
      );
    }
  }

  /**
   * Searches for Jira issues using JQL.
   *
   * @param jql - A valid JQL query string.
   * @param fields - Fields to include in the response.
   * @returns Array of matching issues.
   */
  async searchIssues(
    jql: string,
    fields: string[] = ['summary', 'status', 'priority', 'issuetype'],
  ): Promise<JiraIssue[]> {
    try {
      const response = await this.http.post<{ issues: JiraIssue[] }>('/issue/search', {
        jql,
        fields,
        maxResults: 50,
      });
      return response.data.issues;
    } catch (err) {
      throw this.wrapError('Failed to search Jira issues', err);
    }
  }

  /** Converts an axios error into a structured JiraApiError. */
  private wrapError(message: string, err: unknown): JiraApiError {
    const axiosErr = err as AxiosError<{ errorMessages?: string[]; errors?: Record<string, string> }>;
    const status = axiosErr.response?.status ?? 0;
    const details = axiosErr.response?.data;
    const detail =
      details?.errorMessages?.join('; ') ??
      Object.values(details?.errors ?? {}).join('; ') ??
      axiosErr.message;

    return new JiraApiError(`${message}: ${detail}`, status, details);
  }

  /**
   * Builds an Atlassian Document Format (ADF) paragraph node from plain text.
   *
   * @param text - Plain text content.
   */
  static buildAdfParagraph(text: string): AdfDocument['content'][number] {
    return {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Builds an ADF heading node.
   *
   * @param text - Heading text.
   * @param level - Heading level (1–6).
   */
  static buildAdfHeading(
    text: string,
    level: 1 | 2 | 3 | 4 | 5 | 6 = 3,
  ): AdfDocument['content'][number] {
    return {
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Builds an ADF bullet list from an array of strings.
   *
   * @param items - List items.
   */
  static buildAdfBulletList(items: string[]): AdfDocument['content'][number] {
    return {
      type: 'bulletList',
      content: items.map((item) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: item }],
          },
        ],
      })),
    };
  }

  /**
   * Builds an ADF code block.
   *
   * @param code - Code content.
   * @param language - Optional language hint.
   */
  static buildAdfCodeBlock(
    code: string,
    language?: string,
  ): AdfDocument['content'][number] {
    return {
      type: 'codeBlock',
      attrs: language ? { language } : {},
      content: [{ type: 'text', text: code }],
    };
  }
}
