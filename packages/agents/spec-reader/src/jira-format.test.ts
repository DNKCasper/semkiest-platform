import { parseJiraAcceptanceCriteria, stripJiraMarkup } from './jira-format';

describe('stripJiraMarkup', () => {
  it('strips bold markup', () => {
    expect(stripJiraMarkup('*bold text*')).toBe('bold text');
  });

  it('strips italic markup', () => {
    expect(stripJiraMarkup('_italic text_')).toBe('italic text');
  });

  it('strips heading markup', () => {
    expect(stripJiraMarkup('h2. My Heading')).toBe('My Heading');
    expect(stripJiraMarkup('h1. Title\nh3. Sub')).toBe('Title\nSub');
  });

  it('strips Jira macros', () => {
    expect(stripJiraMarkup('{code:java}foo{code}')).toBe('foo');
    expect(stripJiraMarkup('{color:red}text{color}')).toBe('text');
  });

  it('strips wiki links with alias', () => {
    expect(stripJiraMarkup('[display text|http://example.com]')).toBe(
      'display text',
    );
  });

  it('strips plain wiki links', () => {
    expect(stripJiraMarkup('[http://example.com]')).toBe('http://example.com');
  });

  it('returns plain text unchanged', () => {
    const plain = 'Given a user is logged in';
    expect(stripJiraMarkup(plain)).toBe(plain);
  });
});

describe('parseJiraAcceptanceCriteria', () => {
  describe('empty and blank input', () => {
    it('returns empty array for empty string', () => {
      expect(parseJiraAcceptanceCriteria('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(parseJiraAcceptanceCriteria('   \n  \t  ')).toEqual([]);
    });
  });

  describe('single scenario without Scenario header', () => {
    it('parses basic Given/When/Then', () => {
      const text = `
        Given a user is on the login page
        When the user enters valid credentials
        Then the user is redirected to the dashboard
      `;
      const scenarios = parseJiraAcceptanceCriteria(text);
      expect(scenarios).toHaveLength(1);
      const [scenario] = scenarios;
      expect(scenario.steps).toHaveLength(3);

      expect(scenario.steps[0]).toEqual({
        keyword: 'Given',
        role: 'precondition',
        text: 'a user is on the login page',
      });
      expect(scenario.steps[1]).toEqual({
        keyword: 'When',
        role: 'action',
        text: 'the user enters valid credentials',
      });
      expect(scenario.steps[2]).toEqual({
        keyword: 'Then',
        role: 'assertion',
        text: 'the user is redirected to the dashboard',
      });
    });
  });

  describe('And/But connectors', () => {
    it('And inherits the role of the preceding primary keyword', () => {
      const text = `
        Given a user is logged in
        And the user has admin rights
        When the user clicks delete
        Then the record is removed
        And a confirmation message is shown
      `;
      const [scenario] = parseJiraAcceptanceCriteria(text);
      expect(scenario.steps[0].role).toBe('precondition'); // Given
      expect(scenario.steps[1].role).toBe('precondition'); // And after Given
      expect(scenario.steps[2].role).toBe('action'); // When
      expect(scenario.steps[3].role).toBe('assertion'); // Then
      expect(scenario.steps[4].role).toBe('assertion'); // And after Then
    });

    it('But inherits the role of the preceding primary keyword', () => {
      const text = `
        Given a user is on the page
        When the user submits the form
        Then success is displayed
        But no email is sent
      `;
      const [scenario] = parseJiraAcceptanceCriteria(text);
      expect(scenario.steps[3]).toEqual({
        keyword: 'But',
        role: 'assertion',
        text: 'no email is sent',
      });
    });
  });

  describe('multiple Scenario blocks', () => {
    it('separates scenarios by Scenario: headers', () => {
      const text = `
        Scenario: Successful login
          Given a valid user exists
          When the user logs in
          Then access is granted

        Scenario: Failed login
          Given a valid user exists
          When the user enters wrong password
          Then access is denied
          And an error message is displayed
      `;
      const scenarios = parseJiraAcceptanceCriteria(text);
      expect(scenarios).toHaveLength(2);
      expect(scenarios[0].title).toBe('Successful login');
      expect(scenarios[0].steps).toHaveLength(3);
      expect(scenarios[1].title).toBe('Failed login');
      expect(scenarios[1].steps).toHaveLength(4);
    });

    it('handles Scenario Outline headers', () => {
      const text = `
        Scenario Outline: Login with different roles
          Given a user with role <role>
          When the user logs in
          Then the user sees the <dashboard>
      `;
      const [scenario] = parseJiraAcceptanceCriteria(text);
      expect(scenario.title).toBe('Login with different roles');
      expect(scenario.steps).toHaveLength(3);
    });
  });

  describe('Jira markup handling', () => {
    it('strips markup before parsing', () => {
      const text = `
        h3. Login Scenarios
        *Given* a user is on the login page
        When the user enters _valid_ credentials
        Then the user sees the {color:green}success{color} message
      `;
      const [scenario] = parseJiraAcceptanceCriteria(text);
      expect(scenario.steps[0].keyword).toBe('Given');
      expect(scenario.steps[0].text).toBe('a user is on the login page');
    });
  });

  describe('case insensitivity', () => {
    it('handles lowercase keywords', () => {
      const text = `
        given a user exists
        when the user logs in
        then success is shown
      `;
      const [scenario] = parseJiraAcceptanceCriteria(text);
      expect(scenario.steps[0].keyword).toBe('Given');
      expect(scenario.steps[1].keyword).toBe('When');
      expect(scenario.steps[2].keyword).toBe('Then');
    });
  });

  describe('step role resolution', () => {
    it('correctly identifies preconditions from Given steps', () => {
      const text = 'Given the system is running\nWhen called\nThen ok';
      const [scenario] = parseJiraAcceptanceCriteria(text);
      expect(scenario.steps.filter((s) => s.role === 'precondition')).toHaveLength(1);
    });

    it('correctly identifies actions from When steps', () => {
      const text = 'Given setup\nWhen the user clicks submit\nThen ok';
      const [scenario] = parseJiraAcceptanceCriteria(text);
      expect(scenario.steps.filter((s) => s.role === 'action')).toHaveLength(1);
    });

    it('correctly identifies assertions from Then steps', () => {
      const text = 'Given setup\nWhen action\nThen the result is shown\nThen another assertion';
      const [scenario] = parseJiraAcceptanceCriteria(text);
      expect(scenario.steps.filter((s) => s.role === 'assertion')).toHaveLength(2);
    });
  });
});
