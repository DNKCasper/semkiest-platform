import { ScenarioGenerator } from './scenario-generator';
import type { LLMClient, TestScenario, UserFlow } from './types';

// ---------------------------------------------------------------------------
// Mock LLM client
// ---------------------------------------------------------------------------

function makeScenarioJSON(overrides: Partial<Record<string, unknown>> = {}): object {
  return {
    id: 'login_happy_path',
    title: 'Successful login with valid credentials',
    description: 'Verifies that a user with valid credentials can log in.',
    priority: 'critical',
    prerequisites: [{ type: 'data', description: 'A registered user account must exist.' }],
    steps: [
      {
        stepNumber: 1,
        description: 'Navigate to the login page',
        action: 'navigate',
        target: 'https://example.com/login',
        value: 'https://example.com/login',
        expectedOutcome: 'Login page is displayed',
      },
      {
        stepNumber: 2,
        description: 'Enter email address',
        action: 'type',
        target: '[name="email"]',
        value: 'user@example.com',
        expectedOutcome: 'Email field contains the entered value',
      },
      {
        stepNumber: 3,
        description: 'Enter password',
        action: 'type',
        target: '[name="password"]',
        value: 'SecurePassword123!',
        expectedOutcome: 'Password field is filled',
      },
      {
        stepNumber: 4,
        description: 'Click the Sign In button',
        action: 'click',
        target: 'button[type="submit"]',
        expectedOutcome: 'User is redirected to the dashboard',
      },
    ],
    expectedOutcomes: ['User is authenticated', 'Dashboard page is visible'],
    tags: ['smoke', 'auth', 'happy-path'],
    pageUrl: 'https://example.com/login',
    estimatedDuration: 30,
    ...overrides,
  };
}

