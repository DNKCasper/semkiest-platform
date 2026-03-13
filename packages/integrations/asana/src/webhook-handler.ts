import { createHmac, timingSafeEqual } from 'crypto';
import { AsanaWebhookEvent, AsanaWebhookPayload } from './types';

/** Callback invoked for each matching Asana webhook event. */
export type WebhookEventHandler = (event: AsanaWebhookEvent) => Promise<void>;

/** Event key pattern used with {@link AsanaWebhookHandler.on}. */
export type WebhookEventKey =
  | 'task:added'
  | 'task:removed'
  | 'task:deleted'
  | 'task:undeleted'
  | 'task:changed'
  | 'project:added'
  | 'project:changed'
  | 'project:deleted'
  | (string & Record<never, never>); // allow arbitrary "<type>:<action>" strings

export interface WebhookHandlerOptions {
  /** HMAC-SHA256 secret provided when the Asana webhook was registered. */
  secret: string;
  /** Shorthand handler for task-changed events. */
  onTaskChanged?: WebhookEventHandler;
  /** Shorthand handler for task-added events. */
  onTaskAdded?: WebhookEventHandler;
  /** Shorthand handler for task-removed events. */
  onTaskRemoved?: WebhookEventHandler;
  /** Shorthand handler for task-deleted events. */
  onTaskDeleted?: WebhookEventHandler;
}

/**
 * Processes incoming Asana webhook payloads.
 *
 * Responsibilities:
 * - Validates HMAC-SHA256 signatures sent in the `X-Hook-Secret` /
 *   `X-Hook-Signature` headers.
 * - Dispatches individual events to registered handlers by event key
 *   (`"<resource_type>:<action>"`).
 * - Supports a catch-all `"*"` handler for logging or auditing.
 *
 * @example
 * ```ts
 * const handler = new AsanaWebhookHandler({
 *   secret: process.env.ASANA_WEBHOOK_SECRET,
 *   onTaskChanged: async (event) => { ... },
 * });
 *
 * // In an Express route:
 * app.post('/webhooks/asana', async (req, res) => {
 *   const sig = req.headers['x-hook-signature'] as string;
 *   if (!handler.validateSignature(rawBody, sig)) {
 *     return res.status(401).send('Invalid signature');
 *   }
 *   await handler.processPayload(req.body);
 *   res.sendStatus(200);
 * });
 * ```
 */
export class AsanaWebhookHandler {
  private readonly secret: string;
  private readonly handlers: Map<string, WebhookEventHandler[]> = new Map();

  constructor(options: WebhookHandlerOptions) {
    this.secret = options.secret;

    if (options.onTaskChanged) this.on('task:changed', options.onTaskChanged);
    if (options.onTaskAdded) this.on('task:added', options.onTaskAdded);
    if (options.onTaskRemoved) this.on('task:removed', options.onTaskRemoved);
    if (options.onTaskDeleted) this.on('task:deleted', options.onTaskDeleted);
  }

  /**
   * Registers a handler for events matching the given key.
   *
   * Use `"*"` to receive all events regardless of type or action.
   *
   * @returns `this` for chaining.
   */
  on(eventKey: WebhookEventKey, handler: WebhookEventHandler): this {
    const existing = this.handlers.get(eventKey) ?? [];
    this.handlers.set(eventKey, [...existing, handler]);
    return this;
  }

  /**
   * Removes all handlers for the given event key.
   *
   * @returns `this` for chaining.
   */
  off(eventKey: WebhookEventKey): this {
    this.handlers.delete(eventKey);
    return this;
  }

  /**
   * Validates the HMAC-SHA256 signature supplied by Asana.
   *
   * Asana sends the signature as the hex digest in the `X-Hook-Signature`
   * header. Use {@link timingSafeEqual} to prevent timing attacks.
   *
   * @param payload - Raw request body string (before JSON parsing).
   * @param signature - Value of the `X-Hook-Signature` header.
   */
  validateSignature(payload: string, signature: string): boolean {
    try {
      const hmac = createHmac('sha256', this.secret);
      hmac.update(payload);
      const expected = hmac.digest('hex');

      // Both buffers must be the same length for timingSafeEqual.
      const expectedBuf = Buffer.from(expected, 'utf8');
      const signatureBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== signatureBuf.length) {
        return false;
      }

      return timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
      return false;
    }
  }

  /**
   * Dispatches every event in the payload to its registered handlers.
   *
   * All handlers for a single event run in parallel; events themselves are
   * processed in parallel as well.
   */
  async processPayload(payload: AsanaWebhookPayload): Promise<void> {
    await Promise.all(payload.events.map((event) => this.dispatchEvent(event)));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async dispatchEvent(event: AsanaWebhookEvent): Promise<void> {
    const { resource_type } = event.resource;
    const eventKey = `${resource_type}:${event.action}`;

    const handlers: WebhookEventHandler[] = [
      ...(this.handlers.get(eventKey) ?? []),
      ...(this.handlers.get('*') ?? []),
    ];

    await Promise.all(handlers.map((handler) => handler(event)));
  }
}
