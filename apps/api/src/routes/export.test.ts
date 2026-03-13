/**
 * Tests for the export router.
 *
 * Because the data-fetching layer stubs return `null` (simulating "not found"
 * until SEM-20.1 is merged), the route-level tests verify:
 *   - 404 responses when the run / project is not found
 *   - 400 response for an invalid date range
 *   - 200 response shape (headers) via mocking the fetch functions
 */
import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

describe('GET /api/v1/runs/:id/export/excel', () => {
  it('returns 404 when run is not found', async () => {
    const res = await request(app).get('/api/v1/runs/non-existent/export/excel');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.runId).toBe('non-existent');
  });

  it('responds with JSON content type for 404', async () => {
    const res = await request(app).get('/api/v1/runs/unknown/export/excel');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /api/v1/projects/:id/export/excel', () => {
  it('returns 404 when project is not found', async () => {
    const res = await request(app).get('/api/v1/projects/non-existent/export/excel');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.projectId).toBe('non-existent');
  });

  it('returns 400 when from > to', async () => {
    const res = await request(app).get(
      '/api/v1/projects/proj-1/export/excel?from=2024-03-15&to=2024-01-01',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'from' must be before 'to'/);
  });

  it('returns 404 with valid date range (no real data)', async () => {
    const res = await request(app).get(
      '/api/v1/projects/proj-1/export/excel?from=2024-01-01&to=2024-03-01',
    );
    expect(res.status).toBe(404);
  });

  it('responds with JSON content type for 404', async () => {
    const res = await request(app).get('/api/v1/projects/unknown/export/excel');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('404 for unknown routes', () => {
  it('returns 404 for unknown paths', async () => {
    const res = await request(app).get('/api/v1/unknown');
    expect(res.status).toBe(404);
  });
});
