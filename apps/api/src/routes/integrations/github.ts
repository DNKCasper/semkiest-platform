import express, { NextFunction, Request, Response, Router } from 'express';
import type { GitHubEventType, GitHubWebhookPayload } from '../../services/github-webhook';
import { GitHubWebhookService } from '../../services/github-webhook';
import { DeployTriggerService } from '../../services/deploy-trigger';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extends the standard Express Request with the raw body buffer. */
type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Middleware that captures the raw request body as a `Buffer` on `req.rawBody`
 * before any body-parser has run. Needed so we can compute the HMAC-SHA256
 * signature over the exact bytes GitHub sent.
 *
 * The parsed JSON body is also placed on `req.body` for downstream handlers.
 */
function rawBodyMiddleware(
  req: RawBodyRequest,
  _res: Response,
  next: NextFunction,
): void {
  express.raw({ type: '*/*' })(req, _res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    // express.raw() leaves req.body as a Buffer; stash it and parse JSON
    const buf = req.body as Buffer | undefined;
    req.rawBody = buf ?? Buffer.alloc(0);
    if (req.rawBody.length > 0) {
      try {
        req.body = JSON.parse(req.rawBody.toString('utf8')) as GitHubWebhookPayload;
      } catch {
        req.body = {};
      }
    }
    next();
  });
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Creates an Express Router with all GitHub integration endpoints.
 *
 * Mount it at a prefix, e.g.:
 *   `app.use('/integrations/github', createGitHubRouter(webhookService, deployTrigger))`
 *
 * Endpoints:
 *   POST   /webhook         – Receive GitHub webhook events
 *   GET    /mappings        – List repo→project mappings
 *   POST   /mappings        – Create or update a mapping
 *   DELETE /mappings/:id    – Remove a mapping
 *   GET    /deliveries      – List recent webhook delivery records
 */
export function createGitHubRouter(
  webhookService: GitHubWebhookService,
  deployTrigger: DeployTriggerService,
): Router {
  const router = Router();

  // ------------------------------------------------------------------
  // POST /webhook
  // ------------------------------------------------------------------
  router.post(
    '/webhook',
    rawBodyMiddleware,
    async (req: RawBodyRequest, res: Response): Promise<void> => {
      const event = req.headers['x-github-event'] as string | undefined;
      const signature = (req.headers['x-hub-signature-256'] as string | undefined) ?? '';
      const deliveryId = req.headers['x-github-delivery'] as string | undefined;

      if (!event || !deliveryId) {
        res.status(400).json({ error: 'Missing required GitHub headers: x-github-event, x-github-delivery' });
        return;
      }

      const rawBody = req.rawBody ?? Buffer.alloc(0);

      // Verify HMAC-SHA256 signature
      if (!webhookService.verifySignature(rawBody, signature)) {
        const repo = (req.body as Record<string, unknown> & { repository?: { full_name?: string } })?.repository?.full_name ?? 'unknown';
        webhookService.recordDelivery(deliveryId, event, repo, 'failed', 'Invalid signature');
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      const payload = req.body as GitHubWebhookPayload;
      const repository =
        (payload as Record<string, unknown> & { repository?: { full_name?: string } })
          ?.repository?.full_name ?? 'unknown';

      // Acknowledge GitHub's ping event
      if (event === 'ping') {
        webhookService.recordDelivery(deliveryId, event, repository, 'processed');
        res.status(200).json({ message: 'Webhook configured successfully' });
        return;
      }

      const delivery = webhookService.recordDelivery(
        deliveryId,
        event,
        repository,
        'received',
      );

      try {
        const processed = webhookService.processEvent(event, deliveryId, payload);

        if (!processed) {
          webhookService.updateDeliveryStatus(delivery.id, 'ignored');
          res.status(200).json({
            message: 'Event ignored: no matching mapping or filter',
            deliveryId,
            event,
            repository,
          });
          return;
        }

        let testRun = null;
        if (event === 'deployment_status') {
          testRun = await deployTrigger.handleDeploymentStatus(payload, processed.mapping);
        }

        webhookService.updateDeliveryStatus(delivery.id, 'processed');
        res.status(200).json({
          message: 'Webhook processed',
          deliveryId,
          event,
          repository,
          projectId: processed.mapping.projectId,
          testRun,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        webhookService.updateDeliveryStatus(delivery.id, 'failed', message);
        res.status(500).json({ error: 'Failed to process webhook event' });
      }
    },
  );

  // ------------------------------------------------------------------
  // GET /mappings
  // ------------------------------------------------------------------
  router.get('/mappings', (_req: Request, res: Response): void => {
    const mappings = webhookService.listMappings();
    res.status(200).json({ mappings });
  });

  // ------------------------------------------------------------------
  // POST /mappings
  // ------------------------------------------------------------------
  router.post('/mappings', express.json(), (req: Request, res: Response): void => {
    const body = req.body as {
      repositoryFullName?: string;
      projectId?: string;
      branchFilters?: string[];
      eventTypes?: string[];
      autoTrigger?: boolean;
      targetEnvironments?: string[];
    };

    const { repositoryFullName, projectId } = body;

    if (!repositoryFullName || !projectId) {
      res.status(400).json({ error: 'repositoryFullName and projectId are required' });
      return;
    }

    const mapping = webhookService.upsertMapping({
      repositoryFullName,
      projectId,
      branchFilters: body.branchFilters ?? [],
      eventTypes: (body.eventTypes ?? ['deployment_status']) as GitHubEventType[],
      autoTrigger: body.autoTrigger ?? true,
      targetEnvironments: body.targetEnvironments ?? ['staging', 'preview'],
    });

    res.status(201).json({ mapping });
  });

  // ------------------------------------------------------------------
  // DELETE /mappings/:id
  // ------------------------------------------------------------------
  router.delete('/mappings/:id', (req: Request, res: Response): void => {
    const deleted = webhookService.deleteMapping(req.params['id'] ?? '');
    if (!deleted) {
      res.status(404).json({ error: 'Mapping not found' });
      return;
    }
    res.status(204).send();
  });

  // ------------------------------------------------------------------
  // GET /deliveries
  // ------------------------------------------------------------------
  router.get('/deliveries', (req: Request, res: Response): void => {
    const raw = req.query['limit'];
    const limit = Math.min(
      typeof raw === 'string' ? parseInt(raw, 10) || 50 : 50,
      200,
    );
    const deliveries = webhookService.listDeliveries(limit);
    res.status(200).json({ deliveries });
  });

  return router;
}
