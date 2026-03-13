/**
 * Severity levels used across SemkiEst for categorizing test failures.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * A file attachment (screenshot or artifact) to be uploaded to an Asana task.
 */
export interface Attachment {
  /** Display name for the attachment */
  name: string;
  /** Raw file data */
  data: Buffer;
  /** MIME type (e.g. "image/png", "application/json") */
  mimeType: string;
}

/**
 * Represents a failed test result from which a bug task is created.
 */
export interface FailedTestResult {
  /** Name of the individual test case */
  testName: string;
  /** Name of the test suite / describe block */
  suiteName: string;
  /** Primary error message from the failure */
  errorMessage: string;
  /** Optional full stack trace */
  stackTrace?: string;
  /** Severity level of this failure */
  severity: Severity;
  /** Screenshots captured during the test run */
  screenshots?: Attachment[];
  /** Additional artifacts (logs, HAR files, etc.) */
  artifacts?: Attachment[];
  /** Unique identifier for the test run that produced this failure */
  testRunId: string;
  /** Optional Asana GID of the user to assign this task to */
  assigneeGid?: string;
  /** When the failure occurred */
  timestamp: Date;
}

/**
 * Configuration for the BugReporter.
 * Provide either `accessToken` (plaintext) or `encryptedToken` + `encryptionKey`.
 */
export interface BugReporterConfig {
  /** Plaintext Asana personal access token (use only in development / tests) */
  accessToken?: string;
  /** AES-256-GCM encrypted Asana personal access token */
  encryptedToken?: string;
  /** Key used to decrypt `encryptedToken` */
  encryptionKey?: string;
  /** Asana workspace GID */
  workspaceGid: string;
  /** Asana project GID where bug tasks are created */
  projectGid: string;
  /** Optional Asana section GID within the project */
  sectionGid?: string;
  /** Default assignee GID (can be overridden per test result) */
  assigneeGid?: string;
}

// ─── Asana REST API response shapes ────────────────────────────────────────

/** Minimal resource reference returned by many Asana endpoints */
export interface AsanaRef {
  gid: string;
  resource_type: string;
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes: string;
  resource_type: 'task';
  assignee: AsanaRef | null;
  projects: AsanaRef[];
  tags: AsanaRef[];
  memberships: AsanaTaskMembership[];
  created_at: string;
  modified_at: string;
  permalink_url?: string;
}

export interface AsanaTaskMembership {
  project: AsanaRef;
  section: AsanaRef | null;
}

export interface AsanaProject {
  gid: string;
  name: string;
  resource_type: 'project';
}

export interface AsanaSection {
  gid: string;
  name: string;
  resource_type: 'section';
}

export interface AsanaTag {
  gid: string;
  name: string;
  color: string;
  resource_type: 'tag';
}

export interface AsanaAttachment {
  gid: string;
  name: string;
  resource_type: 'attachment';
  download_url?: string;
  view_url?: string;
}

export interface AsanaErrorDetail {
  message: string;
  help?: string;
}

export interface AsanaErrorResponse {
  errors?: AsanaErrorDetail[];
}

// ─── Input shapes for API calls ──────────────────────────────────────────────

export interface CreateTaskMembership {
  project: string;
  section?: string;
}

export interface CreateTaskInput {
  name: string;
  notes: string;
  projects: string[];
  memberships: CreateTaskMembership[];
  assignee?: string;
}
