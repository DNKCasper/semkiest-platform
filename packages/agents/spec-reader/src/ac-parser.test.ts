import { parseAcceptanceCriteria } from './ac-parser';
import type { ParseOptions } from './types';

const jiraOptions: ParseOptions = { sourceId: 'PROJ-123', sourceSystem: 'jira' };
const asanaOptions: ParseOptions = { sourceId: 'task-456', sourceSystem: 'asana' };
const freeformOptions: ParseOptions = { sourceId: 'PROJ-789', sourceSystem: 'freeform' };

describe('parseAcceptanceCriteria', () => {
  describe('empty input handling', () => {
    it('returns empty result for empty string', () => {
      const result = parseAcceptanceCriteria('', jiraOptions);
      expect(result.scenarios).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.sourceId).toBe('PROJ-123');
      expect(result.sourceSystem).toBe('jira');
    });

    it('returns empty result for whitespace-only input', () => {
      const result = parseAcceptanceCriteria('   \n  ', jiraOptions);
      expect(result.scenarios).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Jira format parsing', () => {
    it('parses a single Gherkin scenario', () => {
      const text = `
        Given the user is on the login page
        When the user enters valid credentials
        Then the user is redirected to the dashboard
      `;
      const result = parseAcceptanceCriteria(text, jiraOptions);
      expect(result.scenarios).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const [scenario] = result.scenarios;
      expect(scenario.id).toBe('PROJ-123_scenario_1');
      expect(scenario.sourceId).toBe('PROJ-123');
      expect(scenario.sourceSystem).toBe('jira');
      expect(scenario.preconditions).toEqual(['the user is on the login page']);
      expect(scenario.steps).toEqual(['the user enters valid credentials']);
      expect(scenario.assertions).toEqual(['the user is redirected to the dashboard']);
      expect(scenario.rawCriteria).toBe(text);
    });

    it('parses multiple Gherkin scenarios with traceability', () => {
      const text = `
        Scenario: Login success
          Given a valid user
          When the user logs in
          Then access is granted

        Scenario: Login failure
          Given a valid user
          When the user enters wrong password
          Then access is denied
      `;
      const result = parseAcceptanceCriteria(text, jiraOptions);
      expect(result.scenarios).toHaveLength(2);
      expect(result.scenarios[0].id).toBe('PROJ-123_scenario_1');
      expect(result.scenarios[0].title).toBe('Login success');
      expect(result.scenarios[1].id).toBe('PROJ-123_scenario_2');
      expect(result.scenarios[1].title).toBe('Login failure');
    });

    it('maintains traceability back to original issue', () => {
      const text = 'Given x\nWhen y\nThen z';
      const result = parseAcceptanceCriteria(text, jiraOptions);
      expect(result.scenarios[0].sourceId).toBe('PROJ-123');
      expect(result.scenarios[0].sourceSystem).toBe('jira');
      expect(result.scenarios[0].rawCriteria).toBe(text);
    });

    it('handles And connectors in preconditions', () => {
      const text = `
        Given user is logged in
        And user has admin role
        When user deletes record
        Then record is removed
        And audit log is updated
      `;
      const result = parseAcceptanceCriteria(text, jiraOptions);
      const [scenario] = result.scenarios;
      expect(scenario.preconditions).toEqual([
        'user is logged in',
        'user has admin role',
      ]);
      expect(scenario.assertions).toEqual([
        'record is removed',
        'audit log is updated',
      ]);
    });
  });

  describe('Asana format parsing', () => {
    it('parses a bullet list into a test scenario', () => {
      const text = `
        - User is authenticated
        - Click the submit button
        - Form should be saved successfully
      `;
      const result = parseAcceptanceCriteria(text, asanaOptions);
      expect(result.scenarios).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.scenarios[0].sourceId).toBe('task-456');
      expect(result.scenarios[0].sourceSystem).toBe('asana');
    });

    it('parses numbered list into test scenario', () => {
      const text = '1. Open the app\n2. Enter credentials\n3. Dashboard should appear';
      const result = parseAcceptanceCriteria(text, asanaOptions);
      expect(result.scenarios).toHaveLength(1);
      expect(result.scenarios[0].steps).toBeDefined();
    });

    it('generates default title when no Scenario header is present', () => {
      const text = '- User logs in\n- Dashboard should load';
      const result = parseAcceptanceCriteria(text, asanaOptions);
      expect(result.scenarios[0].title).toBe('task-456 – Scenario 1');
    });
  });

  describe('freeform / auto-detect', () => {
    it('auto-detects Gherkin format when keywords are present', () => {
      const text = 'Given x\nWhen y\nThen z';
      const result = parseAcceptanceCriteria(text, freeformOptions);
      expect(result.scenarios).toHaveLength(1);
      // The effective format used should produce valid steps
      expect(result.scenarios[0].preconditions).toContain('x');
    });

    it('auto-detects Asana/structured format when no Gherkin keywords', () => {
      const text = '- User opens settings\n- User clicks save\n- Changes should be persisted';
      const result = parseAcceptanceCriteria(text, freeformOptions);
      expect(result.scenarios).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('drops scenarios with no steps and records a parse error', () => {
      // A Scenario header with no steps is empty
      const text = 'Scenario: Empty scenario\n\nScenario: Real scenario\nGiven x\nWhen y\nThen z';
      const result = parseAcceptanceCriteria(text, jiraOptions);
      // The empty scenario is dropped with an error
      expect(result.scenarios).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('no steps');
    });

    it('returns all sourceId and sourceSystem metadata', () => {
      const result = parseAcceptanceCriteria('Given x\nWhen y\nThen z', jiraOptions);
      expect(result.sourceId).toBe('PROJ-123');
      expect(result.sourceSystem).toBe('jira');
    });

    it('generates sequential scenario IDs for multiple scenarios', () => {
      const text = `
        Scenario: One
          Given a
          When b
          Then c
        Scenario: Two
          Given d
          When e
          Then f
      `;
      const result = parseAcceptanceCriteria(text, jiraOptions);
      expect(result.scenarios[0].id).toBe('PROJ-123_scenario_1');
      expect(result.scenarios[1].id).toBe('PROJ-123_scenario_2');
    });
  });

  describe('output format compatibility', () => {
    it('produces scenarios with all required TestScenario fields', () => {
      const text = 'Given setup\nWhen action\nThen result';
      const result = parseAcceptanceCriteria(text, jiraOptions);
      const scenario = result.scenarios[0];

      expect(scenario).toHaveProperty('id');
      expect(scenario).toHaveProperty('title');
      expect(scenario).toHaveProperty('sourceId');
      expect(scenario).toHaveProperty('sourceSystem');
      expect(scenario).toHaveProperty('preconditions');
      expect(scenario).toHaveProperty('steps');
      expect(scenario).toHaveProperty('assertions');
      expect(scenario).toHaveProperty('rawCriteria');

      expect(Array.isArray(scenario.preconditions)).toBe(true);
      expect(Array.isArray(scenario.steps)).toBe(true);
      expect(Array.isArray(scenario.assertions)).toBe(true);
    });
  });
});
