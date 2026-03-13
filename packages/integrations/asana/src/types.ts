/**
 * Core Asana domain types used across the integration package.
 */

export interface AsanaUser {
  gid: string;
  name: string;
  email: string;
}

export interface AsanaProject {
  gid: string;
  name: string;
}

export interface AsanaSection {
  gid: string;
  name: string;
}

export interface AsanaMembership {
  project: AsanaProject;
  section: AsanaSection | null;
}

export interface AsanaEnumValue {
  gid: string;
  name: string;
  color: string;
}

export interface AsanaCustomField {
  gid: string;
  name: string;
  type: string;
  enum_value: AsanaEnumValue | null;
  text_value: string | null;
  number_value: number | null;
}

export interface AsanaTag {
  gid: string;
  name: string;
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes: string;
  completed: boolean;
  due_on: string | null;
  assignee: AsanaUser | null;
  projects: AsanaProject[];
  memberships: AsanaMembership[];
  custom_fields: AsanaCustomField[];
  tags: AsanaTag[];
  created_at: string;
  modified_at: string;
}

export interface AsanaTaskWithSubtasks extends AsanaTask {
  subtasks: AsanaTask[];
}

export interface AsanaStory {
  gid: string;
  created_at: string;
  created_by: AsanaUser;
  text: string;
  type: 'comment' | 'system';
}

/**
 * Asana webhook event emitted for resource changes.
 */
export interface AsanaWebhookEvent {
  action: 'added' | 'removed' | 'deleted' | 'undeleted' | 'changed';
  resource: {
    gid: string;
    resource_type: string;
    resource_subtype?: string;
  };
  parent: {
    gid: string;
    resource_type: string;
  } | null;
  created_at: string;
  user: AsanaUser | null;
  change?: {
    field: string;
    action: 'added' | 'removed' | 'changed';
    added_value?: unknown;
    removed_value?: unknown;
    new_value?: unknown;
  };
}

/** Top-level payload sent by Asana to the webhook endpoint. */
export interface AsanaWebhookPayload {
  events: AsanaWebhookEvent[];
}

/** Configuration required to initialise any Asana API client. */
export interface AsanaConfig {
  /** Personal access token or OAuth bearer token. */
  accessToken: string;
  /** Optional default workspace GID. */
  workspaceId?: string;
  /** Optional default project GID. */
  defaultProjectId?: string;
  /** HMAC-SHA256 secret used to verify incoming webhook signatures. */
  webhookSecret?: string;
}

/**
 * Mapping between an Asana section GID and a SemkiEst test status string.
 */
export interface SectionMapping {
  sectionId: string;
  sectionName: string;
  testStatus: string;
}

/**
 * Mapping between an Asana status/enum value name and a SemkiEst test state.
 */
export interface StatusMapping {
  asanaStatus: string;
  testState: string;
}

/**
 * Stored configuration for an Asana project wired to a SemkiEst organisation.
 */
export interface AsanaProjectMapping {
  id: string;
  organizationId: string;
  asanaProjectId: string;
  asanaProjectName: string;
  asanaWorkspaceId: string;
  sectionMappings: SectionMapping[];
  statusMappings: StatusMapping[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Outcome of a single test run, used to generate Asana task comments and
 * trigger status transitions.
 */
export interface TestResult {
  testName: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration?: number;
  error?: string;
  projectId?: string;
  runId?: string;
  timestamp: Date;
}

/**
 * Structured test-case information extracted from an Asana task description.
 */
export interface ExtractedTestCase {
  /** Asana task name used as the test title. */
  title: string;
  /** Full task notes used as test description. */
  description: string;
  /** Ordered reproduction/test steps parsed from the notes. */
  steps: string[];
  /** Expected result text parsed from the notes. */
  expectedResult: string;
  /** Tag names attached to the task. */
  tags: string[];
  /** Inferred priority from custom fields or tags. */
  priority: 'high' | 'medium' | 'low';
  /** Source Asana task GID. */
  asanaTaskId: string;
  /** Source Asana task name. */
  asanaTaskName: string;
}
