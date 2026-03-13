/**
 * Jira integration configuration.
 *
 * Defines types and a manager for Jira project mapping, custom field mapping,
 * and workflow mapping. Configuration is held in-memory and can be persisted
 * externally (e.g. database) by callers.
 */

/** Test result status values used on the SemkiEst side. */
export type SemTestStatus = 'passed' | 'failed' | 'skipped' | 'error';

/**
 * Maps a SemkiEst project to a Jira project and controls sync behaviour.
 */
export interface ProjectMapping {
  /** SemkiEst internal project ID */
  semProjectId: string;
  /** Jira project key, e.g. "SEM" */
  jiraProjectKey: string;
  /** Whether bidirectional sync is enabled for this project */
  syncEnabled: boolean;
  /** Whether to auto-update Jira ticket status when a test passes */
  autoUpdateStatus: boolean;
  /**
   * Milliseconds to wait after a test result before updating Jira status.
   * Default: 0 (immediate).
   */
  statusSyncDelayMs: number;
  /** Whether to post test result comments to Jira tickets */
  postResultComments: boolean;
}

/**
 * Maps a SemkiEst internal field name to a Jira field (standard or custom).
 */
export interface FieldMapping {
  /** SemkiEst field identifier, e.g. "acceptanceCriteria" */
  semField: string;
  /** Jira field identifier, e.g. "description" or "customfield_10016" */
  jiraField: string;
  /** Whether jiraField is a Jira custom field */
  fieldType: 'standard' | 'custom';
  /** Human-readable display name for UI purposes */
  displayName: string;
}

/**
 * Maps a SemkiEst test outcome to a Jira workflow transition.
 */
export interface WorkflowMapping {
  /** Test status that triggers this mapping */
  semStatus: SemTestStatus;
  /** ID of the Jira transition to execute */
  jiraTransitionId: string;
  /** Display name of the Jira transition (informational) */
  jiraTransitionName: string;
  /**
   * Condition that must be met within a test suite for the transition to fire.
   * - "all_pass": every test in the suite must pass
   * - "any_pass": at least one test must pass
   * - "any_fail": at least one test must fail
   */
  condition: 'all_pass' | 'any_pass' | 'any_fail';
}

/** Full Jira integration configuration for a SemkiEst workspace. */
export interface JiraIntegrationConfig {
  /** Jira instance base URL, e.g. https://yourorg.atlassian.net */
  baseUrl: string;
  /** Atlassian account email used for API authentication */
  email: string;
  /**
   * Jira API token.
   * NOTE: treat as a secret – never log or expose this value.
   */
  apiToken: string;
  /** Per-project sync settings */
  projectMappings: ProjectMapping[];
  /** Field name translations between SemkiEst and Jira */
  fieldMappings: FieldMapping[];
  /** Workflow transition rules driven by test results */
  workflowMappings: WorkflowMapping[];
  /**
   * Optional secret used to verify incoming Jira webhook payloads.
   * When set, the handler will reject requests with an invalid signature.
   */
  webhookSecret?: string;
}

/** Partial update payload for JiraIntegrationConfig. */
export type JiraIntegrationConfigUpdate = Partial<
  Omit<JiraIntegrationConfig, 'projectMappings' | 'fieldMappings' | 'workflowMappings'>
> & {
  projectMappings?: Partial<ProjectMapping>[];
  fieldMappings?: Partial<FieldMapping>[];
  workflowMappings?: Partial<WorkflowMapping>[];
};

const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
  {
    semField: 'acceptanceCriteria',
    jiraField: 'description',
    fieldType: 'standard',
    displayName: 'Description (AC)',
  },
  {
    semField: 'summary',
    jiraField: 'summary',
    fieldType: 'standard',
    displayName: 'Summary',
  },
];

/**
 * Manages Jira integration configuration for a single SemkiEst workspace.
 *
 * Stores configuration in-memory. Callers are responsible for persisting and
 * loading configuration from a durable store (e.g. database) and initialising
 * this manager via {@link JiraConfigManager.load}.
 */
export class JiraConfigManager {
  private config: JiraIntegrationConfig | null = null;

  /**
   * Load (or replace) the active configuration.
   */
  load(config: JiraIntegrationConfig): void {
    this.config = {
      ...config,
      fieldMappings:
        config.fieldMappings.length > 0 ? config.fieldMappings : DEFAULT_FIELD_MAPPINGS,
    };
  }

  /**
   * Returns the active configuration.
   * @throws {Error} when no configuration has been loaded.
   */
  get(): JiraIntegrationConfig {
    if (!this.config) {
      throw new Error(
        'Jira integration is not configured. Call JiraConfigManager.load() first.',
      );
    }
    return this.config;
  }

  /** Returns true when a configuration has been loaded. */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Apply a partial update to the active configuration and return the updated
   * value. The caller is responsible for persisting the result.
   */
  update(patch: JiraIntegrationConfigUpdate): JiraIntegrationConfig {
    const current = this.get();
    const updated: JiraIntegrationConfig = {
      ...current,
      ...patch,
      projectMappings: patch.projectMappings
        ? (patch.projectMappings as ProjectMapping[])
        : current.projectMappings,
      fieldMappings: patch.fieldMappings
        ? (patch.fieldMappings as FieldMapping[])
        : current.fieldMappings,
      workflowMappings: patch.workflowMappings
        ? (patch.workflowMappings as WorkflowMapping[])
        : current.workflowMappings,
    };
    this.config = updated;
    return updated;
  }

  /**
   * Find the project mapping for a SemkiEst project ID.
   */
  getProjectMapping(semProjectId: string): ProjectMapping | undefined {
    return this.get().projectMappings.find((m) => m.semProjectId === semProjectId);
  }

  /**
   * Find the Jira field identifier that corresponds to a SemkiEst field name.
   */
  getJiraField(semField: string): string | undefined {
    const mapping = this.get().fieldMappings.find((m) => m.semField === semField);
    return mapping?.jiraField;
  }

  /**
   * Find workflow mappings that match a given test status.
   */
  getWorkflowMappings(semStatus: SemTestStatus): WorkflowMapping[] {
    return this.get().workflowMappings.filter((m) => m.semStatus === semStatus);
  }
}

/** Singleton config manager instance for use across the integration package. */
export const jiraConfig = new JiraConfigManager();
