import {
  DeployTriggerService,
  StubTestCoordinator,
  TestCoordinator,
  TriggerContext,
  TriggerResult,
} from './deploy-trigger';
import type { GitHubDeploymentStatusPayload, RepoProjectMapping } from './github-webhook';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMapping(
  overrides: Partial<RepoProjectMapping> = {},
): RepoProjectMapping {
  return {
    id: 'mapping-1',
    repositoryFullName: 'org/repo',
    projectId: 'project-123',
    branchFilters: ['main'],
    eventTypes: ['deployment_status'],
    autoTrigger: true,
    targetEnvironments: ['staging'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePayload(
  state: string,
  environment: string,
  environmentUrl = 'https://staging.example.com',
): GitHubDeploymentStatusPayload {
  return {
    deployment_status: { id: 1, state, environment, environment_url: environmentUrl },
    deployment: { id: 42, ref: 'main', sha: 'deadbeef', environment },
    repository: { full_name: 'org/repo', name: 'repo', html_url: 'https://github.com/org/repo' },
    sender: { login: 'octocat' },
  };
}

function mockCoordinator(): jest.Mocked<TestCoordinator> {
  return {
    triggerTestRun: jest.fn<Promise<TriggerResult>, [TriggerContext]>().mockResolvedValue({
      success: true,
      testRunId: 'run-test-abc',
      message: 'Test run queued',
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeployTriggerService', () => {
  let coordinator: jest.Mocked<TestCoordinator>;
  let service: DeployTriggerService;

  beforeEach(() => {
    coordinator = mockCoordinator();
    service = new DeployTriggerService({ coordinator });
  });

  // -------------------------------------------------------------------------
  describe('isTargetEnvironment', () => {
    it('matches "staging" by default', () => {
      expect(service.isTargetEnvironment('staging')).toBe(true);
    });

    it('matches "preview" by default', () => {
      expect(service.isTargetEnvironment('preview')).toBe(true);
    });

    it('matches environment names containing a pattern substring', () => {
      expect(service.isTargetEnvironment('staging-pr-42')).toBe(true);
      expect(service.isTargetEnvironment('deploy-preview-123')).toBe(true);
    });

    it('does not match "production" with default patterns', () => {
      expect(service.isTargetEnvironment('production')).toBe(false);
    });

    it('does not match "development" with default patterns', () => {
      expect(service.isTargetEnvironment('development')).toBe(false);
    });

    it('supports custom string patterns', () => {
      const custom = new DeployTriggerService({
        coordinator,
        targetEnvironmentPatterns: ['qa'],
      });
      expect(custom.isTargetEnvironment('qa-env')).toBe(true);
      expect(custom.isTargetEnvironment('staging')).toBe(false);
    });

    it('supports RegExp patterns', () => {
      const custom = new DeployTriggerService({
        coordinator,
        targetEnvironmentPatterns: [/^deploy-/],
      });
      expect(custom.isTargetEnvironment('deploy-42')).toBe(true);
      expect(custom.isTargetEnvironment('staging')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('extractDeploymentUrl', () => {
    it('prefers environment_url over target_url', () => {
      const payload = makePayload('success', 'staging');
      payload.deployment_status.target_url = 'https://ci.example.com';
      expect(service.extractDeploymentUrl(payload)).toBe('https://staging.example.com');
    });

    it('falls back to target_url when environment_url is absent', () => {
      const payload = makePayload('success', 'staging', undefined as unknown as string);
      payload.deployment_status.target_url = 'https://ci.example.com';
      expect(service.extractDeploymentUrl(payload)).toBe('https://ci.example.com');
    });

    it('returns empty string when neither URL is present', () => {
      const payload = makePayload('success', 'staging', undefined as unknown as string);
      expect(service.extractDeploymentUrl(payload)).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  describe('handleDeploymentStatus', () => {
    it('triggers a test run on a successful staging deployment', async () => {
      const result = await service.handleDeploymentStatus(
        makePayload('success', 'staging'),
        makeMapping(),
      );
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(coordinator.triggerTestRun).toHaveBeenCalledTimes(1);
      expect(coordinator.triggerTestRun).toHaveBeenCalledWith(
        expect.objectContaining<Partial<TriggerContext>>({
          projectId: 'project-123',
          environment: 'staging',
          deploymentUrl: 'https://staging.example.com',
          ref: 'main',
          sha: 'deadbeef',
          triggeredBy: 'octocat',
          deploymentId: 42,
        }),
      );
    });

    it('does not trigger on a failed deployment', async () => {
      const result = await service.handleDeploymentStatus(
        makePayload('failure', 'staging'),
        makeMapping(),
      );
      expect(result).toBeNull();
      expect(coordinator.triggerTestRun).not.toHaveBeenCalled();
    });

    it('does not trigger on a pending deployment', async () => {
      const result = await service.handleDeploymentStatus(
        makePayload('pending', 'staging'),
        makeMapping(),
      );
      expect(result).toBeNull();
    });

    it('does not trigger on a production deployment', async () => {
      const result = await service.handleDeploymentStatus(
        makePayload('success', 'production'),
        makeMapping(),
      );
      expect(result).toBeNull();
    });

    it('does not trigger when autoTrigger is false', async () => {
      const result = await service.handleDeploymentStatus(
        makePayload('success', 'staging'),
        makeMapping({ autoTrigger: false }),
      );
      expect(result).toBeNull();
    });

    it('does not trigger when environment is not in the mapping targetEnvironments', async () => {
      const result = await service.handleDeploymentStatus(
        makePayload('success', 'dev'),
        makeMapping({ targetEnvironments: ['staging'] }),
      );
      expect(result).toBeNull();
    });

    it('triggers when targetEnvironments is empty (all environments allowed)', async () => {
      const result = await service.handleDeploymentStatus(
        makePayload('success', 'staging-pr-99'),
        makeMapping({ targetEnvironments: [] }),
      );
      expect(result).not.toBeNull();
    });

    it('returns null when deployment_status state is missing', async () => {
      const bad = { deployment_status: {}, deployment: {}, repository: { full_name: 'org/repo' }, sender: {} };
      const result = await service.handleDeploymentStatus(bad as never, makeMapping());
      expect(result).toBeNull();
    });

    it('respects a custom triggerOnStates config', async () => {
      const custom = new DeployTriggerService({
        coordinator,
        triggerOnStates: ['success', 'in_progress'],
      });
      const result = await custom.handleDeploymentStatus(
        makePayload('in_progress', 'staging'),
        makeMapping(),
      );
      expect(result).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
describe('StubTestCoordinator', () => {
  it('returns a successful result with a test run ID', async () => {
    const stub = new StubTestCoordinator();
    const result = await stub.triggerTestRun({
      projectId: 'proj-1',
      repositoryFullName: 'org/repo',
      deploymentId: 1,
      environment: 'staging',
      deploymentUrl: 'https://staging.example.com',
      ref: 'main',
      sha: 'abc123',
      triggeredBy: 'octocat',
    });
    expect(result.success).toBe(true);
    expect(result.testRunId).toMatch(/^run_\d+_[a-z0-9]+$/);
    expect(result.message).toContain('org/repo');
  });
});
