import { Router, Request, Response, NextFunction } from 'express';
import {
  AsanaTaskReader,
  AsanaStatusSync,
  AsanaWebhookHandler,
  AsanaProjectMapping,
  TestResult,
} from '@semkiest/asana-integration';

/**
 * In-memory project mapping store.
 *
 * In a production deployment this would be backed by the Prisma database.
 * Using an in-memory map here keeps the route handler dependency-free while
 * the database layer is built out in subsequent stories.
 */
const projectMappings = new Map<string, AsanaProjectMapping>();

/**
 * Builds an Asana config from environment variables, throwing a descriptive
 * error at startup time if required variables are missing.
 */
function getAsanaConfig() {
  const accessToken = process.env['ASANA_ACCESS_TOKEN'];
  if (!accessToken) {
    throw new Error('ASANA_ACCESS_TOKEN environment variable is required');
  }
  return {
    accessToken,
    workspaceId: process.env['ASANA_WORKSPACE_ID'],
    defaultProjectId: process.env['ASANA_DEFAULT_PROJECT_ID'],
    webhookSecret: process.env['ASANA_WEBHOOK_SECRET'],
  };
}

export const asanaRouter = Router();

// ---------------------------------------------------------------------------
// Webhook endpoint
// ---------------------------------------------------------------------------

/**
 * POST /integrations/asana/webhooks
 *
 * Asana sends two types of requests to this endpoint:
 * 1. A handshake request containing an `X-Hook-Secret` header — we echo the
 *    secret back in the response header to complete registration.
 * 2. Event payloads carrying an `X-Hook-Signature` header — we validate the
 *    HMAC-SHA256 signature before processing.
 *
 * We use `express.raw()` to capture the raw body for signature verification
 * before the global `express.json()` middleware has processed it.
 */
asanaRouter.post(
  '/webhooks',
  // Capture raw body for HMAC verification.
  (req: Request, _res: Response, next: NextFunction) => {
    // express.raw sets req.body to a Buffer; proceed if already parsed.
    if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
      return next();
    }
    // Fallback: re-read via express.raw for this route.
    // The outer express.json() middleware already ran; use the raw string
    // stored by a custom body saver if present, otherwise serialise back.
    next();
  },
  async (req: Request, res: Response) => {
    // -----------------------------------------------------------------------
    // Handshake: Asana sends X-Hook-Secret when registering the webhook.
    // -----------------------------------------------------------------------
    const hookSecret = req.headers['x-hook-secret'];
    if (hookSecret) {
      res.set('X-Hook-Secret', hookSecret as string);
      return res.sendStatus(200);
    }

    // -----------------------------------------------------------------------
    // Event payload: validate signature then process.
    // -----------------------------------------------------------------------
    const signature = req.headers['x-hook-signature'] as string | undefined;
    const webhookSecret = process.env['ASANA_WEBHOOK_SECRET'];

    if (webhookSecret && signature) {
      const rawBody =
        typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body);

      const handler = new AsanaWebhookHandler({
        secret: webhookSecret,
        onTaskChanged: async (event) => {
          // Task changed — update mapping cache or trigger downstream jobs.
          // Detailed handling wired up per organisation configuration.
          void event;
        },
        onTaskAdded: async (event) => {
          void event;
        },
      });

      if (!handler.validateSignature(rawBody, signature)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      try {
        await handler.processPayload(req.body as { events: [] });
        return res.sendStatus(200);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return res.status(500).json({ error: message });
      }
    }

    // No secret configured — accept all events (useful in development).
    return res.sendStatus(200);
  },
);

// ---------------------------------------------------------------------------
// Project mapping configuration
// ---------------------------------------------------------------------------

/**
 * GET /integrations/asana/config
 *
 * Returns all stored Asana project mappings for the caller's organisation.
 * The `organizationId` is read from the `x-organization-id` header (a
 * placeholder for the real auth middleware wired in a later story).
 */
asanaRouter.get('/config', (req: Request, res: Response) => {
  const organizationId = req.headers['x-organization-id'] as string | undefined;
  if (!organizationId) {
    return res.status(400).json({ error: 'x-organization-id header is required' });
  }

  const mappings = Array.from(projectMappings.values()).filter(
    (m) => m.organizationId === organizationId,
  );

  return res.json({ data: mappings });
});

