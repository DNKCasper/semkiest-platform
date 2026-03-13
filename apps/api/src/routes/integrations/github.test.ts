import { createHmac } from 'crypto';
import express from 'express';
import request from 'supertest';
import { createGitHubRouter } from './github';
import { GitHubWebhookService } from '../../services/github-webhook';
import { DeployTriggerService, StubTestCoordinator } from '../../services/deploy-trigger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = 'super-secret-webhook-key-at-least-20-chars';

function sign(secret: string, body: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

function buildApp(secret?: string) {
  const webhookService = new GitHubWebhookService({ secret });
  const deployTrigger = new DeployTriggerService({ coordinator: new StubTestCoordinator() });
  const app = express();
  app.use(express.json());
  app.use('/integrations/github', createGitHubRouter(webhookService, deployTrigger));
  return { app, webhookService, deployTrigger };
}

// ---------------------------------------------------------------------------
// POST /webhook
// ---------------------------------------------------------------------------

describe('POST /integrations/github/webhook', () => {
  it('returns 400 when required headers are missing', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/integrations/github/webhook')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required GitHub headers/);
  });

  it('returns 401 when signature is invalid', async () => {
    const { app } = buildApp(SECRET);
    const body = JSON.stringify({ repository: { full_name: 'org/repo' } });
    const res = await request(app)
      .post('/integrations/github/webhook')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-github-delivery', 'del-1')
      .set('x-hub-signature-256', 'sha256=invalidsig')
      .send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid webhook signature/);
  });

  it('responds 200 to a ping event', async () => {
    const { app } = buildApp(SECRET);
    const body = JSON.stringify({ zen: 'Design for failure.', hook_id: 1 });
    const res = await request(app)
      .post('/integrations/github/webhook')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'ping')
      .set('x-github-delivery', 'del-ping-1')
      .set('x-hub-signature-256', sign(SECRET, body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Webhook configured successfully');
  });

  it('returns 200 with "ignored" message when no mapping exists', async () => {
    const { app } = buildApp(SECRET);
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { full_name: 'org/unknown-repo' },
    });
    const res = await request(app)
      .post('/integrations/github/webhook')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-github-delivery', 'del-2')
      .set('x-hub-signature-256', sign(SECRET, body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/ignored/i);
  });

  it('processes a deployment_status event and triggers a test run', async () => {
    const { app, webhookService } = buildApp(SECRET);

    // Register a mapping first
    webhookService.upsertMapping({
      repositoryFullName: 'org/repo',
      projectId: 'proj-abc',
      branchFilters: [],
      eventTypes: ['deployment_status'],
      autoTrigger: true,
      targetEnvironments: ['staging'],
    });

    const payload = {
      deployment_status: {
        id: 1,
        state: 'success',
        environment: 'staging',
        environment_url: 'https://staging.example.com',
      },
      deployment: { id: 1, ref: 'main', sha: 'abc', environment: 'staging' },
      repository: { full_name: 'org/repo', name: 'repo', html_url: '' },
      sender: { login: 'octocat' },
    };
    const body = JSON.stringify(payload);
    const res = await request(app)
      .post('/integrations/github/webhook')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'deployment_status')
      .set('x-github-delivery', 'del-3')
      .set('x-hub-signature-256', sign(SECRET, body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe('proj-abc');
    expect(res.body.testRun).not.toBeNull();
    expect(res.body.testRun.success).toBe(true);
  });

  it('skips signature check when no secret is configured', async () => {
    const { app, webhookService } = buildApp(); // no secret

    webhookService.upsertMapping({
      repositoryFullName: 'org/repo',
      projectId: 'proj-noauth',
      branchFilters: [],
      eventTypes: ['push'],
      autoTrigger: false,
      targetEnvironments: [],
    });

    const body = JSON.stringify({ ref: 'refs/heads/main', repository: { full_name: 'org/repo' } });
    const res = await request(app)
      .post('/integrations/github/webhook')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-github-delivery', 'del-4')
      .send(body);

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Mappings CRUD
// ---------------------------------------------------------------------------

describe('GET /integrations/github/mappings', () => {
  it('returns an empty list initially', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/integrations/github/mappings');
    expect(res.status).toBe(200);
    expect(res.body.mappings).toEqual([]);
  });

  it('returns registered mappings', async () => {
    const { app, webhookService } = buildApp();
    webhookService.upsertMapping({
      repositoryFullName: 'org/repo',
      projectId: 'proj-1',
      branchFilters: ['main'],
      eventTypes: ['deployment_status'],
      autoTrigger: true,
      targetEnvironments: ['staging'],
    });
    const res = await request(app).get('/integrations/github/mappings');
    expect(res.status).toBe(200);
    expect(res.body.mappings).toHaveLength(1);
  });
});

describe('POST /integrations/github/mappings', () => {
  it('returns 400 when required fields are missing', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/integrations/github/mappings')
      .send({ repositoryFullName: 'org/repo' }); // projectId missing
    expect(res.status).toBe(400);
  });

  it('creates a mapping and returns 201', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/integrations/github/mappings')
      .send({ repositoryFullName: 'org/repo', projectId: 'proj-1' });
    expect(res.status).toBe(201);
    expect(res.body.mapping.repositoryFullName).toBe('org/repo');
    expect(res.body.mapping.projectId).toBe('proj-1');
    expect(res.body.mapping.id).toBeDefined();
  });

  it('applies default values for optional fields', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/integrations/github/mappings')
      .send({ repositoryFullName: 'org/repo', projectId: 'proj-1' });
    expect(res.body.mapping.autoTrigger).toBe(true);
    expect(res.body.mapping.branchFilters).toEqual([]);
    expect(res.body.mapping.eventTypes).toEqual(['deployment_status']);
  });
});

describe('DELETE /integrations/github/mappings/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const { app } = buildApp();
    const res = await request(app).delete('/integrations/github/mappings/no-such-id');
    expect(res.status).toBe(404);
  });

  it('deletes a mapping and returns 204', async () => {
    const { app, webhookService } = buildApp();
    const m = webhookService.upsertMapping({
      repositoryFullName: 'org/repo',
      projectId: 'proj-1',
      branchFilters: [],
      eventTypes: ['deployment_status'],
      autoTrigger: true,
      targetEnvironments: ['staging'],
    });
    const res = await request(app).delete(`/integrations/github/mappings/${m.id}`);
    expect(res.status).toBe(204);

    const list = await request(app).get('/integrations/github/mappings');
    expect(list.body.mappings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /deliveries
// ---------------------------------------------------------------------------

describe('GET /integrations/github/deliveries', () => {
  it('returns an empty list when no deliveries have been recorded', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/integrations/github/deliveries');
    expect(res.status).toBe(200);
    expect(res.body.deliveries).toEqual([]);
  });

  it('respects the limit query parameter', async () => {
    const { app, webhookService } = buildApp();
    for (let i = 0; i < 5; i++) {
      webhookService.recordDelivery(`del-${i}`, 'push', 'org/repo', 'processed');
    }
    const res = await request(app).get('/integrations/github/deliveries?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.deliveries).toHaveLength(3);
  });

  it('caps limit at 200', async () => {
    const { app, webhookService } = buildApp();
    for (let i = 0; i < 5; i++) {
      webhookService.recordDelivery(`del-${i}`, 'push', 'org/repo', 'processed');
    }
    const res = await request(app).get('/integrations/github/deliveries?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.deliveries).toHaveLength(5); // only 5 exist
  });
});
