/**
 * Jira integration API routes.
 *
 * Endpoints:
 *  POST   /api/integrations/jira/webhook              – receive Jira webhook events
 *  GET    /api/integrations/jira/config               – retrieve current config
 *  PUT    /api/integrations/jira/config               – update config
 *  GET    /api/integrations/jira/issues/:issueKey/ac  – read acceptance criteria
 *  POST   /api/integrations/jira/issues/:issueKey/sync – manually sync test result
 */

import { Request, Response, Router } from 'express';
import {
  AcReader,
  JiraConfigManager,
  JiraIntegrationConfig,
  JiraIntegrationConfigUpdate,
  StatusSync,
  TestSuiteResult,
  WebhookHandler,
  WebhookSignatureError,
} from '@semkiest/jira-integration';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** In-memory config manager. Replace with a DB-backed implementation in production. */
const configManager = new JiraConfigManager();

/** Webhook handler singleton; re-created when config changes. */
let webhookHandler: WebhookHandler | null = null;

function getWebhookHandler(): WebhookHandler {
  if (!webhookHandler) {
    const config = configManager.get();
    webhookHandler = new WebhookHandler({ webhookSecret: config.webhookSecret });

    // Log all incoming events (extend with domain logic as needed)
    webhookHandler.onAny((event) => {
      console.info(
        `[Jira Webhook] event=${event.eventName} issue=${event.raw.issue?.key ?? 'n/a'}`,
        event.statusTransition
          ? `status: ${event.statusTransition.fromStatus} → ${event.statusTransition.toStatus}`
          : '',
      );
    });
  }
  return webhookHandler;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/integrations/jira/webhook
 *
 * Receives Jira webhook events. Verifies HMAC signature when a webhook secret
 * is configured.
 */
async function handleWebhook(req: Request, res: Response): Promise<void> {
  if (!configManager.isConfigured()) {
    res.status(503).json({ error: 'Jira integration is not configured' });
    return;
  }

  const signature = req.headers['x-hub-signature'] as string | undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  try {
    const handler = getWebhookHandler();
    await handler.handle(rawBody ?? Buffer.from(JSON.stringify(req.body)), signature, req.body);
    res.status(200).json({ received: true });
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error('[Jira Webhook] Processing error:', err);
    res.status(500).json({ error: 'Failed to process webhook event' });
  }
}

/**
 * GET /api/integrations/jira/config
 *
 * Returns the current integration configuration. The API token is redacted.
 */
function getConfig(_req: Request, res: Response): void {
  if (!configManager.isConfigured()) {
    res.status(404).json({ error: 'Jira integration is not configured' });
    return;
  }

  const config = configManager.get();
  const safe = { ...config, apiToken: '***' };
  res.json(safe);
}

/**
 * PUT /api/integrations/jira/config
 *
 * Creates or replaces the Jira integration configuration.
 *
 * Body: {@link JiraIntegrationConfig}
 */
function putConfig(req: Request, res: Response): void {
  const body = req.body as JiraIntegrationConfig;

  if (!body.baseUrl || !body.email || !body.apiToken) {
    res.status(400).json({ error: 'baseUrl, email, and apiToken are required' });
    return;
  }

  configManager.load({
    baseUrl: body.baseUrl,
    email: body.email,
    apiToken: body.apiToken,
    projectMappings: body.projectMappings ?? [],
    fieldMappings: body.fieldMappings ?? [],
    workflowMappings: body.workflowMappings ?? [],
    webhookSecret: body.webhookSecret,
  });

  // Reset webhook handler so it picks up any new secret
  webhookHandler = null;

  res.json({ updated: true });
}

/**
 * PATCH /api/integrations/jira/config
 *
 * Applies a partial update to the existing configuration.
 *
 * Body: {@link JiraIntegrationConfigUpdate}
 */
function patchConfig(req: Request, res: Response): void {
  if (!configManager.isConfigured()) {
    res.status(404).json({ error: 'Jira integration is not configured' });
    return;
  }

  const patch = req.body as JiraIntegrationConfigUpdate;
  const updated = configManager.update(patch);
  webhookHandler = null;

  const safe = { ...updated, apiToken: '***' };
  res.json(safe);
}

/**
 * GET /api/integrations/jira/issues/:issueKey/ac
 *
 * Fetch and return parsed acceptance criteria for a Jira issue.
 *
 * Query params:
 *  - acCustomField (optional): custom field ID that holds AC, e.g. customfield_10016
 *  - generateTestCases (optional): if "true", also return generated test case specs
 */
async function getAcceptanceCriteria(req: Request, res: Response): Promise<void> {
  if (!configManager.isConfigured()) {
    res.status(503).json({ error: 'Jira integration is not configured' });
    return;
  }

  const { issueKey } = req.params;
  const { acCustomField, generateTestCases } = req.query;

  if (!issueKey) {
    res.status(400).json({ error: 'issueKey is required' });
    return;
  }

  try {
    const config = configManager.get();
    const reader = new AcReader(config);
    const ac = await reader.readAcceptanceCriteria(
      issueKey,
      typeof acCustomField === 'string' ? acCustomField : undefined,
    );

    const response: Record<string, unknown> = { ac };

    if (generateTestCases === 'true') {
      response['testCases'] = reader.generateTestCases(ac);
    }

    res.json(response);
  } catch (err) {
    console.error(`[Jira AC] Error reading ${issueKey}:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Failed to read acceptance criteria: ${message}` });
  }
}

/**
 * POST /api/integrations/jira/issues/:issueKey/sync
 *
 * Manually trigger a test result sync for a Jira issue.
 *
 * Body: {@link TestSuiteResult} (without issueKey – taken from the URL param)
 */
async function syncIssue(req: Request, res: Response): Promise<void> {
  if (!configManager.isConfigured()) {
    res.status(503).json({ error: 'Jira integration is not configured' });
    return;
  }

  const { issueKey } = req.params;

  if (!issueKey) {
    res.status(400).json({ error: 'issueKey is required' });
    return;
  }

  const body = req.body as Omit<TestSuiteResult, 'issueKey'>;

  if (!body.suiteId || !body.suiteStatus || !body.semProjectId) {
    res.status(400).json({ error: 'suiteId, suiteStatus, and semProjectId are required' });
    return;
  }

  try {
    const config = configManager.get();
    const sync = new StatusSync(config);
    const outcome = await sync.syncResult({
      ...body,
      issueKey,
      results: body.results ?? [],
      completedAt: body.completedAt ?? new Date().toISOString(),
    });

    res.json({ outcome });
  } catch (err) {
    console.error(`[Jira Sync] Error syncing ${issueKey}:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Failed to sync issue: ${message}` });
  }
}

// ---------------------------------------------------------------------------
// Router assembly
// ---------------------------------------------------------------------------

export const jiraRouter = Router();

jiraRouter.post('/webhook', handleWebhook);
jiraRouter.get('/config', getConfig);
jiraRouter.put('/config', putConfig);
jiraRouter.patch('/config', patchConfig);
jiraRouter.get('/issues/:issueKey/ac', getAcceptanceCriteria);
jiraRouter.post('/issues/:issueKey/sync', syncIssue);
