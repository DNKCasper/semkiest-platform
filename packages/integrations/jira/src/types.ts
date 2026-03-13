/**
 * Shared types for the Jira integration package.
 */

/** SemkiEst severity levels mapped from test failure data. */
export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

/** Jira priority names as used by Jira REST API v3. */
export type JiraPriority = 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';

/** Jira issue type names. */
export type JiraIssueType = 'Bug' | 'Task' | 'Story' | 'Epic';

/** Atlassian Document Format (ADF) text node. */
export interface AdfText {
  type: 'text';
  text: string;
  marks?: Array<{ type: string }>;
}

/** ADF paragraph node. */
export interface AdfParagraph {
  type: 'paragraph';
  content: AdfText[];
}

/** ADF heading node. */
export interface AdfHeading {
  type: 'heading';
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
  content: AdfText[];
}

/** ADF bullet list node. */
export interface AdfBulletList {
  type: 'bulletList';
  content: AdfListItem[];
}

/** ADF list item node. */
export interface AdfListItem {
  type: 'listItem';
  content: AdfParagraph[];
}

/** ADF code block node. */
export interface AdfCodeBlock {
  type: 'codeBlock';
  attrs?: { language?: string };
  content: AdfText[];
}

/** Top-level ADF document. */
export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: Array<AdfParagraph | AdfHeading | AdfBulletList | AdfCodeBlock>;
}

/** Configuration required to create a JiraClient instance. */
export interface JiraClientConfig {
  /** Atlassian base URL, e.g. https://your-domain.atlassian.net */
  baseUrl: string;
  /** Atlassian account email address used for Basic auth. */
  email: string;
  /** Jira API token (from id.atlassian.com). NEVER store in plain text. */
  apiToken: string;
}

/** Minimal representation of a Jira issue returned by the API. */
export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: { name: string };
    priority: { name: JiraPriority };
    issuetype: { name: string };
    description: AdfDocument | null;
    assignee: { displayName: string; emailAddress: string } | null;
    reporter: { displayName: string; emailAddress: string } | null;
  };
}

/** Options for creating a Jira issue. */
export interface CreateIssueOptions {
  /** Jira project key, e.g. "SEM". */
  projectKey: string;
  /** Issue summary / title. */
  summary: string;
  /** Issue description in Atlassian Document Format. */
  description: AdfDocument;
  /** Issue type, defaults to "Bug". */
  issueType?: JiraIssueType;
  /** Priority to assign to the issue. */
  priority?: JiraPriority;
  /** Optional labels to attach. */
  labels?: string[];
  /** Optional assignee account ID. */
  assigneeAccountId?: string;
}

/** Options for adding a comment to a Jira issue. */
export interface AddCommentOptions {
  /** ADF document body for the comment. */
  body: AdfDocument;
}

/** Jira link type names used when linking two issues. */
export type IssueLinkTypeName =
  | 'Blocks'
  | 'Cloners'
  | 'Duplicate'
  | 'is duplicated by'
  | 'Relates';

/** Represents a test failure from SemkiEst. */
export interface TestFailure {
  /** Unique identifier for this test run / failure. */
  id: string;
  /** Human-readable test name. */
  testName: string;
  /** Error message produced by the failing test. */
  errorMessage: string;
  /** Full stack trace, if available. */
  stackTrace?: string;
  /** Steps to reproduce the failure. */
  stepsToReproduce?: string[];
  /** Severity of this failure. */
  severity: SeverityLevel;
  /** Browser / engine name (e.g. "chromium", "firefox"). */
  browser?: string;
  /** Viewport dimensions at the time of the test. */
  viewport?: { width: number; height: number };
  /** Test environment metadata (e.g. OS, version). */
  environment?: Record<string, string>;
  /** S3 URL or public URL pointing to a screenshot taken at the failure point. */
  screenshotUrl?: string;
  /** Timestamp when the failure occurred (ISO 8601). */
  failedAt?: string;
}

/** Options for the BugReporter.createBugReport method. */
export interface CreateBugReportOptions {
  /** Jira project key where the bug ticket will be created. */
  projectKey: string;
  /** Primary test failure to open the ticket for. */
  failure: TestFailure;
  /**
   * Additional failures to link to the same ticket.
   * Each will be linked via a "Relates" issue link.
   */
  relatedFailures?: TestFailure[];
  /** Labels to attach to the created ticket. */
  labels?: string[];
  /** Jira account ID to assign the ticket to. */
  assigneeAccountId?: string;
}

/** Result returned after a bug report is created. */
export interface CreateBugReportResult {
  /** Key of the created Jira issue, e.g. "SEM-42". */
  issueKey: string;
  /** Self URL of the created Jira issue. */
  issueUrl: string;
  /** Keys of any linked issues that were created for related failures. */
  linkedIssueKeys: string[];
  /** Number of attachments successfully uploaded. */
  attachmentsUploaded: number;
}

/** A stored Jira credential (encrypted). */
export interface JiraCredential {
  /** ID of the workspace / project that owns these credentials. */
  workspaceId: string;
  /** Atlassian base URL. */
  baseUrl: string;
  /** Atlassian account email. */
  email: string;
  /** Encrypted API token (use EncryptionService to decrypt before use). */
  encryptedApiToken: string;
  /** Jira project key to default to when creating tickets. */
  defaultProjectKey?: string;
}
