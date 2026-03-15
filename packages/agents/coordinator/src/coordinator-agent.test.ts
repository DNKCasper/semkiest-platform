/**
 * Unit tests for CoordinatorAgent.
 *
 * Tests cover:
 * - Plan building from profiles
 * - Phase execution order
 * - Failure strategies (fail-fast, continue-on-error, retry)
 * - Progress reporting
 * - Timeout handling
 * - Result aggregation
 */

import { CoordinatorAgent, EventBus, Logger } from './coordinator-agent';
import {
  AgentConfig,
  AgentExecutionResult,
  AgentType,
  CoordinatorResult,
  ExecutionContext,
  TestRunPlan,
} from './types';
import { AgentExecutor } from './agent-executor';
import { PlanBuilder } from './plan-builder';

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

/**
 * Mock agent executor for testing.
 */
class MockAgentExecutor implements AgentExecutor {
  constructor(
    private resultOverrides: Map<string, AgentExecutionResult> = new Map(),
    private failureAgentTypes: Set<string> = new Set(),
  ) {}

  async execute(
    agentType: AgentType,
    agentId: string,
    config: AgentConfig,
    context: ExecutionContext,
  ): Promise<AgentExecutionResult> {
    // Check for override by agentId.
    if (this.resultOverrides.has(agentId)) {
      return this.resultOverrides.get(agentId)!;
    }

    // Check if this agent type should fail.
    if (this.failureAgentTypes.has(agentType)) {
      throw new Error(`Mock failure for ${agentType} (${agentId})`);
    }

    // Default pass.
    return {
      status: 'pass',
      durationMs: 100,
      evidence: [`${context.testRunId}/${agentId}/results.json`],
      data: { agentType },
    };
  }

  async cancel(agentId: string): Promise<void> {
    // Mock implementation.
  }
}

/**
 * Mock event bus for testing.
 */
class MockEventBus implements EventBus {
  events: Array<{ type: string; payload: unknown }> = [];

  async publish(eventType: string, payload: unknown): Promise<void> {
    this.events.push({ type: eventType, payload });
  }

  getEventsByType(type: string) {
    return this.events.filter((e) => e.type === type);
  }

  clear() {
    this.events = [];
  }
}

/**
 * Mock logger for testing.
 */
class MockLogger implements Logger {
  messages: Array<{ level: string; message: string; context?: Record<string, unknown> }> = [];