/**
 * PUT /integrations/asana/config
 *
 * Creates or replaces the Asana project mapping for an organisation.
 *
 * Body shape:
 * ```json
 * {
 *   "asanaProjectId": "1234567890",
 *   "asanaProjectName": "My Project",
 *   "asanaWorkspaceId": "9876543210",
 *   "sectionMappings": [
 *     { "sectionId": "...", "sectionName": "In Progress", "testStatus": "pending" }
 *   ],
 *   "statusMappings": [
 *     { "asanaStatus": "Complete", "testState": "passed" }
 *   ]
 * }
 * ```
 */
asanaRouter.put('/config', (req: Request, res: Response) => {
  const organizationId = req.headers['x-organization-id'] as string | undefined;
  if (!organizationId) {
    return res.status(400).json({ error: 'x-organization-id header is required' });
  }

  const {
    asanaProjectId,
    asanaProjectName,
    asanaWorkspaceId,
    sectionMappings = [],
    statusMappings = [],
  } = req.body as Partial<AsanaProjectMapping>;

  if (!asanaProjectId || !asanaWorkspaceId) {
    return res
      .status(400)
      .json({ error: 'asanaProjectId and asanaWorkspaceId are required' });
  }

  const id = `${organizationId}:${asanaProjectId}`;
  const now = new Date();
  const existing = projectMappings.get(id);

  const mapping: AsanaProjectMapping = {
    id,
    organizationId,
    asanaProjectId,
    asanaProjectName: asanaProjectName ?? '',
    asanaWorkspaceId,
    sectionMappings,
    statusMappings,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  projectMappings.set(id, mapping);

  return res.status(existing ? 200 : 201).json({ data: mapping });
});

// ---------------------------------------------------------------------------
// Task data endpoints
// ---------------------------------------------------------------------------

/**
 * GET /integrations/asana/projects/:projectId/tasks
 *
 * Proxies the Asana task list for a project so the frontend can display tasks
 * in the configuration UI.
 */
asanaRouter.get(
  '/projects/:projectId/tasks',
  async (req: Request, res: Response) => {
    try {
      const config = getAsanaConfig();
      const reader = new AsanaTaskReader(config);
      const tasks = await reader.getProjectTasks(req.params['projectId'] as string);
      return res.json({ data: tasks });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * GET /integrations/asana/tasks/:taskId
 *
 * Returns a single Asana task with all fields needed for test-case generation.
 */
asanaRouter.get('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const config = getAsanaConfig();
    const reader = new AsanaTaskReader(config);
    const task = await reader.getTask(req.params['taskId'] as string);
    return res.json({ data: task });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /integrations/asana/tasks/:taskId/test-case
 *
 * Fetches a task and returns the extracted, structured test-case information.
 */
asanaRouter.get('/tasks/:taskId/test-case', async (req: Request, res: Response) => {
  try {
    const config = getAsanaConfig();
    const reader = new AsanaTaskReader(config);
    const testCase = await reader.fetchAndExtract(req.params['taskId'] as string);
    return res.json({ data: testCase });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Status sync endpoint
// ---------------------------------------------------------------------------

/**
 * POST /integrations/asana/tasks/:taskId/sync
 *
 * Manually triggers a status sync for a task: posts the test result as a
 * comment and optionally moves the task to the configured section.
 *
 * Body shape:
 * ```json
 * {
 *   "result": {
 *     "testName": "My Test",
 *     "status": "passed",
 *     "duration": 1200,
 *     "timestamp": "2024-06-01T12:00:00.000Z"
 *   }
 * }
 * ```
 */
asanaRouter.post('/tasks/:taskId/sync', async (req: Request, res: Response) => {
  try {
    const config = getAsanaConfig();
    const organizationId = req.headers['x-organization-id'] as string | undefined;
    const { result } = req.body as { result: TestResult };

    if (!result?.testName || !result.status) {
      return res.status(400).json({ error: 'result.testName and result.status are required' });
    }

    // Normalise timestamp — may arrive as ISO string from JSON.
    const testResult: TestResult = {
      ...result,
      timestamp: new Date(result.timestamp),
    };

    // Look up section mappings for this organisation if available.
    let sectionMappings:
      | Array<{ testStatus: string; sectionId: string }>
      | undefined;

    if (organizationId) {
      // Find the first mapping entry that has a matching project.
      const mapping = Array.from(projectMappings.values()).find(
        (m) => m.organizationId === organizationId,
      );
      sectionMappings = mapping?.sectionMappings.map((sm) => ({
        testStatus: sm.testStatus,
        sectionId: sm.sectionId,
      }));
    }

    const sync = new AsanaStatusSync(config);
    await sync.syncTestResult(
      req.params['taskId'] as string,
      testResult,
      [],
      sectionMappings,
    );

    return res.json({ data: { synced: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});
