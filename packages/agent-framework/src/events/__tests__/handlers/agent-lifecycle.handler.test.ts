import {
  createAgentCompletedHandler,
  createAgentFailedHandler,
  createAgentStartedHandler,
} from '../../handlers/agent-lifecycle.handler';
import { createEvent } from '../../types';

function makeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

describe('createAgentStartedHandler', () => {
  it('logs info with correct fields when agent starts', () => {
    const logger = makeLogger();
    const handler = createAgentStartedHandler(logger);

    const event = createEvent(
      'AgentStarted',
      { agentId: 'a-1', agentType: 'BrowserAgent', testRunId: 'run-1', config: { url: 'https://example.com' } },
      'corr-start',
      'coordinator',
    );

    handler(event);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('Agent started');
    expect(meta.agentId).toBe('a-1');
    expect(meta.agentType).toBe('BrowserAgent');
    expect(meta.testRunId).toBe('run-1');
    expect(meta.correlationId).toBe('corr-start');
    expect(meta.eventId).toBe(event.id);
  });

  it('does not call error or warn for a normal start', () => {
    const logger = makeLogger();
    const event = createEvent('AgentStarted', { agentId: 'a', agentType: 'T', testRunId: 'r' }, 'c');
    createAgentStartedHandler(logger)(event);

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('createAgentCompletedHandler', () => {
  it('logs info with result details on completion', () => {
    const logger = makeLogger();
    const handler = createAgentCompletedHandler(logger);

    const event = createEvent(
      'AgentCompleted',
      {
        agentId: 'a-1',
        agentType: 'BrowserAgent',
        testRunId: 'run-2',
        result: { status: 'pass', duration: 3000, summary: 'All good', evidence: ['screenshot.png'] },
      },
      'corr-done',
    );

    handler(event);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message, meta] = logger.info.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('Agent completed');
    expect(meta.status).toBe('pass');
    expect(meta.duration).toBe(3000);
    expect(meta.summary).toBe('All good');
    expect(meta.correlationId).toBe('corr-done');
  });

  it('handles fail status without throwing', () => {
    const logger = makeLogger();
    const event = createEvent(
      'AgentCompleted',
      { agentId: 'a', agentType: 'T', testRunId: 'r', result: { status: 'fail', duration: 1000 } },
      'corr',
    );
    expect(() => createAgentCompletedHandler(logger)(event)).not.toThrow();
  });
});

describe('createAgentFailedHandler', () => {
  it('logs error with failure details', () => {
    const logger = makeLogger();
    const handler = createAgentFailedHandler(logger);

    const event = createEvent(
      'AgentFailed',
      {
        agentId: 'a-1',
        agentType: 'BrowserAgent',
        testRunId: 'run-3',
        error: { message: 'Element not found', code: 'SELECTOR_MISS', stack: 'Error...' },
        retryCount: 1,
      },
      'corr-fail',
    );

    handler(event);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, meta] = logger.error.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('Agent failed');
    expect(meta.errorMessage).toBe('Element not found');
    expect(meta.errorCode).toBe('SELECTOR_MISS');
    expect(meta.retryCount).toBe(1);
    expect(meta.correlationId).toBe('corr-fail');
  });

  it('does not call info or warn for a failure', () => {
    const logger = makeLogger();
    const event = createEvent(
      'AgentFailed',
      { agentId: 'a', agentType: 'T', testRunId: 'r', error: { message: 'boom' }, retryCount: 0 },
      'c',
    );
    createAgentFailedHandler(logger)(event);

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
