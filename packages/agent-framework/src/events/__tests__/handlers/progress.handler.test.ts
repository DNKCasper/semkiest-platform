import { createProgressHandler } from '../../handlers/progress.handler';
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

function makeProgressEvent(progress = 50, testRunId = 'run-1') {
  return createEvent(
    'AgentProgress',
    { agentId: 'a-1', testRunId, progress, message: `${progress}% done`, step: 'navigation' },
    'corr-progress',
  );
}

describe('createProgressHandler', () => {
  it('logs debug with progress data', () => {
    const logger = makeLogger();
    const handler = createProgressHandler(logger);

    const event = makeProgressEvent(75);
    handler(event);

    expect(logger.debug).toHaveBeenCalledTimes(1);
    const [message, meta] = logger.debug.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('Agent progress');
    expect(meta.progress).toBe(75);
    expect(meta.step).toBe('navigation');
    expect(meta.correlationId).toBe('corr-progress');
  });

  it('does not call info / error for progress events', () => {
    const logger = makeLogger();
    createProgressHandler(logger)(makeProgressEvent());

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not call socket when no server provided', () => {
    const logger = makeLogger();
    const handler = createProgressHandler(logger, undefined);
    expect(() => handler(makeProgressEvent())).not.toThrow();
  });

  it('emits to the correct Socket.IO room when server is provided', () => {
    const logger = makeLogger();
    const mockEmit = jest.fn();
    const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
    const socketServer: SocketServer = { to: mockTo, emit: jest.fn() };

    const handler = createProgressHandler(logger, socketServer);
    const event = makeProgressEvent(40, 'run-xyz');
    handler(event);

    expect(mockTo).toHaveBeenCalledWith('testrun:run-xyz');
    expect(mockEmit).toHaveBeenCalledWith(
      'agent:progress',
      expect.objectContaining({
        testRunId: 'run-xyz',
        progress: 40,
        correlationId: 'corr-progress',
      }),
    );
  });

  it('includes correlationId in Socket.IO payload', () => {
    const logger = makeLogger();
    const mockEmit = jest.fn();
    const socketServer: SocketServer = {
      to: jest.fn().mockReturnValue({ emit: mockEmit }),
      emit: jest.fn(),
    };

    const event = createEvent(
      'AgentProgress',
      { agentId: 'a', testRunId: 'r', progress: 10, message: 'start' },
      'unique-correlation-id',
    );
    createProgressHandler(logger, socketServer)(event);

    const payload = mockEmit.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.correlationId).toBe('unique-correlation-id');
  });
});
