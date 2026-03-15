/**
 * Unit tests for PlanBuilder.
 *
 * Tests cover:
 * - Building plans from test profiles
 * - Fluent API method chaining
 * - Phase arrangement (discovery, generation, testing, reporting)
 * - Default values and overrides
 * - Agent prioritization
 */

import { PlanBuilder, TestProfile } from './plan-builder';
import { AgentType } from './types';

describe('PlanBuilder', () => {
  describe('Building from profiles', () => {
    it('should create a builder from a minimal profile', () => {
      const profile: TestProfile = {
        baseUrl: 'http://example.com',
      };

      const plan = PlanBuilder.fromProfile(profile).build();

      expect(plan.baseUrl).toBe('http://example.com');
      expect(plan.testRunId).toBeDefined();
      expect(plan.projectId).toBeDefined();
      expect(plan.correlationId).toBeDefined();
    });

    it('should use default agents when not specified', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
      }).build();

      expect(plan.agents.length).toBeGreaterThan(0);
      // Should include common agents.
      expect(plan.agents.some((a) => a.type === 'explorer')).toBe(true);
      expect(plan.agents.some((a) => a.type === 'ui-functional')).toBe(true);
    });

    it('should use specified enabled agents', () => {
      const enabledAgents: AgentType[] = ['explorer', 'security'];
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents,
      }).build();

      const agentTypes = plan.agents.map((a) => a.type);
      expect(agentTypes).toEqual(expect.arrayContaining(['explorer', 'security']));
      expect(agentTypes.length).toBe(2);
    });

    it('should apply global timeout from profile', () => {
      const customTimeout = 1_200_000;
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        globalTimeout: customTimeout,
      }).build();

      expect(plan.globalTimeout).toBe(customTimeout);
    });

    it('should apply agent timeout from profile', () => {
      const customTimeout = 500_000;
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        agentTimeout: customTimeout,
        enabledAgents: ['explorer'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      expect(explorer?.timeout).toBe(customTimeout);
    });

    it('should apply retries from profile', () => {
      const retries = 3;
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        agentRetries: retries,
        enabledAgents: ['explorer'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      expect(explorer?.retries).toBe(retries);
    });

    it('should apply failure strategy from profile', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        failureStrategy: 'fail-fast',
      }).build();

      expect(plan.failureStrategy).toBe('fail-fast');
    });

    it('should apply agent-specific settings', () => {
      const agentSettings = {
        explorer: { headless: false, debugMode: true },
        'ui-functional': { slowMo: 50 },
      };

      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        agentSettings: agentSettings as any,
        enabledAgents: ['explorer', 'ui-functional'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      expect(explorer?.settings.headless).toBe(false);
      expect(explorer?.settings.debugMode).toBe(true);

      const uiFunc = plan.agents.find((a) => a.type === 'ui-functional');
      expect(uiFunc?.settings.slowMo).toBe(50);
    });
  });

  describe('Fluent API', () => {
    it('should support method chaining', () => {
      const plan = new PlanBuilder()
        .withBaseUrl('http://test.com')
        .withProjectId('my-project')
        .withTestRunId('test-123')
        .withAgents(['explorer', 'security'])
        .withGlobalTimeout(800_000)
        .withFailureStrategy('fail-fast')
        .withAgentTimeout(400_000)
        .withAgentRetries(2)
        .build();

      expect(plan.baseUrl).toBe('http://test.com');
      expect(plan.projectId).toBe('my-project');
      expect(plan.testRunId).toBe('test-123');
      expect(plan.failureStrategy).toBe('fail-fast');
      expect(plan.globalTimeout).toBe(800_000);
    });

    it('should allow withBaseUrl to override profile base URL', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
      })
        .withBaseUrl('http://override.com')
        .build();

      expect(plan.baseUrl).toBe('http://override.com');
    });

    it('should allow withAgents to override profile agents', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      })
        .withAgents(['security', 'load'])
        .build();

      const agentTypes = plan.agents.map((a) => a.type);
      expect(agentTypes).toEqual(expect.arrayContaining(['security', 'load']));
      expect(agentTypes.length).toBe(2);
    });

    it('should allow withGlobalTimeout to override profile timeout', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        globalTimeout: 600_000,
      })
        .withGlobalTimeout(1_200_000)
        .build();

      expect(plan.globalTimeout).toBe(1_200_000);
    });
  });

  describe('Phase arrangement', () => {
    it('should have discovery phase first', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'spec-reader', 'ui-functional'],
      }).build();

      const discoveryPhase = plan.phases.find((p) => p.phase === 'discovery');
      expect(discoveryPhase).toBeDefined();
      expect(discoveryPhase?.agents).toContain('explorer');
      expect(discoveryPhase?.agents).toContain('spec-reader');
    });

    it('should have testing phase after discovery', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'ui-functional'],
      }).build();

      const discoveryIndex = plan.phases.findIndex((p) => p.phase === 'discovery');
      const testingIndex = plan.phases.findIndex((p) => p.phase === 'testing');

      expect(discoveryIndex).toBeLessThan(testingIndex);
    });

    it('should mark discovery phase as sequential', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'spec-reader'],
      }).build();

      const discoveryPhase = plan.phases.find((p) => p.phase === 'discovery');
      expect(discoveryPhase?.parallel).toBe(false);
    });

    it('should mark testing phase as parallel', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'ui-functional', 'security'],
      }).build();

      const testingPhase = plan.phases.find((p) => p.phase === 'testing');
      expect(testingPhase?.parallel).toBe(true);
    });

    it('should include generation phase when data-generator is enabled', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'data-generator', 'ui-functional'],
      }).build();

      const generationPhase = plan.phases.find((p) => p.phase === 'generation');
      expect(generationPhase).toBeDefined();
      expect(generationPhase?.agents).toContain('data-generator');
    });

    it('should order phases correctly: discovery → generation → testing → reporting', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'data-generator', 'ui-functional'],
      }).build();

      const phaseTypes = plan.phases.map((p) => p.phase);
      expect(phaseTypes.indexOf('discovery')).toBeLessThan(
        phaseTypes.indexOf('generation'),
      );
      expect(phaseTypes.indexOf('generation')).toBeLessThan(
        phaseTypes.indexOf('testing'),
      );
      expect(phaseTypes.indexOf('testing')).toBeLessThan(
        phaseTypes.indexOf('reporting'),
      );
    });

    it('should skip empty phases', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      // Generation phase should not be present (no data-generator enabled).
      const generationPhase = plan.phases.find((p) => p.phase === 'generation');
      expect(generationPhase).toBeUndefined();
    });
  });

  describe('Agent prioritization', () => {
    it('should assign priority to each agent', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'ui-functional', 'security'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      const uiFunc = plan.agents.find((a) => a.type === 'ui-functional');
      const security = plan.agents.find((a) => a.type === 'security');

      expect(explorer?.priority).toBeDefined();
      expect(uiFunc?.priority).toBeDefined();
      expect(security?.priority).toBeDefined();
    });

    it('should assign higher priority to discovery agents', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer', 'ui-functional'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      const uiFunc = plan.agents.find((a) => a.type === 'ui-functional');

      expect(explorer!.priority).toBeGreaterThan(uiFunc!.priority);
    });
  });

  describe('Default values', () => {
    it('should use 10-minute global timeout by default', () => {
      const plan = new PlanBuilder().build();
      expect(plan.globalTimeout).toBe(600_000);
    });

    it('should use 5-minute agent timeout by default', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      expect(explorer?.timeout).toBe(300_000);
    });

    it('should use 0 retries by default', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      expect(explorer?.retries).toBe(0);
    });

    it('should use continue-on-error failure strategy by default', () => {
      const plan = new PlanBuilder().build();
      expect(plan.failureStrategy).toBe('continue-on-error');
    });

    it('should generate unique test run ID', () => {
      const plan1 = new PlanBuilder().build();
      const plan2 = new PlanBuilder().build();

      expect(plan1.testRunId).not.toBe(plan2.testRunId);
    });

    it('should generate unique correlation IDs', () => {
      const plan1 = new PlanBuilder().build();
      const plan2 = new PlanBuilder().build();

      expect(plan1.correlationId).not.toBe(plan2.correlationId);
    });
  });

  describe('Agent configuration', () => {
    it('should enable all agents by default', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      const allEnabled = plan.agents.every((a) => a.enabled);
      expect(allEnabled).toBe(true);
    });

    it('should have empty settings by default', () => {
      const plan = PlanBuilder.fromProfile({
        baseUrl: 'http://example.com',
        enabledAgents: ['explorer'],
      }).build();

      const explorer = plan.agents.find((a) => a.type === 'explorer');
      expect(explorer?.settings).toEqual({});
    });
  });
});
