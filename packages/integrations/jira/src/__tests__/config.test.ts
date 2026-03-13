import {
  JiraConfigManager,
  JiraIntegrationConfig,
  ProjectMapping,
  WorkflowMapping,
} from '../config.js';

const baseConfig: JiraIntegrationConfig = {
  baseUrl: 'https://test.atlassian.net',
  email: 'test@example.com',
  apiToken: 'test-token',
  projectMappings: [
    {
      semProjectId: 'proj-1',
      jiraProjectKey: 'SEM',
      syncEnabled: true,
      autoUpdateStatus: true,
      statusSyncDelayMs: 0,
      postResultComments: true,
    },
  ],
  fieldMappings: [],
  workflowMappings: [
    {
      semStatus: 'passed',
      jiraTransitionId: '31',
      jiraTransitionName: 'Done',
      condition: 'all_pass',
    },
  ],
  webhookSecret: 'secret-xyz',
};

describe('JiraConfigManager', () => {
  let manager: JiraConfigManager;

  beforeEach(() => {
    manager = new JiraConfigManager();
  });

  describe('load / get', () => {
    it('returns loaded config', () => {
      manager.load(baseConfig);
      const config = manager.get();
      expect(config.baseUrl).toBe(baseConfig.baseUrl);
      expect(config.email).toBe(baseConfig.email);
    });

    it('populates default field mappings when none are provided', () => {
      manager.load({ ...baseConfig, fieldMappings: [] });
      const config = manager.get();
      expect(config.fieldMappings.length).toBeGreaterThan(0);
      expect(config.fieldMappings[0].semField).toBe('acceptanceCriteria');
    });

    it('throws when not configured', () => {
      expect(() => manager.get()).toThrow('not configured');
    });
  });

  describe('isConfigured', () => {
    it('returns false before load', () => {
      expect(manager.isConfigured()).toBe(false);
    });

    it('returns true after load', () => {
      manager.load(baseConfig);
      expect(manager.isConfigured()).toBe(true);
    });
  });

  describe('update', () => {
    it('applies partial updates', () => {
      manager.load(baseConfig);
      const updated = manager.update({ email: 'new@example.com' });
      expect(updated.email).toBe('new@example.com');
      expect(updated.baseUrl).toBe(baseConfig.baseUrl);
    });

    it('replaces projectMappings when provided', () => {
      manager.load(baseConfig);
      const newMapping: ProjectMapping = {
        semProjectId: 'proj-2',
        jiraProjectKey: 'DEMO',
        syncEnabled: false,
        autoUpdateStatus: false,
        statusSyncDelayMs: 0,
        postResultComments: false,
      };
      const updated = manager.update({ projectMappings: [newMapping] });
      expect(updated.projectMappings).toHaveLength(1);
      expect(updated.projectMappings[0].semProjectId).toBe('proj-2');
    });
  });

  describe('getProjectMapping', () => {
    it('finds an existing mapping', () => {
      manager.load(baseConfig);
      const mapping = manager.getProjectMapping('proj-1');
      expect(mapping?.jiraProjectKey).toBe('SEM');
    });

    it('returns undefined for unknown project', () => {
      manager.load(baseConfig);
      expect(manager.getProjectMapping('unknown')).toBeUndefined();
    });
  });

  describe('getJiraField', () => {
    it('returns jiraField for known semField', () => {
      manager.load(baseConfig);
      expect(manager.getJiraField('acceptanceCriteria')).toBe('description');
    });

    it('returns undefined for unknown semField', () => {
      manager.load(baseConfig);
      expect(manager.getJiraField('nonexistent')).toBeUndefined();
    });
  });

  describe('getWorkflowMappings', () => {
    it('returns mappings matching semStatus', () => {
      manager.load(baseConfig);
      const mappings: WorkflowMapping[] = manager.getWorkflowMappings('passed');
      expect(mappings).toHaveLength(1);
      expect(mappings[0].jiraTransitionName).toBe('Done');
    });

    it('returns empty array for unmatched status', () => {
      manager.load(baseConfig);
      expect(manager.getWorkflowMappings('failed')).toHaveLength(0);
    });
  });
});
