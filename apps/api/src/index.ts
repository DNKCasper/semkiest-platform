import express, { type Express } from 'express';
import { createGitHubRouter } from './routes/integrations/github';
import { GitHubWebhookService } from './services/github-webhook';
import { DeployTriggerService, StubTestCoordinator } from './services/deploy-trigger';

const app = express();

// Apply JSON body parsing for all routes except the GitHub webhook endpoint,
// which uses express.raw() internally to preserve the raw body for HMAC
// signature verification.
app.use((req, res, next) => {
  if (req.path === '/integrations/github/webhook') {
    return next();
  }
  express.json()(req, res, next);
});

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const webhookService = new GitHubWebhookService({
  secret: process.env['GITHUB_WEBHOOK_SECRET'],
});

const deployTrigger = new DeployTriggerService({
  coordinator: new StubTestCoordinator(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/integrations/github', createGitHubRouter(webhookService, deployTrigger));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = parseInt(process.env['PORT'] ?? '3001', 10);
const host = process.env['HOST'] ?? '0.0.0.0';

app.listen(port, host, () => {
  console.log(`API server listening on http://${host}:${port}`);
});

export { app };
