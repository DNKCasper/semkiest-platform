/**
 * PlanBuilder — fluent API for constructing TestRunPlan from test profiles.
 *
 * Maps test profile settings to enabled agents, arranges them into phases,
 * and provides sensible defaults for timeouts and retries.
 */

import { randomUUID } from 'crypto';
import {
  AgentConfig,
  AgentType,
  FailureStrategy,
  PhaseConfig,
  TestRunPlan,
} from './types';

/**
 * Minimal test profile interface that PlanBuilder consumes.
 */
export interface TestProfile {
  /** Base URL of the application under test. */
  baseUrl: string;
  /** Agents to run. Defaults to all if not specified. */
  enabledAgents?: AgentType[];
  /** Timeout for the entire run (ms). Defaults to 600000 (10 minutes). */
  globalTimeout?: number;
  /** Failure handling strategy. Defaults to 'continue-on-error'. */
  failureStrategy?: FailureStrategy;
  /** Timeout per agent (ms). Defaults to 300000 (5 minutes). */
  agentTimeout?: number;
  /** Retries per agent on failure. Defaults to 0. */
  agentRetries?: number;
  /** Custom agent-specific settings. */
  agentSettings?: Record<AgentType, Record<string, unknown>>;
}

/**
 * Fluent builder for constructing TestRunPlan.
 */
export class PlanBuilder {
  private testRunId: string;
  private projectId: string;
  private correlationId: string;
  private baseUrl: string;
  private enabledAgents: AgentType[] = [];
  private globalTimeout: number = 600_000; // 10 minutes
  private failureStrategy: FailureStrategy = 'continue-on-error';
  private agentTimeout: number = 300_000; // 5 minutes
  private agentRetries: number = 0;
  private agentSettings: Partial<Record<AgentType, Record<string, unknown>>> = {};

  /**
   * Create a PlanBuilder from a test profile.
   * Uses sensible defaults and allows further customization via builder methods.
   */
  static fromProfile(profile: TestProfile): PlanBuilder {
    const builder = new PlanBuilder();
    builder.baseUrl = profile.baseUrl;
    builder.enabledAgents = profile.enabledAgents || PlanBuilder.defaultAgents();
    builder.globalTimeout = profile.globalTimeout ?? 600_000;
    builder.failureStrategy = profile.failureStrategy ?? 'continue-on-error';
    builder.agentTimeout = profile.agentTimeout ?? 300_000;
    builder.agentRetries = profile.agentRetries ?? 0;
    builder.agentSettings = (profile.agentSettings || {}) as Partial<Record<AgentType, Record<string, unknown>>>;
    return builder;
  }

  /**
   * Create a new blank PlanBuilder.
   */
  constructor() {
    this.testRunId = `test-run-${randomUUID()}`;
    this.projectId = 'default-project';
    this.correlationId = randomUUID();
    this.baseUrl = 'http://localhost:3000';
  }

  /**
   * Set the base URL.
   */
  withBaseUrl(url: string): PlanBuilder {
    this.baseUrl = url;
    return this;
  }

  /**
   * Set the test run ID.
   */
  withTestRunId(id: string): PlanBuilder {
    this.testRunId = id;
    return this;
  }

  /**
   * Set the project ID.
   */
  withProjectId(id: string): PlanBuilder {
    this.projectId = id;
    return this;
  }

  /**
   * Set the correlation ID.
   */
  withCorrelationId(id: string): PlanBuilder {
    this.correlationId = id;
    return this;
  }

  /**
   * Set which agents to enable.
   */
  withAgents(agents: AgentType[]): PlanBuilder {
    this.enabledAgents = agents;
    return this;
  }

  /**
   * Set the global timeout for the entire run.
   */
  withGlobalTimeout(ms: number): PlanBuilder {
    this.globalTimeout = ms;
    return this;
  }

  /**
   * Set the failure strategy.
   */
  withFailureStrategy(strategy: FailureStrategy): PlanBuilder {
    this.failureStrategy = strategy;
    return this;
  }

