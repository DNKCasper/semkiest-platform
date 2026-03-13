import type { AgentProgressEvent, EventHandler, SocketServer } from '../types';
import type { Logger } from './agent-lifecycle.handler';

/**
 * Returns a handler that logs agent progress events and optionally streams
 * them to a Socket.IO room for real-time dashboard updates.
 *
 * @param logger       - logger for structured output.
 * @param socketServer - optional Socket.IO server for real-time streaming.
 *
 * @example
 * eventBus.subscribe('AgentProgress', createProgressHandler(logger, io));
 */
export function createProgressHandler(
  logger: Logger,
  socketServer?: SocketServer,
): EventHandler<AgentProgressEvent> {
  return (event: AgentProgressEvent): void => {
    const { agentId, testRunId, progress, message, step } = event.payload;

    logger.debug('Agent progress', {
      eventId: event.id,
      agentId,
      testRunId,
      progress,
      message,
      step,
      correlationId: event.metadata.correlationId,
      timestamp: event.metadata.timestamp,
    });

    if (socketServer) {
      // Broadcast to the test-run–specific room so only subscribed clients
      // receive updates for this run.
      socketServer.to(`testrun:${testRunId}`).emit('agent:progress', {
        agentId,
        testRunId,
        progress,
        message,
        step,
        correlationId: event.metadata.correlationId,
        timestamp: event.metadata.timestamp,
      });
    }
  };
}
