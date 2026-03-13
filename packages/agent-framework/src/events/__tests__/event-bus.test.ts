import { EventBus } from '../event-bus';
import { createEvent } from '../types';
import type { AgentEvent, AgentStartedEvent, SocketServer } from '../types';

// ---------------------------------------------------------------------------
// Mock ioredis
// ---------------------------------------------------------------------------

type MessageCallback = (channel: string, message: string) => void;

let capturedMessageCallback: MessageCallback | null = null;

const mockPublish = jest.fn().mockResolvedValue(1);
const mockSubscribe = jest.fn().mockResolvedValue('OK');
const mockConnect = jest.fn().mockResolvedValue('OK');
const mockQuit = jest.fn().mockResolvedValue('OK');
const mockZadd = jest.fn().mockResolvedValue(1);
const mockExpire = jest.fn().mockResolvedValue(1);
const mockZrange = jest.fn().mockResolvedValue([]);
const mockZrem = jest.fn().mockResolvedValue(1);
const mockZcard = jest.fn().mockResolvedValue(0);
const mockOn = jest.fn().mockImplementation((event: string, cb: MessageCallback) => {
  if (event === 'message') capturedMessageCallback = cb;
});

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    quit: mockQuit,
    publish: mockPublish,
    subscribe: mockSubscribe,
    on: mockOn,
    zadd: mockZadd,
    expire: mockExpire,
    zrange: mockZrange,
    zrem: mockZrem,
    zcard: mockZcard,
  })),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStartedEvent(overrides: Partial<AgentStartedEvent['payload']> = {}): AgentStartedEvent {
  return createEvent(
    'AgentStarted',
    { agentId: 'agent-1', agentType: 'BrowserAgent', testRunId: 'run-1', ...overrides },
    'corr-test',
    'test',
  );
}

/** Simulate Redis delivering a message to the subscriber. */
function simulateMessage(channel: string, event: AgentEvent): void {
  if (!capturedMessageCallback) throw new Error('No message callback registered');
  capturedMessageCallback(channel, JSON.stringify(event));
}

