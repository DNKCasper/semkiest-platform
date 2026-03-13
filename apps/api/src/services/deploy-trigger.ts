import type {
  GitHubDeploymentStatusPayload,
  GitHubWebhookPayload,
  RepoProjectMapping,
} from './github-webhook';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeployEnvironment = string;

/** Data passed to the test coordinator when a deployment triggers a test run. */
export interface TriggerContext {
  projectId: string;
  repositoryFullName: string;
  deploymentId: number;
  environment: DeployEnvironment;
  /** The live URL of the deployed environment to test against. */
  deploymentUrl: string;
  ref: string;
  sha: string;
  triggeredBy: string;
}

export interface TriggerResult {
  success: boolean;
  testRunId?: string;
  message: string;
}

/**
 * Interface for the test coordinator (implemented by SEM-52).
 * Inject a concrete implementation to connect to the real test infrastructure.
 */
export interface TestCoordinator {
  triggerTestRun(context: TriggerContext): Promise<TriggerResult>;
}

// ---------------------------------------------------------------------------
// Stub coordinator
// ---------------------------------------------------------------------------

/**
 * Stub implementation returned until the SEM-52 test coordinator is available.
 * Logs the intent and returns a synthetic run ID so the rest of the pipeline
 * can proceed end-to-end in development/testing.
 */
export class StubTestCoordinator implements TestCoordinator {
  async triggerTestRun(context: TriggerContext): Promise<TriggerResult> {
    // TODO(SEM-52): Replace with real test coordinator implementation
    const testRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return {
      success: true,
      testRunId,
      message: `[stub] Test run ${testRunId} queued for ${context.environment} deployment of ${context.repositoryFullName} at ${context.deploymentUrl}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Service configuration
// ---------------------------------------------------------------------------

export type EnvironmentPattern = string | RegExp;

export interface DeployTriggerConfig {
  coordinator: TestCoordinator;
  /**
   * Environment name patterns to auto-trigger on.
   * Strings use case-insensitive substring matching.
   * Defaults to `['staging', 'preview']`.
   */
  targetEnvironmentPatterns?: EnvironmentPattern[];
  /**
   * GitHub deployment states that should trigger a test run.
   * Defaults to `['success']`.
   */
  triggerOnStates?: string[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Evaluates deployment_status webhook events and triggers test runs via the
 * configured {@link TestCoordinator} when all conditions are met:
 *
 * 1. Deployment state matches `triggerOnStates` (default: `success`)
 * 2. Environment name matches `targetEnvironmentPatterns` (default: staging/preview)
 * 3. Environment name is in the mapping's `targetEnvironments` list (if non-empty)
 * 4. Mapping's `autoTrigger` flag is `true`
 */
export class DeployTriggerService {
  private readonly coordinator: TestCoordinator;
  private readonly targetPatterns: EnvironmentPattern[];
  private readonly triggerOnStates: string[];

  constructor(config: DeployTriggerConfig) {
    this.coordinator = config.coordinator;
    this.targetPatterns = config.targetEnvironmentPatterns ?? ['staging', 'preview'];
    this.triggerOnStates = config.triggerOnStates ?? ['success'];
  }

  /**
   * Returns `true` when the environment name matches at least one configured
   * target pattern.
   *
   * - `string` patterns use case-insensitive substring matching
   * - `RegExp` patterns are tested directly against the environment name
   */
  isTargetEnvironment(environment: string): boolean {
    return this.targetPatterns.some((pattern) => {
      if (pattern instanceof RegExp) return pattern.test(environment);
      return environment.toLowerCase().includes(pattern.toLowerCase());
    });
  }

  /**
   * Extracts the deployment URL from a `deployment_status` payload.
   * Prefers `environment_url`; falls back to `target_url`.
   */
  extractDeploymentUrl(payload: GitHubDeploymentStatusPayload): string {
    return (
      payload.deployment_status.environment_url ??
      payload.deployment_status.target_url ??
      ''
    );
  }

  /**
   * Evaluates a `deployment_status` event and triggers a test run if all
   * configured conditions are satisfied.
   *
   * Returns `null` without calling the coordinator when any condition fails,
   * so callers can distinguish "not triggered" from "trigger failed".
   */
  async handleDeploymentStatus(
    payload: GitHubWebhookPayload,
    mapping: RepoProjectMapping,
  ): Promise<TriggerResult | null> {
    const deployPayload = payload as GitHubDeploymentStatusPayload;

    const state = deployPayload.deployment_status?.state;
    const environment = deployPayload.deployment_status?.environment;

    if (!state || !environment) return null;

    // Gate 1: deployment must be in a trigger-worthy state
    if (!this.triggerOnStates.includes(state)) return null;

    // Gate 2: environment must match global target patterns
    if (!this.isTargetEnvironment(environment)) return null;

    // Gate 3: environment must match the mapping's explicit target list
    if (
      mapping.targetEnvironments.length > 0 &&
      !mapping.targetEnvironments.some((e) =>
        environment.toLowerCase().includes(e.toLowerCase()),
      )
    ) {
      return null;
    }

    // Gate 4: mapping must have auto-trigger enabled
    if (!mapping.autoTrigger) return null;

    const deploymentUrl = this.extractDeploymentUrl(deployPayload);

    const context: TriggerContext = {
      projectId: mapping.projectId,
      repositoryFullName: deployPayload.repository?.full_name ?? '',
      deploymentId: deployPayload.deployment?.id ?? 0,
      environment,
      deploymentUrl,
      ref: deployPayload.deployment?.ref ?? '',
      sha: deployPayload.deployment?.sha ?? '',
      triggeredBy: deployPayload.sender?.login ?? 'github',
    };

    return this.coordinator.triggerTestRun(context);
  }
}
