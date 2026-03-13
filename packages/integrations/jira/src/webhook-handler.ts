/**
 * Jira webhook event receiver and dispatcher.
 *
 * Validates incoming Jira webhook payloads (optional HMAC signature check),
 * parses them into typed events, and dispatches them to registered handlers.
 *
 * Jira webhook documentation:
 * https://developer.atlassian.com/server/jira/platform/webhooks/
 */

import { createHmac, timingSafeEqual } from 'crypto';

// ---------------------------------------------------------------------------
// Jira webhook payload types
// ---------------------------------------------------------------------------

export type JiraWebhookEventName =
  | 'jira:issue_created'
  | 'jira:issue_updated'
  | 'jira:issue_deleted'
  | 'comment_created'
  | 'comment_updated'
  | 'comment_deleted'
  | 'sprint_started'
  | 'sprint_closed'
  | 'sprint_updated'
  | 'board_updated'
  | string; // allow future/unknown events

export interface JiraWebhookIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: { id: string; name: string };
    issuetype: { id: string; name: string };
    project: { id: string; key: string; name: string };
    assignee: { accountId: string; displayName: string } | null;
    [field: string]: unknown;
  };
}

export interface JiraChangelogItem {
  field: string;
  fieldtype: string;
  fieldId?: string;
  from: string | null;
  fromString: string | null;
  to: string | null;
  toString: string | null;
}

export interface JiraChangelog {
  id: string;
  items: JiraChangelogItem[];
}

export interface JiraWebhookUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraSprintPayload {
  id: number;
  state: string;
  name: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
  boardId?: number;
}

/** Raw Jira webhook payload as received over HTTP. */
export interface JiraWebhookPayload {
  webhookEvent: JiraWebhookEventName;
  timestamp: number;
  issue?: JiraWebhookIssue;
  changelog?: JiraChangelog;
  comment?: Record<string, unknown>;
  user?: JiraWebhookUser;
  sprint?: JiraSprintPayload;
}

/** Typed wrapper enriching a raw payload with derived metadata. */
export interface JiraWebhookEvent {
  eventName: JiraWebhookEventName;
  timestamp: Date;
  raw: JiraWebhookPayload;
  /** Extracted status transition, if this is a status-change event. */
  statusTransition?: {
    fromStatus: string;
    toStatus: string;
  };
}

/** Handler signature for a specific event type. */
export type JiraEventHandler = (event: JiraWebhookEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a Jira webhook HMAC-SHA256 signature.
 *
 * Jira sends the signature in the `X-Hub-Signature` header as
 * `sha256=<hex-digest>`.
 *
 * @param rawBody   Raw request body bytes (before JSON parsing)
 * @param signature Value of the `X-Hub-Signature` header
 * @param secret    Webhook secret configured in Jira
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string,
  secret: string,
): boolean {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody;
  const prefix = 'sha256=';
  if (!signature.startsWith(prefix)) return false;

  const expectedHex = signature.slice(prefix.length);
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = createHmac('sha256', secret).update(body).digest();

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

function extractStatusTransition(
  payload: JiraWebhookPayload,
): JiraWebhookEvent['statusTransition'] {
  const items = payload.changelog?.items ?? [];
  const statusItem = items.find((item) => item.field === 'status');
  if (!statusItem) return undefined;
  return {
    fromStatus: statusItem.fromString ?? '',
    toStatus: statusItem.toString ?? '',
  };
}

/**
 * Parse a raw webhook payload object into a typed {@link JiraWebhookEvent}.
 */
export function parseWebhookEvent(payload: JiraWebhookPayload): JiraWebhookEvent {
  return {
    eventName: payload.webhookEvent,
    timestamp: new Date(payload.timestamp),
    raw: payload,
    statusTransition: extractStatusTransition(payload),
  };
}

// ---------------------------------------------------------------------------
// WebhookHandler class
// ---------------------------------------------------------------------------

/**
 * Processes incoming Jira webhook events.
 *
 * Usage:
 * ```ts
 * const handler = new WebhookHandler({ webhookSecret: '...' });
 *
 * handler.on('jira:issue_updated', async (event) => {
 *   // handle status change
 * });
 *
 * // Inside an Express route:
 * await handler.handle(rawBodyBuffer, signatureHeader, parsedBody);
 * ```
 */
export class WebhookHandler {
  private readonly webhookSecret?: string;
  private readonly handlers = new Map<JiraWebhookEventName, JiraEventHandler[]>();
  private readonly catchAllHandlers: JiraEventHandler[] = [];

  constructor(options: { webhookSecret?: string } = {}) {
    this.webhookSecret = options.webhookSecret;
  }

  /**
   * Register a handler for a specific Jira webhook event type.
   * Multiple handlers can be registered for the same event.
   */
  on(eventName: JiraWebhookEventName, handler: JiraEventHandler): this {
    const existing = this.handlers.get(eventName) ?? [];
    this.handlers.set(eventName, [...existing, handler]);
    return this;
  }

  /**
   * Register a handler that receives ALL Jira webhook events regardless of
   * type.
   */
  onAny(handler: JiraEventHandler): this {
    this.catchAllHandlers.push(handler);
    return this;
  }

  /**
   * Process an incoming Jira webhook request.
   *
   * @param rawBody   Raw request body (used for signature verification)
   * @param signature Value of the `X-Hub-Signature` header (may be undefined)
   * @param payload   Parsed JSON body
   * @throws {WebhookSignatureError} when signature verification fails
   */
  async handle(
    rawBody: Buffer | string,
    signature: string | undefined,
    payload: JiraWebhookPayload,
  ): Promise<void> {
    if (this.webhookSecret) {
      if (!signature) {
        throw new WebhookSignatureError('Missing X-Hub-Signature header');
      }
      if (!verifyWebhookSignature(rawBody, signature, this.webhookSecret)) {
        throw new WebhookSignatureError('Invalid webhook signature');
      }
    }

    const event = parseWebhookEvent(payload);
    await this.dispatch(event);
  }

  private async dispatch(event: JiraWebhookEvent): Promise<void> {
    const specificHandlers = this.handlers.get(event.eventName) ?? [];
    const allHandlers = [...specificHandlers, ...this.catchAllHandlers];

    await Promise.all(allHandlers.map((h) => h(event)));
  }
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}
