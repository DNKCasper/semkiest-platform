import { Router, Request, Response, NextFunction } from 'express';
import { WebClient } from '@slack/web-api';
import {
  handleInteractivePayload,
  handleSlashCommand,
  InteractiveHandlerOptions,
  SlackInteractivePayload,
  SlackSlashCommandPayload,
  verifySlackRequest,
} from '@semkiest/slack-integration';

/** Shape of the Slack config passed when mounting this router. */
export interface SlackRouterConfig {
  /** Slack app signing secret for request verification. */
  signingSecret: string;
  /** Slack Web API client (authenticated with SLACK_BOT_TOKEN). */
  slackClient: WebClient;
  /** Base URL of this API server, used to build dashboard links. */
  apiBaseUrl: string;
  /** Optional internal API key for service-to-service calls. */
  internalApiKey?: string;
}

/**
 * Creates and returns an Express Router for Slack slash commands and
 * interactive component callbacks.
 *
 * Mount at a path like `/integrations/slack`:
 * ```
 * app.use('/integrations/slack', createSlackRouter(config));
 * ```
 *
 * Required Slack app configuration:
 * - Slash command request URL:  POST /integrations/slack/commands
 * - Interactivity request URL:  POST /integrations/slack/interactions
 */
export function createSlackRouter(config: SlackRouterConfig): Router {
  const router = Router();

  // Slack sends bodies as application/x-www-form-urlencoded for slash commands
  // and also for interactive payloads. We need the raw body for signature
  // verification, so we capture it in a buffer before any parsing.
  router.use(captureRawBody);

  /**
   * POST /commands
   *
   * Receives slash command payloads from Slack (/semkiest run/status/help).
   * Responds immediately with a Block Kit message.
   */
  router.post('/commands', async (req: Request, res: Response): Promise<void> => {
    const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
    const signature = req.headers['x-slack-signature'] as string | undefined;
    const rawBody = (req as RequestWithRawBody).rawBody ?? '';

    if (!timestamp || !signature) {
      res.status(400).json({ error: 'Missing Slack signature headers' });
      return;
    }

    if (!verifySlackRequest(config.signingSecret, rawBody, timestamp, signature)) {
      res.status(401).json({ error: 'Invalid Slack signature' });
      return;
    }

    const payload = req.body as SlackSlashCommandPayload;

    const handlerOptions = {
      apiBaseUrl: config.apiBaseUrl,
      internalApiKey: config.internalApiKey,
    };

    const slackResponse = await handleSlashCommand(payload, handlerOptions).catch(
      (err: unknown) => {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        return {
          response_type: 'ephemeral' as const,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `:x: *Error:* ${message}\n\nPlease try again or contact your SemkiEst administrator.`,
              },
            },
          ],
        };
      },
    );

    res.status(200).json(slackResponse);
  });

  /**
   * POST /interactions
   *
   * Receives interactive component payloads from Slack (button clicks, etc.).
   * Must acknowledge with 200 immediately; follow-up messages are sent via response_url.
   */
  router.post('/interactions', async (req: Request, res: Response): Promise<void> => {
    const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
    const signature = req.headers['x-slack-signature'] as string | undefined;
    const rawBody = (req as RequestWithRawBody).rawBody ?? '';

    if (!timestamp || !signature) {
      res.status(400).json({ error: 'Missing Slack signature headers' });
      return;
    }

    if (!verifySlackRequest(config.signingSecret, rawBody, timestamp, signature)) {
      res.status(401).json({ error: 'Invalid Slack signature' });
      return;
    }

    // Slack sends interactive payloads as a JSON string in the `payload` form field.
    let interactivePayload: SlackInteractivePayload;
    try {
      interactivePayload = JSON.parse(req.body.payload as string) as SlackInteractivePayload;
    } catch {
      res.status(400).json({ error: 'Invalid payload JSON' });
      return;
    }

    // Acknowledge immediately — Slack requires a response within 3 seconds.
    res.status(200).send();

    // Process the interaction asynchronously after responding.
    const handlerOptions: InteractiveHandlerOptions = {
      slackClient: config.slackClient,
      apiBaseUrl: config.apiBaseUrl,
      internalApiKey: config.internalApiKey,
    };

    await handleInteractivePayload(interactivePayload, handlerOptions).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Log the error — we've already sent 200 so we can't surface it to Slack here.
      console.error('[SlackRouter] Interactive handler error:', message);
    });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

/**
 * Express middleware that captures the raw request body as a UTF-8 string
 * before any body-parser middleware processes it. Required for Slack
 * signature verification.
 */
function captureRawBody(req: RequestWithRawBody, _res: Response, next: NextFunction): void {
  const chunks: Buffer[] = [];

  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    req.rawBody = rawBody;

    // Re-parse body fields from the captured raw body so that req.body is
    // populated for both URL-encoded (slash commands) and JSON payloads.
    if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      req.body = Object.fromEntries(new URLSearchParams(rawBody));
    } else if (req.headers['content-type']?.includes('application/json')) {
      try {
        req.body = JSON.parse(rawBody) as unknown;
      } catch {
        req.body = {};
      }
    }

    next();
  });

  req.on('error', (err) => {
    next(err);
  });
}
