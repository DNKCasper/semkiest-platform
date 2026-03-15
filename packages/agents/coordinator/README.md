# @semkiest/coordinator

The Coordinator Agent — critical orchestrator that sequences multiple testing agents into a single test run.

## Overview

The Coordinator Agent manages the complete lifecycle of a multi-agent test run:

- **Planning**: Accepts a test run configuration specifying which agents to run and in what order
- **Execution**: Runs agents in phases (discover/spec-read first, then test agents in parallel, then reporting)
- **Progress Tracking**: Emits events via EventBus for real-time dashboard updates
- **Failure Handling**: Supports configurable failure strategies (fail-fast, continue-on-error, retry)
- **Result Aggregation**: Produces a final result with comprehensive statistics and summaries

## Architecture

### Core Components

#### Types (`src/types.ts`)

Defines all type definitions for the coordinator system:

- **AgentType**: All known agent types (explorer, spec-reader, ui-functional, visual-regression, accessibility, cross-browser, load, security, data-generator, performance, api)
- **ExecutionPhase**: Logical phases of a test run (discovery, generation, testing, reporting)
- **FailureStrategy**: How to handle agent failures (fail-fast, continue-on-error, retry-then-continue)
- **TestRunPlan**: Complete orchestration plan with agents, phases, and configuration
- **CoordinatorResult**: Final result with aggregated statistics

#### PlanBuilder (`src/plan-builder.ts`)

Fluent API for constructing a TestRunPlan from a test profile:

```typescript
const plan = PlanBuilder.fromProfile({
  baseUrl: 'http://example.com',
  enabledAgents: ['explorer', 'ui-functional'],
  globalTimeout: 600_000,
  agentTimeout: 300_000,
  agentRetries: 2,
  failureStrategy: 'continue-on-error'
})
  .withBaseUrl('http://updated.com')
  .withGlobalTimeout(800_000)
  .build();
```

Features:
- Maps test profile settings to enabled agents
- Arranges agents into phases automatically (discovery → generation → testing → reporting)
- Provides sensible defaults for all timeouts and retries
- Supports fluent API for easy customization

#### Agent Executors (`src/agent-executor.ts`)

Abstractions for how agents are actually executed:

- **AgentExecutor** (interface): Abstract interface for running agents
- **LocalAgentExecutor**: In-process executor with timeout support (suitable for testing and single-node setups)
- **QueueAgentExecutor**: Stub for BullMQ-based distributed execution (future implementation)

#### CoordinatorAgent (`src/coordinator-agent.ts`)

Main orchestrator class that:

- Accepts a TestRunPlan and optional EventBus/Logger
- Initializes agent tracking and execution state
- Executes phases sequentially, with agents either in parallel or sequentially per phase config
- Handles agent failures according to the configured strategy
- Emits AgentStarted, AgentProgress, AgentCompleted, AgentFailed events
- Aggregates results into a final CoordinatorResult with statistics

## Phase Execution Flow

1. **Discovery Phase** (sequential): explorer, spec-reader agents run one at a time to gather information
2. **Generation Phase** (sequential): data-generator agents prepare test data
3. **Testing Phase** (parallel): All test agents run concurrently (ui-functional, visual-regression, accessibility, cross-browser, load, security, performance, api)
4. **Reporting Phase**: Finalization and report generation

## Failure Strategies

- **fail-fast**: Stop execution immediately on first failure. Remaining agents are marked as skipped.
- **continue-on-error**: Run all agents regardless of failures. Record errors but continue.
- **retry-then-continue**: Retry failed agents up to the configured retry count, then continue with remaining agents.

## Usage Example

```typescript
import { PlanBuilder, CoordinatorAgent, LocalAgentExecutor } from '@semkiest/coordinator';

// 1. Build a test plan
const plan = PlanBuilder.fromProfile({
  baseUrl: 'http://myapp.example.com',
  enabledAgents: ['explorer', 'ui-functional', 'security'],
  globalTimeout: 600_000,
  agentRetries: 2,
  failureStrategy: 'continue-on-error'
}).build();

// 2. Create the coordinator
const coordinator = new CoordinatorAgent(plan, {
  executor: new LocalAgentExecutor(),
  logger: console,
  eventBus: {
    async publish(eventType, payload) {
      console.log(`Event: ${eventType}`, payload);
    }
  }
});

// 3. Execute the test run
const result = await coordinator.execute();

// 4. Check results
console.log(`Test run completed:`);
console.log(`  Total agents: ${result.summary.total}`);
console.log(`  Passed: ${result.summary.passed}`);
console.log(`  Failed: ${result.summary.failed}`);
console.log(`  Pass rate: ${result.summary.passRate}%`);
console.log(`  Duration: ${result.summary.duration}ms`);
```

## Event Flow

The coordinator publishes the following events via EventBus:

- **AgentStarted**: Emitted when an agent begins execution
- **AgentProgress**: Emitted periodically during agent execution (for agents that report progress)
- **AgentCompleted**: Emitted when an agent finishes successfully
- **AgentFailed**: Emitted when an agent fails

Example event payload:

```typescript
{
  type: 'AgentCompleted',
  payload: {
    agentId: 'ui-functional-abc123',
    agentType: 'ui-functional',
    testRunId: 'test-run-xyz',
    result: {
      status: 'pass',
      evidence: ['test-run-xyz/ui-functional-abc123/screenshot.png'],
      duration: 5230,
      summary: 'All UI tests passed'
    }
  },
  metadata: {
    correlationId: 'corr-123',
    timestamp: '2026-03-15T12:34:56Z',
    version: '1.0.0',
    source: 'coordinator'
  }
}
```

## Result Structure

The final CoordinatorResult includes:

```typescript
{
  testRunId: 'test-run-123',
  projectId: 'my-project',
  phases: [...],
  agentResults: [
    {
      agentType: 'ui-functional',
      agentId: 'ui-functional-abc123',
      phase: 'testing',
      status: 'completed',
      startedAt: Date,
      completedAt: Date,
      result: {
        status: 'pass',
        evidence: ['...'],
        durationMs: 5230,
        data: {...}
      },
      retryCount: 0
    },
    // ... more agent results
  ],
  summary: {
    total: 3,
    passed: 2,
    failed: 0,
    warnings: 1,
    skipped: 0,
    duration: 15000,
    passRate: 100
  },
  reportUrl: 'http://reports.local/test-run-123/index.html'
}
```

## Testing

Run the comprehensive test suite:

```bash
npm test
```

Tests cover:
- Plan building from profiles
- Phase execution order and parallelization
- Failure strategies (fail-fast, continue-on-error, retry)
- Progress reporting and event emission
- Timeout handling
- Result aggregation and statistics
- Agent prioritization

## Development

Build the package:

```bash
npm run build
```

Watch for changes:

```bash
npm run dev
```

Type check:

```bash
npm run typecheck
```

## Integration Points

The coordinator integrates with:

1. **Agent Framework**: Uses AgentContext, AgentResult types (from @semkiest/agent-framework)
2. **Worker Queue**: Via QueueAgentExecutor for BullMQ dispatch (future)
3. **EventBus**: Publishes test run events for dashboard/monitoring
4. **Test Profiles**: Accepts TestProfile configuration for test planning

## Future Enhancements

- Full BullMQ integration in QueueAgentExecutor
- Real BaseAgent extends (currently a standalone implementation)
- Advanced scheduling and resource allocation
- Dynamic agent pool sizing
- Test run persistence and replay
- Integration with reporting services