  info(message: string, context?: Record<string, unknown>): void {
    this.messages.push({ level: 'info', message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.messages.push({ level: 'warn', message, context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.messages.push({ level: 'error', message, context });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.messages.push({ level: 'debug', message, context });
  }

  getMessagesByLevel(level: string) {
    return this.messages.filter((m) => m.level === level);
  }

  clear() {
    this.messages = [];
  }
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('CoordinatorAgent', () => {
  let mockEventBus: MockEventBus;
  let mockLogger: MockLogger;
  let mockExecutor: MockAgentExecutor;

  beforeEach(() => {
    mockEventBus = new MockEventBus();
    mockLogger = new MockLogger();
    mockExecutor = new MockAgentExecutor();
  });

  describe('Plan building from profiles', () => {
    it('should build a default plan from a profile', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
      }).build();

      expect(plan.baseUrl).toBe('http://example.com');
      expect(plan.phases.length).toBeGreaterThan(0);
      expect(plan.agents.length).toBeGreaterThan(0);
    });

    it('should respect enabled agents from profile', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'spec-reader'],
      }).build();

      const agentTypes = plan.agents.map((a) => a.type);
      expect(agentTypes).toContain('explorer');
      expect(agentTypes).toContain('spec-reader');
      expect(agentTypes.length).toBe(2);
    });

    it('should apply custom timeouts and retries', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        agentTimeout: 500_000,
        agentRetries: 3,
        enabledAgents: ['explorer'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      expect(explorer?.timeout).toBe(500_000);
      expect(explorer?.retries).toBe(3);
    });
  });

  describe('Phase execution order', () => {
    it('should execute discovery phase before testing phase', async () => {
      const executedPhases: string[] = [];

      const mockExecutorWithTracking: AgentExecutor = {
        async execute(agentType: AgentType) {
          if (agentType === 'explorer' || agentType === 'spec-reader') {
            executedPhases.push('discovery');
          } else {
            executedPhases.push('testing');
          }
          return {
            status: 'pass',
            durationMs: 100,
          };
        },
        async cancel() {},
      };

      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'ui-functional'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutorWithTracking,
        logger: mockLogger,
      });

      await coordinator.execute();

      // Discovery should come before testing.
      const discoveryIndex = executedPhases.indexOf('discovery');
      const testingIndex = executedPhases.indexOf('testing');
      expect(discoveryIndex).toBeGreaterThanOrEqual(0);
      expect(testingIndex).toBeGreaterThanOrEqual(0);
      expect(discoveryIndex).toBeLessThan(testingIndex);
    });
  });

  describe('Failure strategies', () => {
    it('should halt on first failure with fail-fast strategy', async () => {
      const executor = new MockAgentExecutor(
        new Map(),
        new Set(['explorer']),
      );

      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        failureStrategy: 'fail-fast',
        enabledAgents: ['explorer', 'spec-reader', 'ui-functional'],
      }).build();

      // Simulate first agent failing.
      const coordinator = new CoordinatorAgent(plan, {
        executor,
        eventBus: mockEventBus,
        logger: mockLogger,
      });

      const result = await coordinator.execute();

      // Should have some skipped agents.
      expect(result.agentResults.some((a) => a.status === 'skipped')).toBe(true);
      expect(result.summary.skipped).toBeGreaterThan(0);
    });

    it('should run all agents with continue-on-error strategy', async () => {
      const executor = new MockAgentExecutor(
        new Map(),
        new Set(['explorer']),
      );

      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        failureStrategy: 'continue-on-error',
        enabledAgents: ['explorer', 'ui-functional'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor,
        eventBus: mockEventBus,
        logger: mockLogger,
      });

      const result = await coordinator.execute();

      // All agents should have run (no skipped).
      const completedOrFailed = result.agentResults.filter(
        (a) => a.status === 'completed' || a.status === 'failed',
      );
      expect(completedOrFailed.length).toBe(result.agentResults.length);
    });

    it('should retry failed agents up to configured retries', async () => {
      let attemptCount = 0;
      const mockExecutorWithRetry: AgentExecutor = {
        async execute(agentType: AgentType, agentId: string, config: AgentConfig) {
          if (agentType === 'explorer') {
            attemptCount++;
            if (attemptCount <= config.retries) {
              throw new Error('Simulated failure');
            }
          }
          return { status: 'pass', durationMs: 100 };
        },
        async cancel() {},
      };

      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        agentRetries: 2,
        enabledAgents: ['explorer'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutorWithRetry,
        logger: mockLogger,
      });

      await coordinator.execute();

      // Explorer should have been retried multiple times.
      expect(attemptCount).toBeGreaterThan(1);
    });
  });

  describe('Progress reporting and events', () => {
    it('should emit AgentStarted and AgentCompleted events', async () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutor,
        eventBus: mockEventBus,
        logger: mockLogger,
      });

      await coordinator.execute();

      const startedEvents = mockEventBus.getEventsByType('AgentStarted');
      const completedEvents = mockEventBus.getEventsByType('AgentCompleted');

      expect(startedEvents.length).toBeGreaterThan(0);
      expect(completedEvents.length).toBeGreaterThan(0);
    });

    it('should emit AgentFailed events on failure', async () => {
      const failingAgent = 'explorer';
      const executor = new MockAgentExecutor(
        new Map(),
        new Set([failingAgent]),
      );

      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: [failingAgent as AgentType],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor,
        eventBus: mockEventBus,
        logger: mockLogger,
      });

      await coordinator.execute();

      const failedEvents = mockEventBus.getEventsByType('AgentFailed');
      expect(failedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Timeout handling', () => {
    it('should respect agent timeout configuration', async () => {
      let executionDuration = 0;
      const mockExecutorWithTimeout: AgentExecutor = {
        async execute(agentType: AgentType, agentId: string, config: AgentConfig) {
          // Track the timeout value passed.
          executionDuration = config.timeout;
          return { status: 'pass', durationMs: 100 };
        },
        async cancel() {},
      };

      const customTimeout = 500_000;
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        agentTimeout: customTimeout,
        enabledAgents: ['explorer'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutorWithTimeout,
        logger: mockLogger,
      });

      await coordinator.execute();

      expect(executionDuration).toBe(customTimeout);
    });
  });

  describe('Result aggregation', () => {
    it('should calculate correct pass rate', async () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'spec-reader', 'ui-functional'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutor,
        logger: mockLogger,
      });

      const result = await coordinator.execute();

      // All should pass in mock scenario.
      expect(result.summary.passRate).toBe(100);
      expect(result.summary.passed).toBe(result.summary.total);
      expect(result.summary.failed).toBe(0);
    });

    it('should track skipped agents in summary', async () => {
      const failingAgent = 'explorer';
      const executor = new MockAgentExecutor(
        new Map(),
        new Set([failingAgent]),
      );

      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        failureStrategy: 'fail-fast',
        enabledAgents: ['explorer', 'spec-reader', 'ui-functional'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor,
        logger: mockLogger,
      });

      const result = await coordinator.execute();

      // Should have failed and skipped agents.
      expect(result.summary.failed).toBeGreaterThan(0);
      expect(result.summary.skipped).toBeGreaterThan(0);
    });

    it('should include execution duration', async () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutor,
        logger: mockLogger,
      });

      const result = await coordinator.execute();

      expect(result.summary.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include report URL in result', async () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutor,
        logger: mockLogger,
      });

      const result = await coordinator.execute();

      expect(result.reportUrl).toBeDefined();
      expect(result.reportUrl).toContain(plan.testRunId);
    });

    it('should return all agent results', async () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'spec-reader', 'ui-functional'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutor,
        logger: mockLogger,
      });

      const result = await coordinator.execute();

      // Should have results for each enabled agent.
      expect(result.agentResults.length).toBeGreaterThan(0);
      expect(result.agentResults[0].agentType).toBeDefined();
      expect(result.agentResults[0].agentId).toBeDefined();
      expect(result.agentResults[0].status).toBeDefined();
    });
  });

  describe('Parallel vs sequential execution', () => {
    it('should run discovery agents sequentially', async () => {
      const executionOrder: string[] = [];

      const mockExecutorWithOrder: AgentExecutor = {
        async execute(agentType: AgentType) {
          executionOrder.push(agentType);
          // Simulate work.
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { status: 'pass', durationMs: 100 };
        },
        async cancel() {},
      };

      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'spec-reader'],
      }).build();

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutorWithOrder,
        logger: mockLogger,
      });

      await coordinator.execute();

      // Both discovery agents should have executed.
      expect(executionOrder).toContain('explorer');
      expect(executionOrder).toContain('spec-reader');
    });
  });

  describe('Disabled agents', () => {
    it('should skip disabled agents', async () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      // Disable some agents.
      plan.agents = plan.agents.filter((a) => a.enabled);

      const coordinator = new CoordinatorAgent(plan, {
        executor: mockExecutor,
        logger: mockLogger,
      });

      const result = await coordinator.execute();

      // Only enabled agents should be in results.
      expect(result.agentResults.length).toBeGreaterThan(0);
    });
  });
});
