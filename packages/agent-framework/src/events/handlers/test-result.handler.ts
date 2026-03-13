import type { EventHandler, SocketServer, TestResultReadyEvent } from '../types';
import type { Logger } from './agent-lifecycle.handler';

/**
 * Returns a handler that processes `TestResultReady` events.
 *
 * Logs a structured summary of the completed test run and, when a Socket.IO
 * server is provided, broadcasts the result to:
 *  - The `testrun:{testRunId}` room (clients watching a specific run).
 *  - The global `agent:TestResultReady` channel.
 *
 * @param logger       - logger for structured output.
 * @param socketServer - optional Socket.IO server for real-time streaming.
 *
 * @example
 * eventBus.subscribe('TestResultReady', createTestResultHandler(logger, io));
 */
export function createTestResultHandler(
  logger: Logger,
  socketServer?: SocketServer,
): EventHandler<TestResultReadyEvent> {
  return (event: TestResultReadyEvent): void => {
    const { testRunId, projectId, results, reportUrl } = event.payload;

    logger.info('Test results ready', {
      eventId: event.id,
      testRunId,
      projectId,
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      warnings: results.warnings,
      skipped: results.skipped,
      passRate: results.passRate,
      duration: results.duration,
      reportUrl,
      correlationId: event.metadata.correlationId,
      timestamp: event.metadata.timestamp,
    });

    if (socketServer) {
      socketServer.to(`testrun:${testRunId}`).emit('testrun:complete', {
        testRunId,
        projectId,
        results,
        reportUrl,
        correlationId: event.metadata.correlationId,
        timestamp: event.metadata.timestamp,
      });
    }
  };
}
