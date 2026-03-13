import { createHmac } from 'crypto';
import { AsanaWebhookHandler } from '../webhook-handler';
import { AsanaWebhookEvent, AsanaWebhookPayload } from '../types';

const SECRET = 'super-secret-webhook-key';

function makeSignature(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

const makeEvent = (overrides: Partial<AsanaWebhookEvent> = {}): AsanaWebhookEvent => ({
  action: 'changed',
  resource: { gid: 'task-1', resource_type: 'task' },
  parent: null,
  created_at: '2024-01-01T00:00:00.000Z',
  user: null,
  ...overrides,
});

describe('AsanaWebhookHandler', () => {
  describe('validateSignature', () => {
    it('returns true for a correct signature', () => {
      const handler = new AsanaWebhookHandler({ secret: SECRET });
      const payload = JSON.stringify({ events: [] });
      const sig = makeSignature(payload);

      expect(handler.validateSignature(payload, sig)).toBe(true);
    });

    it('returns false for an incorrect signature', () => {
      const handler = new AsanaWebhookHandler({ secret: SECRET });

      expect(handler.validateSignature('payload', 'wrong-sig')).toBe(false);
    });

    it('returns false when signature is an empty string', () => {
      const handler = new AsanaWebhookHandler({ secret: SECRET });

      expect(handler.validateSignature('payload', '')).toBe(false);
    });

    it('handles errors gracefully and returns false', () => {
      const handler = new AsanaWebhookHandler({ secret: SECRET });
      // null coerced to string should not throw
      expect(handler.validateSignature('payload', null as unknown as string)).toBe(false);
    });
  });

  describe('processPayload', () => {
    it('dispatches changed task events to onTaskChanged handler', async () => {
      const onTaskChanged = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET, onTaskChanged });

      const payload: AsanaWebhookPayload = {
        events: [makeEvent({ action: 'changed' })],
      };

      await handler.processPayload(payload);

      expect(onTaskChanged).toHaveBeenCalledTimes(1);
      expect(onTaskChanged).toHaveBeenCalledWith(payload.events[0]);
    });

    it('dispatches added task events to onTaskAdded handler', async () => {
      const onTaskAdded = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET, onTaskAdded });

      await handler.processPayload({
        events: [makeEvent({ action: 'added' })],
      });

      expect(onTaskAdded).toHaveBeenCalledTimes(1);
    });

    it('dispatches removed task events to onTaskRemoved handler', async () => {
      const onTaskRemoved = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET, onTaskRemoved });

      await handler.processPayload({ events: [makeEvent({ action: 'removed' })] });

      expect(onTaskRemoved).toHaveBeenCalledTimes(1);
    });

    it('dispatches deleted task events to onTaskDeleted handler', async () => {
      const onTaskDeleted = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET, onTaskDeleted });

      await handler.processPayload({ events: [makeEvent({ action: 'deleted' })] });

      expect(onTaskDeleted).toHaveBeenCalledTimes(1);
    });

    it('calls catch-all "*" handler for any event', async () => {
      const catchAll = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET });
      handler.on('*', catchAll);

      const events = [
        makeEvent({ action: 'changed' }),
        makeEvent({ action: 'added', resource: { gid: 'p1', resource_type: 'project' } }),
      ];

      await handler.processPayload({ events });

      expect(catchAll).toHaveBeenCalledTimes(2);
    });

    it('does not invoke handlers when there are no matching events', async () => {
      const onTaskChanged = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET, onTaskChanged });

      await handler.processPayload({
        events: [makeEvent({ action: 'added' })],
      });

      expect(onTaskChanged).not.toHaveBeenCalled();
    });

    it('processes an empty events array without error', async () => {
      const handler = new AsanaWebhookHandler({ secret: SECRET });
      await expect(handler.processPayload({ events: [] })).resolves.toBeUndefined();
    });

    it('dispatches multiple events to their respective handlers', async () => {
      const onTaskChanged = jest.fn().mockResolvedValue(undefined);
      const onTaskAdded = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET, onTaskChanged, onTaskAdded });

      await handler.processPayload({
        events: [
          makeEvent({ action: 'changed' }),
          makeEvent({ action: 'changed' }),
          makeEvent({ action: 'added' }),
        ],
      });

      expect(onTaskChanged).toHaveBeenCalledTimes(2);
      expect(onTaskAdded).toHaveBeenCalledTimes(1);
    });
  });

  describe('on / off', () => {
    it('allows chaining multiple on() calls', async () => {
      const h1 = jest.fn().mockResolvedValue(undefined);
      const h2 = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET });

      handler.on('task:changed', h1).on('task:changed', h2);

      await handler.processPayload({ events: [makeEvent({ action: 'changed' })] });

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('removes all handlers for an event key with off()', async () => {
      const onChanged = jest.fn().mockResolvedValue(undefined);
      const handler = new AsanaWebhookHandler({ secret: SECRET, onTaskChanged: onChanged });

      handler.off('task:changed');

      await handler.processPayload({ events: [makeEvent({ action: 'changed' })] });

      expect(onChanged).not.toHaveBeenCalled();
    });
  });
});
