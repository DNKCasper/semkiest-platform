import { createHmac } from 'crypto';
import {
  parseWebhookEvent,
  verifyWebhookSignature,
  WebhookHandler,
  WebhookSignatureError,
  JiraWebhookPayload,
} from '../webhook-handler.js';

const samplePayload: JiraWebhookPayload = {
  webhookEvent: 'jira:issue_updated',
  timestamp: 1741864800000,
  issue: {
    id: '10001',
    key: 'SEM-42',
    self: 'https://test.atlassian.net/rest/api/3/issue/10001',
    fields: {
      summary: 'Test issue',
      status: { id: '3', name: 'In Progress' },
      issuetype: { id: '10001', name: 'Story' },
      project: { id: '10000', key: 'SEM', name: 'SemkiEst' },
      assignee: null,
    },
  },
  changelog: {
    id: 'c1',
    items: [
      {
        field: 'status',
        fieldtype: 'jira',
        from: '10000',
        fromString: 'To Do',
        to: '10001',
        toString: 'In Progress',
      },
    ],
  },
};

const secret = 'test-webhook-secret';

function signPayload(body: string, s: string): string {
  const digest = createHmac('sha256', s).update(body).digest('hex');
  return `sha256=${digest}`;
}

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify(samplePayload);

  it('returns true for a valid signature', () => {
    const sig = signPayload(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const sig = signPayload(body, secret);
    expect(verifyWebhookSignature(body + 'x', sig, secret)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const sig = signPayload(body, 'wrong-secret');
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });

  it('returns false when signature prefix is missing', () => {
    const digest = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, digest, secret)).toBe(false);
  });
});

describe('parseWebhookEvent', () => {
  it('extracts event name and timestamp', () => {
    const event = parseWebhookEvent(samplePayload);
    expect(event.eventName).toBe('jira:issue_updated');
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('extracts status transition from changelog', () => {
    const event = parseWebhookEvent(samplePayload);
    expect(event.statusTransition).toEqual({
      fromStatus: 'To Do',
      toStatus: 'In Progress',
    });
  });

  it('sets statusTransition to undefined when no status change', () => {
    const payload: JiraWebhookPayload = {
      ...samplePayload,
      changelog: { id: 'c2', items: [{ field: 'assignee', fieldtype: 'jira', from: null, fromString: null, to: 'acc1', toString: 'Alice' }] },
    };
    const event = parseWebhookEvent(payload);
    expect(event.statusTransition).toBeUndefined();
  });
});

describe('WebhookHandler', () => {
  const body = JSON.stringify(samplePayload);

  it('dispatches to registered event handler', async () => {
    const handler = new WebhookHandler();
    const received: unknown[] = [];

    handler.on('jira:issue_updated', (event) => {
      received.push(event);
    });

    await handler.handle(body, undefined, samplePayload);
    expect(received).toHaveLength(1);
  });

  it('dispatches to catch-all handler', async () => {
    const handler = new WebhookHandler();
    const received: unknown[] = [];

    handler.onAny((event) => {
      received.push(event);
    });

    await handler.handle(body, undefined, samplePayload);
    expect(received).toHaveLength(1);
  });

  it('does not call unrelated event handlers', async () => {
    const handler = new WebhookHandler();
    const received: unknown[] = [];

    handler.on('jira:issue_created', (event) => {
      received.push(event);
    });

    await handler.handle(body, undefined, samplePayload);
    expect(received).toHaveLength(0);
  });

  describe('with webhook secret', () => {
    it('accepts request with valid signature', async () => {
      const handler = new WebhookHandler({ webhookSecret: secret });
      handler.on('jira:issue_updated', () => {});
      const sig = signPayload(body, secret);
      await expect(handler.handle(body, sig, samplePayload)).resolves.toBeUndefined();
    });

    it('throws WebhookSignatureError for invalid signature', async () => {
      const handler = new WebhookHandler({ webhookSecret: secret });
      const sig = signPayload(body, 'wrong-secret');
      await expect(handler.handle(body, sig, samplePayload)).rejects.toBeInstanceOf(
        WebhookSignatureError,
      );
    });

    it('throws WebhookSignatureError when signature is missing', async () => {
      const handler = new WebhookHandler({ webhookSecret: secret });
      await expect(handler.handle(body, undefined, samplePayload)).rejects.toBeInstanceOf(
        WebhookSignatureError,
      );
    });
  });
});
