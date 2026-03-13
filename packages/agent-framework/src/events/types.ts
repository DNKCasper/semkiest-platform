import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Event type discriminator
// ---------------------------------------------------------------------------

/** All supported agent event type names. */
export type EventType =
  | 'AgentStarted'
  | 'AgentProgress'
  | 'AgentCompleted'
  | 'AgentFailed'
  | 'TestResultReady';

// ---------------------------------------------------------------------------
// Core metadata & base shape
// ---------------------------------------------------------------------------

/**
 * Metadata attached to every event.  The correlationId is generated at test
 * run start and propagated through all subsequent events so individual events
 * can be traced across the system.
 */
export interface EventMetadata {
  /** Unique identifier for the logical request / test-run chain. */
  correlationId: string;
  /** ISO-8601 timestamp of when the event was created. */
  timestamp: string;
  /** Schema version for forward-compatibility. */
  version: string;
  /** Agent or service that emitted the event. */
  source?: string;
}

/**
 * Generic base event.  Every concrete event extends this shape with a
 * discriminated `type` and a strongly-typed `payload`.
 */
export interface BaseEvent<T extends EventType = EventType, P = unknown> {
  /** UUID for this specific event instance. */
  id: string;
  type: T;
  payload: P;
  metadata: EventMetadata;
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface AgentStartedPayload {
  agentId: string;
  agentType: string;
  testRunId: string;
  config?: Record<string, unknown>;
}

export interface AgentProgressPayload {
  agentId: string;
  testRunId: string;
  /** Progress percentage 0–100. */
  progress: number;
  message: string;
  step?: string;
  details?: Record<string, unknown>;
}

export interface AgentCompletedPayload {
  agentId: string;
  agentType: string;
  testRunId: string;
  result: {
    status: 'pass' | 'fail' | 'warning' | 'skip';
    /** Paths or URLs of captured evidence artefacts. */
    evidence?: string[];
    /** Execution duration in milliseconds. */
    duration: number;
    summary?: string;
  };
}

export interface AgentFailedPayload {
  agentId: string;
  agentType: string;
  testRunId: string;
  error: {
    message: string;
    code?: string;
    stack?: string;
  };
  retryCount: number;
}

export interface TestResultReadyPayload {
  testRunId: string;
  projectId: string;
  results: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
    /** Total run duration in milliseconds. */
    duration: number;
    passRate: number;
  };
  reportUrl?: string;
}

// ---------------------------------------------------------------------------
// Strongly-typed event aliases
// ---------------------------------------------------------------------------

export type AgentStartedEvent = BaseEvent<'AgentStarted', AgentStartedPayload>;
export type AgentProgressEvent = BaseEvent<'AgentProgress', AgentProgressPayload>;
export type AgentCompletedEvent = BaseEvent<'AgentCompleted', AgentCompletedPayload>;
export type AgentFailedEvent = BaseEvent<'AgentFailed', AgentFailedPayload>;
export type TestResultReadyEvent = BaseEvent<'TestResultReady', TestResultReadyPayload>;

/** Discriminated union of all agent events. */
export type AgentEvent =
  | AgentStartedEvent
  | AgentProgressEvent
  | AgentCompletedEvent
  | AgentFailedEvent
  | TestResultReadyEvent;

// ---------------------------------------------------------------------------
// Dead-letter types
// ---------------------------------------------------------------------------

/** Wrapper stored in the dead-letter queue when event delivery fails. */
export interface DeadLetterEvent {
  originalEvent: AgentEvent;
  failureReason: string;
  failedAt: string;
  retryCount: number;
  /** Redis channel the event was received on. */
  channel: string;
}

// ---------------------------------------------------------------------------
// Handler & bus utility types
// ---------------------------------------------------------------------------

/** Async-capable event handler function. */
export type EventHandler<T extends AgentEvent = AgentEvent> = (
  event: T,
) => Promise<void> | void;

/** Runtime metrics tracked by the EventBus. */
export interface EventBusMetrics {
  publishedCount: number;
  receivedCount: number;
  handledCount: number;
  failedCount: number;
  deadLetterCount: number;
}

/**
 * Minimal Socket.IO–compatible interface accepted by EventBus.
 * Using a structural type avoids a hard runtime dependency on `socket.io`.
 */
export interface SocketServer {
  to(room: string): { emit(eventName: string, data: unknown): unknown };
  emit(eventName: string, data: unknown): unknown;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Build a populated `EventMetadata` object.
 * @param correlationId - propagated from the test-run start.
 * @param source        - identifier of the emitting agent/service.
 */
export function createEventMetadata(
  correlationId: string,
  source?: string,
): EventMetadata {
  return {
    correlationId,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    source,
  };
}

/**
 * Convenience factory for constructing a typed event.
 *
 * @example
 * const event = createEvent('AgentStarted', payload, correlationId, 'my-agent');
 */
export function createEvent<T extends EventType, P>(
  type: T,
  payload: P,
  correlationId: string,
  source?: string,
): BaseEvent<T, P> {
  return {
    id: randomUUID(),
    type,
    payload,
    metadata: createEventMetadata(correlationId, source),
  };
}
