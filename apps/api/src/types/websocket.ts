/**
 * WebSocket type definitions for the SemkiEst platform.
 * Defines all typed event payloads, server/client event maps, and socket data.
 */

/** Status of a test step during execution */
export type TestStepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

/** Status of an agent */
export type AgentStatus = 'idle' | 'running' | 'error' | 'offline';

/** Status of a test run result */
export type TestResultStatus = 'passed' | 'failed' | 'error';

/** Role of a user in the platform */
export type UserRole = 'admin' | 'member';

// ---------------------------------------------------------------------------
// Server → Client event payloads
// ---------------------------------------------------------------------------

/** Emitted to test-run-{runId} room during test execution */
export interface TestProgressPayload {
  runId: string;
  step: string;
  status: TestStepStatus;
  /** Progress percentage 0–100 */
  progress: number;
  timestamp: string;
}

/** Resource metrics reported by an agent */
export interface AgentMetrics {
  cpu?: number;
  memory?: number;
  tasksCompleted?: number;
}

/** Emitted to admin room for agent health monitoring */
export interface AgentStatusPayload {
  agentId: string;
  status: AgentStatus;
  lastSeen: string;
  metrics: AgentMetrics;
}

/** Emitted to test-run and project rooms when a run completes */
export interface TestResultPayload {
  runId: string;
  resultId: string;
  status: TestResultStatus;
  summary: string;
  timestamp: string;
}

/** Error event emitted when something goes wrong */
export interface ErrorPayload {
  code: string;
  message: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Client → Server event payloads
// ---------------------------------------------------------------------------

/** Request to subscribe to a room */
export interface JoinRoomPayload {
  room: string;
}

/** Request to unsubscribe from a room */
export interface LeaveRoomPayload {
  room: string;
}

// ---------------------------------------------------------------------------
// Socket.io event maps
// ---------------------------------------------------------------------------

/** Events emitted from the server to the client */
export interface ServerToClientEvents {
  'test-progress': (payload: TestProgressPayload) => void;
  'agent-status': (payload: AgentStatusPayload) => void;
  'test-result': (payload: TestResultPayload) => void;
  'error': (payload: ErrorPayload) => void;
  /** Response to client ping */
  'pong': () => void;
}

/** Events emitted from the client to the server */
export interface ClientToServerEvents {
  'join-room': (payload: JoinRoomPayload) => void;
  'leave-room': (payload: LeaveRoomPayload) => void;
  /** Keepalive ping */
  'ping': () => void;
}

/** Events used for inter-server communication (Socket.io cluster mode) */
export interface InterServerEvents {
  ping: () => void;
}

/** Per-socket data attached after JWT authentication */
export interface SocketData {
  userId: string;
  orgId: string;
  role: UserRole;
  projectIds: string[];
}

// ---------------------------------------------------------------------------
// JWT payload
// ---------------------------------------------------------------------------

/** Expected claims in the JWT issued by the auth service */
export interface JwtTokenPayload {
  userId: string;
  orgId: string;
  role: UserRole;
  projectIds?: string[];
  iat?: number;
  exp?: number;
}
