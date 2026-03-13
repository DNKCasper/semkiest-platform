import { PubSubManager } from './pubsub.js';
import type { RedisConfig, PubSubMessage } from './types.js';
import { PUBSUB_CHANNELS } from './types.js';

// Mock ioredis so we don't need a real Redis server
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(1),
    on: jest.fn().mockImplementation(function (
      this: Record<string, jest.Mock>,
      _event: string,
      _handler: unknown,
    ) {
      return this;
    }),
  }));
});

const Redis = require('ioredis') as jest.Mock;

function makePublisher(): jest.Mocked<{
  publish: jest.Mock;
}> {
  return { publish: jest.fn().mockResolvedValue(1) } as never;
}

const TEST_CONFIG: RedisConfig = { url: 'redis://localhost:6379' };

describe('PubSubManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates a subscriber Redis instance', () => {
      const publisher = makePublisher();
      new PubSubManager(publisher as never, TEST_CONFIG);
      expect(Redis).toHaveBeenCalledWith(TEST_CONFIG.url, expect.objectContaining({ lazyConnect: true }));
    });
  });

  describe('connect', () => {
    it('connects the subscriber client', async () => {
      const publisher = makePublisher();
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      await mgr.connect();
      const subscriberInstance = Redis.mock.results[0]?.value as { connect: jest.Mock };
      expect(subscriberInstance.connect).toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('issues SUBSCRIBE on first callback for a channel', async () => {
      const publisher = makePublisher();
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      const cb = jest.fn();
      await mgr.subscribe(PUBSUB_CHANNELS.TEST_PROGRESS, cb);
      const sub = Redis.mock.results[0]?.value as { subscribe: jest.Mock };
      expect(sub.subscribe).toHaveBeenCalledWith(PUBSUB_CHANNELS.TEST_PROGRESS);
    });

    it('does not re-issue SUBSCRIBE for subsequent callbacks on same channel', async () => {
      const publisher = makePublisher();
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      await mgr.subscribe(PUBSUB_CHANNELS.TEST_PROGRESS, jest.fn());
      await mgr.subscribe(PUBSUB_CHANNELS.TEST_PROGRESS, jest.fn());
      const sub = Redis.mock.results[0]?.value as { subscribe: jest.Mock };
      expect(sub.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe', () => {
    it('issues UNSUBSCRIBE when last callback is removed', async () => {
      const publisher = makePublisher();
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      const cb = jest.fn();
      await mgr.subscribe(PUBSUB_CHANNELS.AGENT_STATUS, cb);
      await mgr.unsubscribe(PUBSUB_CHANNELS.AGENT_STATUS, cb);
      const sub = Redis.mock.results[0]?.value as { unsubscribe: jest.Mock };
      expect(sub.unsubscribe).toHaveBeenCalledWith(PUBSUB_CHANNELS.AGENT_STATUS);
    });

    it('does not issue UNSUBSCRIBE when other callbacks remain', async () => {
      const publisher = makePublisher();
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      await mgr.subscribe(PUBSUB_CHANNELS.TEST_RESULT, cb1);
      await mgr.subscribe(PUBSUB_CHANNELS.TEST_RESULT, cb2);
      await mgr.unsubscribe(PUBSUB_CHANNELS.TEST_RESULT, cb1);
      const sub = Redis.mock.results[0]?.value as { unsubscribe: jest.Mock };
      expect(sub.unsubscribe).not.toHaveBeenCalled();
    });

    it('is a no-op for a channel with no subscriptions', async () => {
      const publisher = makePublisher();
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      // Should not throw
      await mgr.unsubscribe(PUBSUB_CHANNELS.TEST_PROGRESS, jest.fn());
    });
  });

  describe('publish', () => {
    it('publishes a JSON-serialised PubSubMessage envelope', async () => {
      const publishMock = jest.fn().mockResolvedValue(2);
      const publisher = { publish: publishMock };
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      const count = await mgr.publish(PUBSUB_CHANNELS.TEST_PROGRESS, { status: 'running' });
      expect(count).toBe(2);
      const [channel, payload] = publishMock.mock.calls[0] as [string, string];
      expect(channel).toBe(PUBSUB_CHANNELS.TEST_PROGRESS);
      const parsed = JSON.parse(payload) as PubSubMessage<{ status: string }>;
      expect(parsed.channel).toBe(PUBSUB_CHANNELS.TEST_PROGRESS);
      expect(parsed.data).toEqual({ status: 'running' });
      expect(typeof parsed.publishedAt).toBe('string');
    });
  });

  describe('disconnect', () => {
    it('unsubscribes from all channels and quits', async () => {
      const publisher = makePublisher();
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      await mgr.subscribe(PUBSUB_CHANNELS.TEST_PROGRESS, jest.fn());
      await mgr.subscribe(PUBSUB_CHANNELS.AGENT_STATUS, jest.fn());
      await mgr.disconnect();
      const sub = Redis.mock.results[0]?.value as { unsubscribe: jest.Mock; quit: jest.Mock };
      expect(sub.unsubscribe).toHaveBeenCalledWith(
        expect.stringContaining(''),
        expect.stringContaining(''),
      );
      expect(sub.quit).toHaveBeenCalled();
    });

    it('quits without unsubscribing when no channels are active', async () => {
      const publisher = makePublisher();
      const mgr = new PubSubManager(publisher as never, TEST_CONFIG);
      await mgr.disconnect();
      const sub = Redis.mock.results[0]?.value as { unsubscribe: jest.Mock; quit: jest.Mock };
      expect(sub.unsubscribe).not.toHaveBeenCalled();
      expect(sub.quit).toHaveBeenCalled();
    });
  });
});
