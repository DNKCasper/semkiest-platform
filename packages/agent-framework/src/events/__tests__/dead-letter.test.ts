import { DeadLetterQueue } from '../dead-letter';
import type { AgentEvent } from '../types';
import { createEvent } from '../types';

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------

const mockZadd = jest.fn().mockResolvedValue(1);
const mockExpire = jest.fn().mockResolvedValue(1);
const mockZrange = jest.fn().mockResolvedValue([]);
const mockZrem = jest.fn().mockResolvedValue(1);
const mockZcard = jest.fn().mockResolvedValue(0);

const mockRedis = {
  zadd: mockZadd,
  expire: mockExpire,
  zrange: mockZrange,
  zrem: mockZrem,
  zcard: mockZcard,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(): AgentEvent {
  return createEvent(
    'AgentStarted',
    { agentId: 'a-1', agentType: 'BrowserAgent', testRunId: 'run-1' },
    'corr-abc',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dlq = new DeadLetterQueue(mockRedis as any, 'semkiest', 3600, 3);
  });

  describe('push', () => {
    it('stores the event in a Redis sorted set', async () => {
      const event = makeEvent();
      await dlq.push(event, 'semkiest:events:AgentStarted', new Error('handler blew up'));

      expect(mockZadd).toHaveBeenCalledTimes(1);
      const [key, score, raw] = mockZadd.mock.calls[0] as [string, number, string];
      expect(key).toBe('semkiest:events:dead-letter');
      expect(typeof score).toBe('number');

      const stored = JSON.parse(raw);
      expect(stored.originalEvent.id).toBe(event.id);
      expect(stored.failureReason).toBe('handler blew up');
      expect(stored.retryCount).toBe(0);
    });

    it('sets TTL on the dead-letter key', async () => {
      await dlq.push(makeEvent(), 'ch', new Error('boom'));
      expect(mockExpire).toHaveBeenCalledWith('semkiest:events:dead-letter', 3600);
    });

    it('stores non-Error failure reasons as strings', async () => {
      await dlq.push(makeEvent(), 'ch', 'string error');
      const [, , raw] = mockZadd.mock.calls[0] as [string, number, string];
      expect(JSON.parse(raw).failureReason).toBe('string error');
    });
  });

  describe('list', () => {
    it('returns empty array when queue is empty', async () => {
      mockZrange.mockResolvedValueOnce([]);
      const result = await dlq.list();
      expect(result).toEqual([]);
    });

    it('deserialises stored entries', async () => {
      const event = makeEvent();
      const entry = {
        originalEvent: event,
        failureReason: 'test',
        failedAt: new Date().toISOString(),
        retryCount: 0,
        channel: 'ch',
      };
      mockZrange.mockResolvedValueOnce([JSON.stringify(entry)]);

      const result = await dlq.list();
      expect(result).toHaveLength(1);
      expect(result[0].originalEvent.id).toBe(event.id);
    });

    it('respects the limit parameter', async () => {
      mockZrange.mockResolvedValueOnce([]);
      await dlq.list(50);
      expect(mockZrange).toHaveBeenCalledWith('semkiest:events:dead-letter', 0, 49);
    });
  });

  describe('retry', () => {
    it('re-publishes the event and removes it from the queue', async () => {
      const event = makeEvent();
      const entry = {
        originalEvent: event,
        failureReason: 'test',
        failedAt: new Date().toISOString(),
        retryCount: 0,
        channel: 'ch',
      };
      const raw = JSON.stringify(entry);
      mockZrange.mockResolvedValueOnce([raw]);

      const publish = jest.fn().mockResolvedValue(undefined);
      const result = await dlq.retry(0, publish);

      expect(result).toBe(true);
      expect(publish).toHaveBeenCalledWith(event);
      expect(mockZrem).toHaveBeenCalledWith('semkiest:events:dead-letter', raw);
    });

    it('returns false when queue is empty at index', async () => {
      mockZrange.mockResolvedValueOnce([]);
      const result = await dlq.retry(0, jest.fn());
      expect(result).toBe(false);
    });

    it('discards event when retry limit is exceeded', async () => {
      const entry = {
        originalEvent: makeEvent(),
        failureReason: 'test',
        failedAt: new Date().toISOString(),
        retryCount: 3, // already at max
        channel: 'ch',
      };
      mockZrange.mockResolvedValueOnce([JSON.stringify(entry)]);

      const publish = jest.fn();
      const result = await dlq.retry(0, publish);

      expect(result).toBe(false);
      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('count', () => {
    it('delegates to redis.zcard', async () => {
      mockZcard.mockResolvedValueOnce(5);
      const result = await dlq.count();
      expect(result).toBe(5);
      expect(mockZcard).toHaveBeenCalledWith('semkiest:events:dead-letter');
    });
  });
});
