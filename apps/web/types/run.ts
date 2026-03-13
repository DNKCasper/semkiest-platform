/**
 * Test run domain types for the SemkiEst platform.
 */

export type RunStatus =
  | 'pending'
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentName =
  | 'explorer'
  | 'spec-reader'
  | 'executor'
  | 'validator'
  | 'reporter';

export type AgentStatus = 'pending' | 'idle' | 'running' | 'completed' | 'failed';

export type LogLevel = 'error' | 'warning' | 'info' | 'debug';

/** A configured test profile used to trigger runs. */
export interface TestProfile {
  id: string;
  name: string;
  description?: string;
  categories: string[];
  settings: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Per-agent runtime state reported via WebSocket. */
export interface AgentState {
  name: AgentName;
  /** Human-readable label for display. */
  label: string;
  status: AgentStatus;
  /** Number of items processed so far. */
  progress?: number;
  /** Total items to process. */
  total?: number;
  /** Current activity description. */
  message?: string;
  /** Error message when status === 'failed'. */
  error?: string;
}

/** A single log entry emitted by the coordinator or an agent. */
export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  agent?: AgentName;
  message: string;
}

/** A test run record as returned by the REST API. */
export interface TestRun {
  id: string;
  projectId: string;
  profileId: string;
  profile?: TestProfile;
  status: RunStatus;
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  /** ISO timestamp when the run started. */
  startedAt?: string;
  /** ISO timestamp when the run finished (any terminal state). */
  completedAt?: string;
  /** Duration in seconds. */
  duration?: number;
  agents: AgentState[];
  error?: string;
}

/** An individual test result within a run. */
export interface TestResult {
  id: string;
  runId: string;
  testName: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped';
  /** Duration in milliseconds. */
  duration: number;
  error?: string;
  screenshot?: string;
  videoClip?: string;
  agentName: AgentName;
}

/** Results grouped by test category. */
export interface TestResultsByCategory {
  category: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
}

/** A timeline event in the run execution history. */
export interface RunTimelineEvent {
  id: string;
  timestamp: string;
  event: string;
  agentName?: AgentName;
  details?: string;
}

/** Extended run record including logs, results, and timeline. */
export interface RunDetail extends TestRun {
  logs: LogEntry[];
  resultsByCategory: TestResultsByCategory[];
  timeline: RunTimelineEvent[];
}

export interface TestRunListResponse {
  data: TestRun[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TestRunFilters {
  status?: RunStatus;
  profileId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface TestRunQueryParams extends TestRunFilters {
  page?: number;
  pageSize?: number;
}

/** Payload to trigger a new test run. */
export interface TriggerRunInput {
  profileId: string;
  overrides?: Record<string, unknown>;
  categories?: string[];
}

// ---------------------------------------------------------------------------
// WebSocket event types
// ---------------------------------------------------------------------------

export type WsEventType =
  | 'run:started'
  | 'run:progress'
  | 'run:completed'
  | 'run:failed'
  | 'run:cancelled'
  | 'agent:status'
  | 'log:entry'
  | 'heartbeat';

export interface WsEvent {
  type: WsEventType;
  runId: string;
  timestamp: string;
  payload: WsRunProgressPayload | WsAgentStatusPayload | WsLogEntryPayload | WsHeartbeatPayload;
}

export interface WsRunProgressPayload {
  status: RunStatus;
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  estimatedSecondsRemaining?: number;
}

export interface WsAgentStatusPayload {
  agentName: AgentName;
  status: AgentStatus;
  progress?: number;
  total?: number;
  message?: string;
  error?: string;
}

export interface WsLogEntryPayload {
  level: LogLevel;
  agent?: AgentName;
  message: string;
}

export interface WsHeartbeatPayload {
  serverTime: string;
}
