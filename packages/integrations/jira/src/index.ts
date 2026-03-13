/**
 * @semkiest/jira – Jira REST API v3 integration for SemkiEst.
 *
 * Provides:
 *  - JiraClient: low-level API client (authenticate, CRUD issues, attachments, links)
 *  - BugReporter: high-level helper to create bug tickets from test failures
 *  - field-mapper: severity↔priority conversions and label/summary builders
 *  - attachment-handler: download screenshots and upload them to Jira
 *  - encryption: AES-256-GCM helpers for storing API tokens securely
 */
export { JiraClient, JiraApiError } from './jira-client';
export { BugReporter, buildBugDescription } from './bug-reporter';
export {
  mapSeverityToPriority,
  mapPriorityToSeverity,
  buildBugLabels,
  buildIssueSummary,
} from './field-mapper';
export {
  attachScreenshotToIssue,
  attachScreenshotsToIssue,
  downloadFile,
  fileNameFromUrl,
  mimeTypeFromExtension,
} from './attachment-handler';
export { encryptToken, decryptToken, generateEncryptionKey } from './encryption';
export type {
  AdfBulletList,
  AdfCodeBlock,
  AdfDocument,
  AdfHeading,
  AdfListItem,
  AdfParagraph,
  AdfText,
  AddCommentOptions,
  CreateBugReportOptions,
  CreateBugReportResult,
  CreateIssueOptions,
  IssueLinkTypeName,
  JiraClientConfig,
  JiraCredential,
  JiraIssue,
  JiraIssueType,
  JiraPriority,
  SeverityLevel,
  TestFailure,
} from './types';
export type { AttachmentUploadResult } from './attachment-handler';
