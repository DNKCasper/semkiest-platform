import { createHmac } from 'crypto';
import {
  GitHubDeploymentStatusPayload,
  GitHubWebhookService,
  RepoProjectMapping,
} from './github-webhook';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = 'test-secret-at-least-32-characters-long!!';

function makeSignature(secret: string, body: Buffer): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

function makeMapping(
  overrides: Partial<Omit<RepoProjectMapping, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Omit<RepoProjectMapping, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    repositoryFullName: 'org/repo',
    projectId: 'project-123',
    branchFilters: ['main'],
    eventTypes: ['deployment_status', 'push'],
    autoTrigger: true,
    targetEnvironments: ['staging'],
    ...overrides,
  };
}

function makeDeploymentPayload(
  state = 'success',
  environment = 'staging',
): Partial<GitHubDeploymentStatusPayload> {
  return {
    deployment_status: { id: 1, state, environment, environment_url: 'https://staging.example.com' },
    deployment: { id: 1, ref: 'main', sha: 'abc123', environment },
    repository: { full_name: 'org/repo', name: 'repo', html_url: 'https://github.com/org/repo' },
    sender: { login: 'octocat' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubWebhookService', () => {
  let service: GitHubWebhookService;

  beforeEach(() => {
    service = new GitHubWebhookService({ secret: SECRET });
  });

  // -------------------------------------------------------------------------
  describe('verifySignature', () => {
    it('returns true for a valid HMAC-SHA256 signature', () => {
      const body = Buffer.from(JSON.stringify({ test: true }));
      expect(service.verifySignature(body, makeSignature(SECRET, body))).toBe(true);
    });

    it('returns false for a tampered payload', () => {
      const original = Buffer.from('original payload');
      const tampered = Buffer.from('tampered payload');
      expect(service.verifySignature(tampered, makeSignature(SECRET, original))).toBe(false);
    });

    it('returns false for a wrong secret', () => {
      const body = Buffer.from('payload');
      expect(service.verifySignature(body, makeSignature('wrong-secret', body))).toBe(false);
    });

    it('returns false when signature is missing the sha256= prefix', () => {
      const body = Buffer.from('payload');
      const raw = createHmac('sha256', SECRET).update(body).digest('hex');
      expect(service.verifySignature(body, raw)).toBe(false);
    });

    it('returns false for an empty signature string', () => {
      const body = Buffer.from('payload');
      expect(service.verifySignature(body, '')).toBe(false);
    });

    it('returns true regardless of payload when no secret is configured', () => {
      const noSecret = new GitHubWebhookService();
      expect(noSecret.verifySignature(Buffer.from('any'), '')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('matchesBranchFilter', () => {
    it('allows all branches when filter list is empty', () => {
      expect(service.matchesBranchFilter('anything', [])).toBe(true);
    });

    it('matches exact branch names', () => {
      expect(service.matchesBranchFilter('main', ['main', 'develop'])).toBe(true);
      expect(service.matchesBranchFilter('master', ['main', 'develop'])).toBe(false);
    });

    it('matches wildcard suffix patterns', () => {
      expect(service.matchesBranchFilter('staging/pr-42', ['staging/*'])).toBe(true);
      expect(service.matchesBranchFilter('staging', ['staging/*'])).toBe(false);
      expect(service.matchesBranchFilter('other/branch', ['staging/*'])).toBe(false);
    });

    it('matches when any filter in the list matches', () => {
      expect(service.matchesBranchFilter('release/1.0', ['main', 'release/*'])).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('mapping management', () => {
    it('creates a new mapping and assigns an id', () => {
      const mapping = service.upsertMapping(makeMapping());
      expect(mapping.id).toBeDefined();
      expect(mapping.repositoryFullName).toBe('org/repo');
      expect(mapping.projectId).toBe('project-123');
      expect(mapping.createdAt).toBeInstanceOf(Date);
      expect(mapping.updatedAt).toBeInstanceOf(Date);
    });

    it('updates an existing mapping by repository name', () => {
      const first = service.upsertMapping(makeMapping());
      const updated = service.upsertMapping(makeMapping({ autoTrigger: false }));
      expect(updated.id).toBe(first.id);
      expect(updated.autoTrigger).toBe(false);
    });

    it('listMappings returns all registered mappings', () => {
      service.upsertMapping(makeMapping());
      service.upsertMapping(makeMapping({ repositoryFullName: 'org/other' }));
      expect(service.listMappings()).toHaveLength(2);
    });

    it('findMapping returns the correct entry', () => {
      service.upsertMapping(makeMapping());
      expect(service.findMapping('org/repo')).toBeDefined();
      expect(service.findMapping('org/missing')).toBeUndefined();
    });

    it('deleteMapping removes the entry and returns true', () => {
      const m = service.upsertMapping(makeMapping());
      expect(service.deleteMapping(m.id)).toBe(true);
      expect(service.listMappings()).toHaveLength(0);
    });

    it('deleteMapping returns false for an unknown id', () => {
      expect(service.deleteMapping('no-such-id')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('processEvent', () => {
    beforeEach(() => {
      service.upsertMapping(makeMapping());
    });

    it('returns null when no mapping exists for the repository', () => {
      const result = service.processEvent('push', 'del-1', {
        ref: 'refs/heads/main',
        repository: { full_name: 'org/unknown' },
      } as never);
      expect(result).toBeNull();
    });

    it('returns null when the event type is not in the mapping', () => {
      const result = service.processEvent('pull_request', 'del-1', {
        pull_request: { base: { ref: 'main' } },
        repository: { full_name: 'org/repo' },
      } as never);
      expect(result).toBeNull();
    });

    it('returns null for a push to a filtered-out branch', () => {
      const result = service.processEvent('push', 'del-1', {
        ref: 'refs/heads/feature/new-ui',
        repository: { full_name: 'org/repo' },
      } as never);
      expect(result).toBeNull();
    });

    it('returns a processed event for a push to an allowed branch', () => {
      const result = service.processEvent('push', 'del-1', {
        ref: 'refs/heads/main',
        repository: { full_name: 'org/repo' },
      } as never);
      expect(result).not.toBeNull();
      expect(result?.mapping.projectId).toBe('project-123');
    });

    it('returns a processed event for a deployment_status', () => {
      const result = service.processEvent(
        'deployment_status',
        'del-2',
        makeDeploymentPayload() as never,
      );
      expect(result).not.toBeNull();
      expect(result?.eventType).toBe('deployment_status');
    });

    it('returns null when the payload has no repository field', () => {
      const result = service.processEvent('push', 'del-1', {} as never);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('delivery tracking', () => {
    it('records a delivery and lists it', () => {
      service.recordDelivery('gh-del-1', 'push', 'org/repo', 'received');
      const list = service.listDeliveries();
      expect(list).toHaveLength(1);
      expect(list[0]?.deliveryId).toBe('gh-del-1');
      expect(list[0]?.status).toBe('received');
    });

    it('updateDeliveryStatus changes the status', () => {
      const d = service.recordDelivery('gh-del-2', 'push', 'org/repo', 'received');
      service.updateDeliveryStatus(d.id, 'processed');
      expect(service.listDeliveries()[0]?.status).toBe('processed');
    });

    it('updateDeliveryStatus attaches an error message', () => {
      const d = service.recordDelivery('gh-del-3', 'push', 'org/repo', 'received');
      service.updateDeliveryStatus(d.id, 'failed', 'Something went wrong');
      expect(service.listDeliveries()[0]?.error).toBe('Something went wrong');
    });

    it('updateDeliveryStatus returns undefined for unknown id', () => {
      expect(service.updateDeliveryStatus('ghost', 'processed')).toBeUndefined();
    });

    it('listDeliveries respects the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        service.recordDelivery(`del-${i}`, 'push', 'org/repo', 'processed');
      }
      expect(service.listDeliveries(3)).toHaveLength(3);
    });

    it('listDeliveries returns entries newest-first', () => {
      service.recordDelivery('first', 'push', 'org/repo', 'processed');
      service.recordDelivery('second', 'push', 'org/repo', 'processed');
      const list = service.listDeliveries();
      expect(list[0]?.deliveryId).toBe('second');
    });
  });
});
