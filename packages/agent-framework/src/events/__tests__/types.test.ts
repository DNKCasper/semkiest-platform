import { createEvent, createEventMetadata } from '../types';

describe('createEventMetadata', () => {
  it('creates metadata with required fields', () => {
    const meta = createEventMetadata('corr-123', 'test-agent');
    expect(meta.correlationId).toBe('corr-123');
    expect(meta.source).toBe('test-agent');
    expect(meta.version).toBe('1.0.0');
    expect(new Date(meta.timestamp).toISOString()).toBe(meta.timestamp);
  });

  it('works without source', () => {
    const meta = createEventMetadata('corr-456');
    expect(meta.source).toBeUndefined();
    expect(meta.correlationId).toBe('corr-456');
  });
});

describe('createEvent', () => {
  it('creates a typed AgentStarted event', () => {
    const payload = {
      agentId: 'agent-1',
      agentType: 'BrowserAgent',
      testRunId: 'run-1',
    };

    const event = createEvent('AgentStarted', payload, 'corr-1', 'coordinator');

    expect(event.type).toBe('AgentStarted');
    expect(event.payload).toEqual(payload);
    expect(event.metadata.correlationId).toBe('corr-1');
    expect(event.metadata.source).toBe('coordinator');
    expect(typeof event.id).toBe('string');
    expect(event.id.length).toBeGreaterThan(0);
  });

  it('creates a typed AgentProgress event', () => {
    const payload = {
      agentId: 'agent-1',
      testRunId: 'run-1',
      progress: 50,
      message: 'Half way done',
      step: 'navigation',
    };

    const event = createEvent('AgentProgress', payload, 'corr-2');

    expect(event.type).toBe('AgentProgress');
    expect(event.payload.progress).toBe(50);
    expect(event.metadata.source).toBeUndefined();
  });

  it('creates a typed AgentCompleted event', () => {
    const payload = {
      agentId: 'agent-1',
      agentType: 'BrowserAgent',
      testRunId: 'run-1',
      result: { status: 'pass' as const, duration: 1200 },
    };

    const event = createEvent('AgentCompleted', payload, 'corr-3');
    expect(event.type).toBe('AgentCompleted');
    expect(event.payload.result.status).toBe('pass');
  });

  it('creates a typed AgentFailed event', () => {
    const payload = {
      agentId: 'agent-1',
      agentType: 'BrowserAgent',
      testRunId: 'run-1',
      error: { message: 'Timeout', code: 'TIMEOUT' },
      retryCount: 2,
    };

    const event = createEvent('AgentFailed', payload, 'corr-4');
    expect(event.type).toBe('AgentFailed');
    expect(event.payload.error.code).toBe('TIMEOUT');
    expect(event.payload.retryCount).toBe(2);
  });

  it('creates a typed TestResultReady event', () => {
    const payload = {
      testRunId: 'run-1',
      projectId: 'proj-1',
      results: {
        total: 10,
        passed: 8,
        failed: 1,
        warnings: 1,
        skipped: 0,
        duration: 5000,
        passRate: 80,
      },
    };

    const event = createEvent('TestResultReady', payload, 'corr-5');
    expect(event.type).toBe('TestResultReady');
    expect(event.payload.results.passRate).toBe(80);
  });

  it('generates unique IDs for each event', () => {
    const e1 = createEvent('AgentStarted', { agentId: 'a', agentType: 'T', testRunId: 'r' }, 'c');
    const e2 = createEvent('AgentStarted', { agentId: 'a', agentType: 'T', testRunId: 'r' }, 'c');
    expect(e1.id).not.toBe(e2.id);
  });

  it('propagates correlationId through metadata', () => {
    const correlationId = 'trace-xyz-789';
    const event = createEvent('AgentStarted', { agentId: 'a', agentType: 'T', testRunId: 'r' }, correlationId);
    expect(event.metadata.correlationId).toBe(correlationId);
  });
});
