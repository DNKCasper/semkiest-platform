/**
 * @semkiest/jira-integration
 *
 * Bidirectional Jira integration for the SemkiEst platform:
 * - Read acceptance criteria from Jira stories for test generation
 * - Sync test results and status updates back to Jira
 * - Receive and process Jira webhook events
 * - Manage Jira project/field/workflow configuration
 */

export {
  JiraClient,
  JiraApiError,
  type JiraClientConfig,
  type JiraIssue,
  type JiraIssueFields,
  type JiraStatus,
  type JiraIssueType,
  type JiraProject,
  type JiraUser,
  type JiraPriority,
  type JiraDocument,
  type JiraDocNode,
  type JiraTransition,
} from './client.js';

export {
  JiraConfigManager,
  jiraConfig,
  type JiraIntegrationConfig,
  type JiraIntegrationConfigUpdate,
  type ProjectMapping,
  type FieldMapping,
  type WorkflowMapping,
  type SemTestStatus,
} from './config.js';

export {
  AcReader,
  type AcceptanceCriteria,
  type AcceptanceCriterion,
  type GeneratedTestCase,
  type GwtStep,
} from './ac-reader.js';

export {
  StatusSync,
  formatTestResultComment,
  type TestResult,
  type TestSuiteResult,
  type SyncOutcome,
} from './status-sync.js';

export {
  WebhookHandler,
  WebhookSignatureError,
  verifyWebhookSignature,
  parseWebhookEvent,
  type JiraWebhookPayload,
  type JiraWebhookEvent,
  type JiraWebhookEventName,
  type JiraWebhookIssue,
  type JiraChangelog,
  type JiraChangelogItem,
  type JiraWebhookUser,
  type JiraSprintPayload,
  type JiraEventHandler,
} from './webhook-handler.js';
