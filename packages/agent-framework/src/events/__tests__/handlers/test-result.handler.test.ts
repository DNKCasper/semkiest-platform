import { createTestResultHandler } from '../../handlers/test-result.handler';
import { createEvent } from '../../types';
import type { SocketServer } from '../../types';

function makeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function makeTestResultEvent(testRunId = 'run-1', projectId = 'proj-1') {
  return createEvent(
    'TestResultReady',
    {
      testRunId,
      projectId,
      results: {
        total: 20,
        passed: 16,
        failed: 2,
        warnings: 1,
        skipped: 1,
        duration: 12000,
        passRate: 80,
      },
      reportUrl: 'https://reports.example.com/run-1',
    },
    'corr-result',
  );
}

describe('createTestResultHandler', () => {
  it('logs info with full result summary', () => {
    const logger = makeLogger();
    const handler = createTestResultHandler(logger);

    const event = makeTestResultEvent();
    handler(event);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('Test results ready');
    expect(meta.testRunId).toBe('run-1');
    expect(meta.projectId).toBe('proj-1');
    expect(meta.total).toBe(20);
    expect(meta.passed).toBe(16);
    expect(meta.failed).toBe(2);
    expect(meta.passRate).toBe(80);
    expect(meta.reportUrl).toBe('https://reports.example.com/run-1');
    expect(meta.correlationId).toBe('corr-result');
  });

  it('does not call error or warn', () => {
    const logger = makeLogger();
    createTestResultHandler(logger)(makeTestResultEvent());

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not throw when no socket server provided', () => {
    const logger = makeLogger();
    expect(() => createTestResultHandler(logger)(makeTestResultEvent())).not.toThrow();
  });

  it('emits testrun:complete to the correct Socket.IO room', () => {
    const logger = makeLogger();
    const mockEmit = jest.fn();
    const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
    const socketServer: SocketServer = { to: mockTo, emit: jest.fn() };

    const handler = createTestResultHandler(logger, socketServer);
    const event = makeTestResultEvent('run-42', 'proj-7');
    handler(event);

    expect(mockTo).toHaveBeenCalledWith('testrun:run-42');
    expect(mockEmit).toHaveBeenCalledWith(
      'testrun:complete',
      expect.objectContaining({
        testRunId: 'run-42',
        projectId: 'proj-7',
        correlationId: 'corr-result',
      }),
    );
  });

  it('includes full results object in Socket.IO payload', () => {
    const logger = makeLogger();
    const mockEmit = jest.fn();
    const socketServer: SocketServer = {
      to: jest.fn().mockReturnValue({ emit: mockEmit }),
      emit: jest.fn(),
    };

    createTestResultHandler(logger, socketServer)(makeTestResultEvent());

    const payload = mockEmit.mock.calls[0][1] as Record<string, unknown>;
    const results = payload.results as Record<string, unknown>;
    expect(results.total).toBe(20);
    expect(results.passRate).toBe(80);
  });

  it('handles event without reportUrl gracefully', () => {
    const logger = makeLogger();
    const event = createEvent(
      'TestResultReady',
      {
        testRunId: 'r',
        projectId: 'p',
        results: { total: 1, passed: 1, failed: 0, warnings: 0, skipped: 0, duration: 100, passRate: 100 },
      },
      'corr',
    );
    expect(() => createTestResultHandler(logger)(event)).not.toThrow();
    const meta = logger.info.mock.calls[0][1] as Record<string, unknown>;
    expect(meta.reportUrl).toBeUndefined();
  });
});