/**
 * Drain all pending microtasks and the next event-loop tick so that
 * fire-and-forget async handler chains (including DLQ writes) complete
 * before assertions run.
 */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedMessageCallback = null;
    bus = new EventBus({ redisUrl: 'redis://localhost:6379', keyPrefix: 'test' });
  });

  // -------------------------------------------------------------------------
  // connect / disconnect
  // -------------------------------------------------------------------------

  describe('connect / disconnect', () => {
    it('calls connect on both Redis clients', async () => {
      await bus.connect();
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('calls quit on both Redis clients', async () => {
      await bus.connect();
      await bus.disconnect();
      expect(mockQuit).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // publish
  // -------------------------------------------------------------------------

  describe('publish', () => {
    it('serialises and publishes the event to the correct channel', async () => {
      const event = makeStartedEvent();
      await bus.publish(event);

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const [channel, payload] = mockPublish.mock.calls[0] as [string, string];
      expect(channel).toBe('test:events:AgentStarted');
      expect(JSON.parse(payload)).toMatchObject({ id: event.id, type: 'AgentStarted' });
    });

    it('increments publishedCount metric', async () => {
      await bus.publish(makeStartedEvent());
      await bus.publish(makeStartedEvent());
      expect(bus.getMetrics().publishedCount).toBe(2);
    });

    it('streams to Socket.IO when server is configured', async () => {
      const mockEmit = jest.fn();
      const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
      const socketServer: SocketServer = { to: mockTo, emit: jest.fn() };

      bus.setSocketServer(socketServer);
      const event = makeStartedEvent({ testRunId: 'run-42' });
      await bus.publish(event);

      expect(mockTo).toHaveBeenCalledWith('testrun:run-42');
      expect(mockEmit).toHaveBeenCalledWith('agent:event', event);
    });

    it('broadcasts global Socket.IO event for the type', async () => {
      const globalEmit = jest.fn();
      const socketServer: SocketServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }), emit: globalEmit };

      bus.setSocketServer(socketServer);
      const event = makeStartedEvent();
      await bus.publish(event);

      expect(globalEmit).toHaveBeenCalledWith('agent:AgentStarted', event);
    });
  });

  // -------------------------------------------------------------------------
  // subscribe
  // -------------------------------------------------------------------------

  describe('subscribe', () => {
    it('subscribes to the correct Redis channel', async () => {
      bus.subscribe('AgentStarted', jest.fn());
      // Allow the async ensureSubscribed to run
      await Promise.resolve();

      expect(mockSubscribe).toHaveBeenCalledWith('test:events:AgentStarted');
    });

    it('only subscribes to a channel once when multiple handlers are added', async () => {
      bus.subscribe('AgentStarted', jest.fn());
      bus.subscribe('AgentStarted', jest.fn());
      await Promise.resolve();

      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });

    it('returns a working unsubscribe function', async () => {
      const handler = jest.fn();
      const unsubscribe = bus.subscribe('AgentStarted', handler);

      await Promise.resolve();
      unsubscribe();

      simulateMessage('test:events:AgentStarted', makeStartedEvent());
      await Promise.resolve();

      expect(handler).not.toHaveBeenCalled();
    });

    it('invokes the registered handler when a message arrives', async () => {
      const handler = jest.fn();
      bus.subscribe('AgentStarted', handler);
      await Promise.resolve();

      const event = makeStartedEvent();
      simulateMessage('test:events:AgentStarted', event);
      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('supports multiple handlers for the same event type', async () => {
      const h1 = jest.fn();
      const h2 = jest.fn();
      bus.subscribe('AgentStarted', h1);
      bus.subscribe('AgentStarted', h2);
      await Promise.resolve();

      const event = makeStartedEvent();
      simulateMessage('test:events:AgentStarted', event);
      await Promise.resolve();

      expect(h1).toHaveBeenCalledWith(event);
      expect(h2).toHaveBeenCalledWith(event);
    });

    it('increments receivedCount and handledCount metrics', async () => {
      bus.subscribe('AgentStarted', jest.fn());
      await Promise.resolve();

      simulateMessage('test:events:AgentStarted', makeStartedEvent());
      await Promise.resolve();

      const m = bus.getMetrics();
      expect(m.receivedCount).toBe(1);
      expect(m.handledCount).toBe(1);
    });

    it('ignores messages on unknown event types (no handlers)', async () => {
      bus.subscribe('AgentStarted', jest.fn());
      await Promise.resolve();

      // Simulate message for a type that has no handlers
      const event = createEvent(
        'AgentCompleted',
        { agentId: 'a', agentType: 'T', testRunId: 'r', result: { status: 'pass', duration: 0 } },
        'corr',
      );
      simulateMessage('test:events:AgentCompleted', event);
      await Promise.resolve();

      // handledCount should remain 0 since no AgentCompleted handler registered
      expect(bus.getMetrics().handledCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Dead-letter
  // -------------------------------------------------------------------------

  describe('dead-letter handling', () => {
    it('sends event to DLQ when handler throws', async () => {
      const throwingHandler = jest.fn().mockRejectedValue(new Error('crash'));
      bus.subscribe('AgentStarted', throwingHandler);
      await flushAsync();

      simulateMessage('test:events:AgentStarted', makeStartedEvent());
      await flushAsync();

      expect(bus.getMetrics().failedCount).toBe(1);
      expect(bus.getMetrics().deadLetterCount).toBe(1);
      expect(mockZadd).toHaveBeenCalled();
    });

    it('increments receivedCount even when handler fails', async () => {
      bus.subscribe('AgentStarted', jest.fn().mockRejectedValue(new Error('fail')));
      await flushAsync();

      simulateMessage('test:events:AgentStarted', makeStartedEvent());
      await flushAsync();

      expect(bus.getMetrics().receivedCount).toBe(1);
    });

    it('discards unparseable messages and increments failedCount', async () => {
      bus.subscribe('AgentStarted', jest.fn());
      await Promise.resolve();

      if (!capturedMessageCallback) throw new Error('No callback');
      capturedMessageCallback('test:events:AgentStarted', 'NOT_VALID_JSON{{{');
      await Promise.resolve();

      expect(bus.getMetrics().failedCount).toBe(1);
    });

    it('getDeadLetterEvents delegates to DeadLetterQueue.list', async () => {
      await bus.getDeadLetterEvents(10);
      expect(mockZrange).toHaveBeenCalledWith(
        expect.stringContaining('dead-letter'),
        0,
        9,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  describe('metrics', () => {
    it('returns a snapshot (not a live reference)', async () => {
      const m1 = bus.getMetrics();
      await bus.publish(makeStartedEvent());
      const m2 = bus.getMetrics();
      expect(m1.publishedCount).toBe(0);
      expect(m2.publishedCount).toBe(1);
    });

    it('resetMetrics zeros all counters', async () => {
      await bus.publish(makeStartedEvent());
      bus.resetMetrics();
      expect(bus.getMetrics()).toEqual({
        publishedCount: 0,
        receivedCount: 0,
        handledCount: 0,
        failedCount: 0,
        deadLetterCount: 0,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Correlation ID
  // -------------------------------------------------------------------------

  describe('correlationId propagation', () => {
    it('preserves correlationId through publish and receive', async () => {
      const correlationId = 'trace-xyz-unique';
      const event = createEvent(
        'AgentStarted',
        { agentId: 'a', agentType: 'T', testRunId: 'r' },
        correlationId,
      );

      let receivedCorrelationId: string | undefined;
      bus.subscribe('AgentStarted', (e) => {
        receivedCorrelationId = e.metadata.correlationId;
      });
      await Promise.resolve();

      simulateMessage('test:events:AgentStarted', event);
      await Promise.resolve();

      expect(receivedCorrelationId).toBe(correlationId);
    });
  });
});
