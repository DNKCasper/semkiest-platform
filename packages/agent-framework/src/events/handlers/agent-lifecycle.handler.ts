import type {
  AgentCompletedEvent,
  AgentFailedEvent,
  AgentStartedEvent,
  EventHandler,
} from '../types';

/** Minimal logger interface accepted by lifecycle handlers. */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// AgentStarted
// ---------------------------------------------------------------------------

/**
 * Returns a handler that logs when an agent begins execution.
 * Attach to the event bus via:
 *   `eventBus.subscribe('AgentStarted', createAgentStartedHandler(logger))`
 */
export function createAgentStartedHandler(logger: Logger): EventHandler<AgentStartedEvent> {
  return (event: AgentStartedEvent): void => {
    logger.info('Agent started', {
      eventId: event.id,
      agentId: event.payload.agentId,
      agentType: event.payload.agentType,
      testRunId: event.payload.testRunId,
      correlationId: event.metadata.correlationId,
      timestamp: event.metadata.timestamp,
    });
  };
}

// ---------------------------------------------------------------------------
// AgentCompleted
// ---------------------------------------------------------------------------

/**
 * Returns a handler that logs when an agent finishes successfully.
 * Attach to the event bus via:
 *   `eventBus.subscribe('AgentCompleted', createAgentCompletedHandler(logger))`
 */
export function createAgentCompletedHandler(
  logger: Logger,
): EventHandler<AgentCompletedEvent> {
  return (event: AgentCompletedEvent): void => {
    const { agentId, agentType, testRunId, result } = event.payload;

    logger.info('Agent completed', {
      eventId: event.id,
      agentId,
      agentType,
      testRunId,
      status: result.status,
      duration: result.duration,
      summary: result.summary,
      correlationId: event.metadata.correlationId,
      timestamp: event.metadata.timestamp,
    });
  };
}

// ---------------------------------------------------------------------------
// AgentFailed
// ---------------------------------------------------------------------------

/**
 * Returns a handler that logs when an agent encounters an error.
 * Attach to the event bus via:
 *   `eventBus.subscribe('AgentFailed', createAgentFailedHandler(logger))`
 */
export function createAgentFailedHandler(logger: Logger): EventHandler<AgentFailedEvent> {
  return (event: AgentFailedEvent): void => {
    const { agentId, agentType, testRunId, error, retryCount } = event.payload;

    logger.error('Agent failed', {
      eventId: event.id,
      agentId,
      agentType,
      testRunId,
      errorMessage: error.message,
      errorCode: error.code,
      retryCount,
      correlationId: event.metadata.correlationId,
      timestamp: event.metadata.timestamp,
    });
  };
}