  /**
   * Set the default timeout per agent.
   */
  withAgentTimeout(ms: number): PlanBuilder {
    this.agentTimeout = ms;
    return this;
  }

  /**
   * Set the default retry count per agent.
   */
  withAgentRetries(count: number): PlanBuilder {
    this.agentRetries = count;
    return this;
  }

  /**
   * Set agent-specific settings.
   */
  withAgentSettings(settings: Record<AgentType, Record<string, unknown>>): PlanBuilder {
    this.agentSettings = settings;
    return this;
  }

  /**
   * Build the final TestRunPlan.
   */
  build(): TestRunPlan {
    const agentConfigs = this.buildAgentConfigs();
    const phases = this.buildPhases(agentConfigs);

    return {
      testRunId: this.testRunId,
      projectId: this.projectId,
      correlationId: this.correlationId,
      baseUrl: this.baseUrl,
      phases,
      failureStrategy: this.failureStrategy,
      globalTimeout: this.globalTimeout,
      agents: agentConfigs,
    };
  }

  /**
   * Build AgentConfig array from enabled agents.
   */
  private buildAgentConfigs(): AgentConfig[] {
    const agentsToRun = this.enabledAgents.length > 0
      ? this.enabledAgents
      : PlanBuilder.defaultAgents();

    return agentsToRun.map((type) => ({
      type,
      enabled: true,
      priority: this.getPriorityForAgent(type),
      timeout: this.agentTimeout,
      retries: this.agentRetries,
      settings: this.agentSettings[type] || {},
    }));
  }

  /**
   * Organize agents into phases based on type.
   */
  private buildPhases(agents: AgentConfig[]): PhaseConfig[] {
    const phases: PhaseConfig[] = [];

    // Discovery phase: explorer and spec-reader (sequential to preserve order)
    const discoveryAgents = agents
      .filter((a) => a.enabled && ['explorer', 'spec-reader'].includes(a.type))
      .map((a) => a.type);
    if (discoveryAgents.length > 0) {
      phases.push({
        phase: 'discovery',
        agents: discoveryAgents as AgentType[],
        parallel: false,
      });
    }

    // Generation phase: data-generator (sequential)
    const generationAgents = agents
      .filter((a) => a.enabled && a.type === 'data-generator')
      .map((a) => a.type);
    if (generationAgents.length > 0) {
      phases.push({
        phase: 'generation',
        agents: generationAgents as AgentType[],
        parallel: false,
      });
    }

    // Testing phase: all test agents in parallel
    const testingAgents = agents
      .filter(
        (a) =>
          a.enabled &&
          ![
            'explorer',
            'spec-reader',
            'data-generator',
          ].includes(a.type),
      )
      .map((a) => a.type);
    if (testingAgents.length > 0) {
      phases.push({
        phase: 'testing',
        agents: testingAgents as AgentType[],
        parallel: true,
      });
    }

    // Reporting phase (empty for now; coordinator adds this if needed)
    phases.push({
      phase: 'reporting',
      agents: [],
      parallel: false,
    });

    return phases;
  }

  /**
   * Determine execution priority for an agent type.
   */
  private getPriorityForAgent(type: AgentType): number {
    const priorityMap: Record<AgentType, number> = {
      explorer: 100,
      'spec-reader': 90,
      'data-generator': 80,
      'ui-functional': 50,
      'visual-regression': 40,
      accessibility: 40,
      'cross-browser': 40,
      load: 30,
      security: 30,
      performance: 30,
      api: 50,
    };
    return priorityMap[type] || 50;
  }

  /**
   * Default list of all agent types if none specified.
   */
  private static defaultAgents(): AgentType[] {
    return [
      'explorer',
      'spec-reader',
      'ui-functional',
      'visual-regression',
      'accessibility',
      'cross-browser',
      'security',
      'api',
    ];
  }
}
