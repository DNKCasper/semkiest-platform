import { AcReader } from '../ac-reader.js';
import { JiraIssue } from '../client.js';
import { JiraIntegrationConfig } from '../config.js';

const config: JiraIntegrationConfig = {
  baseUrl: 'https://test.atlassian.net',
  email: 'test@example.com',
  apiToken: 'token',
  projectMappings: [],
  fieldMappings: [],
  workflowMappings: [],
};

function makeIssue(descriptionText: string | null): JiraIssue {
  return {
    id: '10001',
    key: 'SEM-42',
    self: 'https://test.atlassian.net/rest/api/3/issue/10001',
    fields: {
      summary: 'User can log in',
      description: descriptionText
        ? {
            version: 1,
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: descriptionText }],
              },
            ],
          }
        : null,
      status: { id: '1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
      issuetype: { id: '10001', name: 'Story' },
      project: { id: '10000', key: 'SEM', name: 'SemkiEst' },
      assignee: null,
      reporter: null,
      priority: null,
      labels: [],
    },
  };
}

describe('AcReader', () => {
  const reader = new AcReader(config);

  describe('parseIssue – bullet list AC', () => {
    it('extracts bullet criteria from description', () => {
      const issue = makeIssue('- User can enter email\n- User can enter password\n- Login button is enabled');
      const ac = reader.parseIssue(issue);

      expect(ac.issueKey).toBe('SEM-42');
      expect(ac.summary).toBe('User can log in');
      expect(ac.criteria.length).toBe(3);
      expect(ac.criteria[0].format).toBe('bullet');
      expect(ac.criteria[0].text).toBe('User can enter email');
    });
  });

  describe('parseIssue – GWT format', () => {
    it('groups Given/When/Then into a single criterion', () => {
      const gwtText =
        'Given the user is on the login page When they enter valid credentials Then they are redirected to the dashboard';
      const issue = makeIssue(gwtText);
      const ac = reader.parseIssue(issue);

      expect(ac.criteria.length).toBe(1);
      expect(ac.criteria[0].format).toBe('given_when_then');
    });
  });

  describe('parseIssue – empty description', () => {
    it('returns empty criteria for null description', () => {
      const issue = makeIssue(null);
      const ac = reader.parseIssue(issue);

      expect(ac.criteria).toHaveLength(0);
      expect(ac.rawText).toBe('');
    });
  });

  describe('generateTestCases', () => {
    it('produces one test case per criterion', () => {
      const issue = makeIssue('- AC 1\n- AC 2');
      const ac = reader.parseIssue(issue);
      const testCases = reader.generateTestCases(ac);

      expect(testCases).toHaveLength(2);
      expect(testCases[0].issueKey).toBe('SEM-42');
      expect(testCases[0].title).toContain('[SEM-42]');
    });

    it('adds GWT steps for given_when_then criteria', () => {
      const gwtText = 'Given the user is logged in When they click logout Then they are signed out';
      const issue = makeIssue(gwtText);
      const ac = reader.parseIssue(issue);
      const testCases = reader.generateTestCases(ac);

      expect(testCases[0].steps.length).toBeGreaterThan(0);
      expect(testCases[0].steps[0].keyword).toBe('Given');
    });

    it('returns empty steps for bullet criteria', () => {
      const issue = makeIssue('- Simple requirement');
      const ac = reader.parseIssue(issue);
      const testCases = reader.generateTestCases(ac);

      expect(testCases[0].steps).toHaveLength(0);
    });
  });

  describe('parseIssue – custom field AC', () => {
    it('prefers custom field over description when both present', () => {
      const issue = makeIssue('Description content');
      (issue.fields as Record<string, unknown>)['customfield_10100'] = 'Custom AC field content';
      const ac = reader.parseIssue(issue, 'customfield_10100');

      expect(ac.rawText).toBe('Custom AC field content');
    });
  });
});
