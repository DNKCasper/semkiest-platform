/** Category of a test based on its purpose */
export enum TestCategory {
  Unit = 'unit',
  Integration = 'integration',
  E2E = 'e2e',
  Performance = 'performance',
  Security = 'security',
  Accessibility = 'accessibility',
}

/** Lifecycle status of a test run or test result */
export enum TestStatus {
  Pending = 'pending',
  Running = 'running',
  Passed = 'passed',
  Failed = 'failed',
  Skipped = 'skipped',
  Cancelled = 'cancelled',
  Timeout = 'timeout',
}

/** Operational status of an AI agent */
export enum AgentStatus {
  Idle = 'idle',
  Busy = 'busy',
  Offline = 'offline',
  Error = 'error',
}

/** Severity level for test failures and issues */
export enum Severity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
  Info = 'info',
}

/** User roles within the platform */
export enum Role {
  Admin = 'admin',
  Editor = 'editor',
  Viewer = 'viewer',
}

/** Deployment environment */
export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
}
