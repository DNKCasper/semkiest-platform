import { parseAsanaAcceptanceCriteria } from './asana-format';

describe('parseAsanaAcceptanceCriteria', () => {
  describe('empty and blank input', () => {
    it('returns empty array for empty string', () => {
      expect(parseAsanaAcceptanceCriteria('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(parseAsanaAcceptanceCriteria('   \n  ')).toEqual([]);
    });
  });

  describe('Gherkin syntax in Asana descriptions', () => {
    it('delegates to Gherkin parser when Given/When/Then keywords are present', () => {
      const text = `
        Given the user is authenticated
        When the user opens the dashboard
        Then the list of projects is visible
      `;
      const scenarios = parseAsanaAcceptanceCriteria(text);
      expect(scenarios).toHaveLength(1);
      expect(scenarios[0].steps[0].keyword).toBe('Given');
      expect(scenarios[0].steps[1].keyword).toBe('When');
      expect(scenarios[0].steps[2].keyword).toBe('Then');
    });

    it('preserves And connectors when delegating to Gherkin parser', () => {
      const text = `
        Given the user is logged in
        And has admin role
        When clicking delete
        Then record is removed
      `;
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps[1].keyword).toBe('And');
      expect(scenario.steps[1].role).toBe('precondition');
    });
  });

  describe('checkbox list items', () => {
    it('parses Markdown unchecked checkboxes', () => {
      const text = `
        - [ ] User should see the login form
        - [ ] User clicks submit button
        - [ ] Success message should appear
      `;
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps).toHaveLength(3);
      expect(scenario.steps.map((s) => s.text)).toEqual([
        'User should see the login form',
        'User clicks submit button',
        'Success message should appear',
      ]);
    });

    it('parses Markdown checked checkboxes', () => {
      const text = '- [x] User is authenticated\n- [X] Form is submitted';
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps).toHaveLength(2);
    });
  });

  describe('bullet list items', () => {
    it('parses dash bullet points', () => {
      const text = `
        - User navigates to settings
        - User enters new password
        - Password is updated successfully
      `;
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps).toHaveLength(3);
      expect(scenario.steps[0].text).toBe('User navigates to settings');
    });

    it('parses asterisk bullet points', () => {
      const text = '* Click the button\n* Form is submitted\n* Confirmation appears';
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps).toHaveLength(3);
    });
  });

  describe('numbered list items', () => {
    it('parses numbered list with periods', () => {
      const text = `
        1. User opens the app
        2. User enters credentials
        3. Dashboard should be visible
      `;
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps).toHaveLength(3);
      expect(scenario.steps[0].text).toBe('User opens the app');
    });

    it('parses numbered list with parentheses', () => {
      const text = '1) System is running\n2) User clicks login\n3) Session is created';
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps).toHaveLength(3);
    });
  });

  describe('step role classification', () => {
    it('classifies items with "should" as assertions', () => {
      const text = '- User should see confirmation\n- User should be redirected';
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps[0].role).toBe('assertion');
      expect(scenario.steps[1].role).toBe('assertion');
    });

    it('classifies items with action verbs as actions', () => {
      const text = '- User is authenticated\n- Click the submit button\n- Form should be saved';
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps[1].role).toBe('action');
    });

    it('classifies items with precondition keywords correctly', () => {
      const text = '- Given user is logged in\n- Navigate to settings\n- Settings should load';
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps[0].role).toBe('precondition');
    });

    it('uses positional heuristic for unclassifiable items', () => {
      const text = '- First item here\n- Second item here\n- Third item here';
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      // First → precondition, last → assertion, middle → action
      expect(scenario.steps[0].role).toBe('precondition');
      expect(scenario.steps[2].role).toBe('assertion');
    });
  });

  describe('keyword selection', () => {
    it('uses And for subsequent steps with the same role', () => {
      const text = `
        - User should see header
        - User should see footer
        - User should see sidebar
      `;
      const [scenario] = parseAsanaAcceptanceCriteria(text);
      expect(scenario.steps[0].keyword).toBe('Then');
      expect(scenario.steps[1].keyword).toBe('And');
      expect(scenario.steps[2].keyword).toBe('And');
    });
  });

  describe('returns empty array for non-list content', () => {
    it('returns empty array when all lines are too short', () => {
      const text = 'hi\nok\nyes\nno';
      const result = parseAsanaAcceptanceCriteria(text);
      // Either returns empty (if items.length === 0) or very short items
      // Since each is <= 5 chars, they are skipped
      expect(result).toHaveLength(0);
    });
  });
});
