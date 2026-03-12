/**
 * WebSocket event name constants and room name helpers.
 * Centralises all string literals to avoid typos and enable autocomplete.
 */

/** All WebSocket event names used by the platform */
export const WebSocketEvents = {
  // Server → Client
  TEST_PROGRESS: 'test-progress',
  AGENT_STATUS: 'agent-status',
  TEST_RESULT: 'test-result',
  ERROR: 'error',
  PONG: 'pong',

  // Client → Server
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  PING: 'ping',
} as const;

/** Union of all server-to-client event names */
export type ServerEventName = (typeof WebSocketEvents)[
  | 'TEST_PROGRESS'
  | 'AGENT_STATUS'
  | 'TEST_RESULT'
  | 'ERROR'
  | 'PONG'
];

/** Union of all client-to-server event names */
export type ClientEventName = (typeof WebSocketEvents)[
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'PING'
];

/** Helpers for constructing consistent room names */
export const RoomNames = {
  /** Room for a specific test run: `test-run-{runId}` */
  testRun: (runId: string): string => `test-run-${runId}`,

  /** Room for a project: `project-{projectId}` */
  project: (projectId: string): string => `project-${projectId}`,

  /** Room for an organisation: `org-{orgId}` */
  org: (orgId: string): string => `org-${orgId}`,

  /** Global admin room for agent monitoring */
  admin: (): string => 'admin',
} as const;