function makeMockLLMClient(scenarios: object[]): LLMClient {
  return {
    complete: jest.fn().mockResolvedValue(JSON.stringify(scenarios)),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUserFlow(overrides: Partial<UserFlow> = {}): UserFlow {
  return {
    id: 'flow-login',
    type: 'login',
    name: 'User Login Flow',
    description: 'Covers all scenarios for authenticating an existing user.',
    involvedPages: ['https://example.com/login'],
    interactions: [],
    priority: 10,
    complexity: 'simple',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScenarioGenerator', () => {
  describe('generateScenarios()', () => {
    it('returns an empty array when no flows are provided', async () => {
      const generator = new ScenarioGenerator({ llmClient: makeMockLLMClient([]) });
      const result = await generator.generateScenarios([]);
      expect(result).toEqual([]);
    });

    it('calls the LLM client once per flow', async () => {
      const llmClient = makeMockLLMClient([makeScenarioJSON()]);
      const generator = new ScenarioGenerator({ llmClient });

      const flows = [
        makeUserFlow({ id: 'flow-1', type: 'login' }),
        makeUserFlow({ id: 'flow-2', type: 'registration' }),
      ];

      await generator.generateScenarios(flows);
      expect(llmClient.complete).toHaveBeenCalledTimes(2);
    });

    it('creates one TestSuite per UserFlow', async () => {
      const llmClient = makeMockLLMClient([makeScenarioJSON()]);
      const generator = new ScenarioGenerator({ llmClient });

      const flows = [makeUserFlow()];
      const suites = await generator.generateScenarios(flows);

      expect(suites).toHaveLength(1);
      expect(suites[0]!.flowType).toBe('login');
    });

    it('maps suite name correctly', async () => {
      const generator = new ScenarioGenerator({
        llmClient: makeMockLLMClient([makeScenarioJSON()]),
      });

      const suites = await generator.generateScenarios([makeUserFlow()]);
      expect(suites[0]!.name).toBe('User Login Flow Suite');
    });

    it('sets createdAt as a valid ISO timestamp', async () => {
      const generator = new ScenarioGenerator({
        llmClient: makeMockLLMClient([makeScenarioJSON()]),
      });

      const suites = await generator.generateScenarios([makeUserFlow()]);
      expect(new Date(suites[0]!.createdAt).toISOString()).toBe(suites[0]!.createdAt);
    });

    it('populates scenarios from LLM output', async () => {
      const generator = new ScenarioGenerator({
        llmClient: makeMockLLMClient([makeScenarioJSON(), makeScenarioJSON({ id: 'login_edge_01', title: 'Login with invalid credentials' })]),
      });

      const suites = await generator.generateScenarios([makeUserFlow()]);
      expect(suites[0]!.scenarios).toHaveLength(2);
    });

    it('sorts scenarios with critical priority first', async () => {
      const generator = new ScenarioGenerator({
        llmClient: makeMockLLMClient([
          makeScenarioJSON({ id: 'low_priority_01', title: 'Low priority scenario', priority: 'low' }),
          makeScenarioJSON({ id: 'crit_priority_01', title: 'Critical scenario', priority: 'critical' }),
          makeScenarioJSON({ id: 'high_priority_01', title: 'High priority scenario', priority: 'high' }),
        ]),
      });

      const suites = await generator.generateScenarios([makeUserFlow()]);
      const priorities = suites[0]!.scenarios.map((s: TestScenario) => s.priority);

      expect(priorities[0]).toBe('critical');
      expect(priorities[priorities.length - 1]).toBe('low');
    });

    it('falls back to flow-default priority when scenario priority is missing', async () => {
      const generator = new ScenarioGenerator({
        llmClient: makeMockLLMClient([makeScenarioJSON({ priority: undefined })]),
      });

      const suites = await generator.generateScenarios([makeUserFlow()]);
      // login flow defaults to 'critical'
      expect(suites[0]!.scenarios[0]!.priority).toBe('critical');
    });

    it('correctly parses TestStep fields', async () => {
      const generator = new ScenarioGenerator({
        llmClient: makeMockLLMClient([makeScenarioJSON()]),
      });

      const suites = await generator.generateScenarios([makeUserFlow()]);
      const step = suites[0]!.scenarios[0]!.steps[0]!;

      expect(step.stepNumber).toBe(1);
      expect(step.action).toBe('navigate');
      expect(step.target).toBe('https://example.com/login');
      expect(step.expectedOutcome).toBe('Login page is displayed');
    });

    it('strips markdown code fences from LLM output', async () => {
      const llmClient: LLMClient = {
        complete: jest.fn().mockResolvedValue(
          '```json\n' + JSON.stringify([makeScenarioJSON()]) + '\n```',
        ),
      };
      const generator = new ScenarioGenerator({ llmClient });
      const suites = await generator.generateScenarios([makeUserFlow()]);
      expect(suites[0]!.scenarios).toHaveLength(1);
    });

    it('throws a descriptive error on invalid JSON from LLM', async () => {
      const llmClient: LLMClient = {
        complete: jest.fn().mockResolvedValue('this is not json'),
      };
      const generator = new ScenarioGenerator({ llmClient });
      await expect(generator.generateScenarios([makeUserFlow()])).rejects.toThrow(
        /Failed to parse LLM response as JSON/,
      );
    });

    it('throws when LLM returns a non-array JSON value', async () => {
      const llmClient: LLMClient = {
        complete: jest.fn().mockResolvedValue('{"key": "value"}'),
      };
      const generator = new ScenarioGenerator({ llmClient });
      await expect(generator.generateScenarios([makeUserFlow()])).rejects.toThrow(
        /Expected a JSON array/,
      );
    });

    it('generates a stable suite ID for the same flow inputs', async () => {
      const generator = new ScenarioGenerator({
        llmClient: makeMockLLMClient([makeScenarioJSON()]),
      });

      const flow = makeUserFlow();
      const [first] = await generator.generateScenarios([flow]);
      const [second] = await generator.generateScenarios([flow]);

      expect(first!.id).toBe(second!.id);
    });
  });

  describe('generateSuiteForFlow()', () => {
    it('sets suite priority from the highest-priority scenario', async () => {
      const generator = new ScenarioGenerator({
        llmClient: makeMockLLMClient([
          makeScenarioJSON({ id: 'med_01', title: 'Medium scenario', priority: 'medium' }),
          makeScenarioJSON({ id: 'high_01', title: 'High scenario', priority: 'high' }),
        ]),
      });

      const suite = await generator.generateSuiteForFlow(makeUserFlow());
      expect(suite.priority).toBe('high');
    });
  });
});
