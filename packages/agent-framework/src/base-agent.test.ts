import { BaseAgent } from './base-agent';
import { AgentContext, Logger } from './context';
import { AgentResult, AgentState, ErrorReport, HeartbeatInfo, ProgressUpdate } from './types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function makeContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    projectConfig: { projectId: 'proj-1', name: 'Test Project' },
    testProfile: { profileId: 'profile-1', name: 'Default', settings: {} },
    llmClient: { complete: jest.fn().mockResolvedValue('ok') },
    storageClient: {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    logger: makeLogger(),
    ...overrides,
  };
}

/**
 * Concrete agent for testing that records the order lifecycle hooks were called.
 */
class RecordingAgent extends BaseAgent<{ answer: number }> {
  readonly calls: string[] = [];

  override async initialize(): Promise<void> {
    this.calls.push('initialize');
  }

  override async execute(): Promise<void> {
    this.calls.push('execute');
    this.reportProgress('halfway there', 50);
    this.reportResult('pass', { answer: 42 });
  }

  override async cleanup(): Promise<void> {
    this.calls.push('cleanup');
  }

  override async onError(error: Error): Promise<void> {
    this.calls.push(`onError:${error.message}`);
  }
}

/** Agent whose execute() throws an error. */
class ThrowingAgent extends BaseAgent {
  readonly calls: string[] = [];

  override async initialize(): Promise<void> {
    this.calls.push('initialize');
  }

  override async execute(): Promise<void> {
    this.calls.push('execute');
    throw new Error('boom');
  }

  override async cleanup(): Promise<void> {
    this.calls.push('cleanup');
  }

  override async onError(error: Error): Promise<void> {
    this.calls.push(`onError:${error.message}`);
  }
}

/** Agent whose initialize() throws an error. */
class InitFailAgent extends BaseAgent {
  readonly calls: string[] = [];

  override async initialize(): Promise<void> {
    this.calls.push('initialize');
    throw new Error('init-failed');
  }

  override async execute(): Promise<void> {
    this.calls.push('execute');
  }

  override async cleanup(): Promise<void> {
    this.calls.push('cleanup');
  }

  override async onError(error: Error): Promise<void> {
    this.calls.push(`onError:${error.message}`);
  }
}

/** Agent that does nothing (default pass result). */
class NoOpAgent extends BaseAgent {
  override async initialize(): Promise<void> {}
  override async execute(): Promise<void> {}
  override async cleanup(): Promise<void> {}
  override async onError(_error: Error): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaseAgent', () => {
  describe('abstract enforcement', () => {
    it('cannot be instantiated directly (TypeScript compile-time only)', () => {
      // BaseAgent is abstract; this test documents the intent.
      // The TypeScript compiler prevents direct instantiation.
      expect(typeof BaseAgent).toBe('function');
    });

    it('can be instantiated through a concrete subclass', () => {
      const agent = new RecordingAgent('agent-1', makeContext());
      expect(agent).toBeInstanceOf(BaseAgent);
    });
  });

  describe('initial state', () => {
    it('starts in IDLE state', () => {
      const agent = new RecordingAgent('agent-1', makeContext());
      expect(agent.getState()).toBe(AgentState.IDLE);
    });

    it('exposes agentId', () => {
      const agent = new RecordingAgent('my-agent', makeContext());
      expect(agent.agentId).toBe('my-agent');
    });
  });

  describe('lifecycle hook order', () => {
    it('calls hooks in order: initialize → execute → cleanup', async () => {
      const agent = new RecordingAgent('agent-1', makeContext());
      await agent.run();
      expect(agent.calls).toEqual(['initialize', 'execute', 'cleanup']);
    });

    it('transitions through correct states', async () => {
      const states: AgentState[] = [];
      const ctx = makeContext();
      const agent = new RecordingAgent('agent-1', ctx);

      // Capture states at each hook
      const origInit = agent['initialize'].bind(agent);
      agent['initialize'] = async () => {
        states.push(agent.getState());
        return origInit();
      };

      await agent.run();
      expect(states[0]).toBe(AgentState.INITIALIZING);
      expect(agent.getState()).toBe(AgentState.COMPLETED);
    });

    it('is in RUNNING state during execute', async () => {
      let stateInExecute: AgentState | null = null;
      class StateCapturingAgent extends BaseAgent {
        override async initialize(): Promise<void> {}
        override async execute(): Promise<void> {
          stateInExecute = this.getState();
        }
        override async cleanup(): Promise<void> {}
        override async onError(_err: Error): Promise<void> {}
      }
      const agent = new StateCapturingAgent('agent-1', makeContext());
      await agent.run();
      expect(stateInExecute).toBe(AgentState.RUNNING);
    });
  });

  describe('successful run', () => {
    it('returns a pass result when reportResult is called in execute', async () => {
      const agent = new RecordingAgent('agent-1', makeContext());
      const result = await agent.run();
      expect(result.status).toBe('pass');
      expect(result.data).toEqual({ answer: 42 });
      expect(result.agentId).toBe('agent-1');
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('returns a default pass result when reportResult is NOT called', async () => {
      const agent = new NoOpAgent('agent-1', makeContext());
      const result = await agent.run();
      expect(result.status).toBe('pass');
      expect(result.agentId).toBe('agent-1');
    });

    it('ends in COMPLETED state', async () => {
      const agent = new RecordingAgent('agent-1', makeContext());
      await agent.run();
      expect(agent.getState()).toBe(AgentState.COMPLETED);
    });

    it('calls cleanup even on success', async () => {
      const agent = new RecordingAgent('agent-1', makeContext());
      await agent.run();
      expect(agent.calls).toContain('cleanup');
    });
  });

  describe('error handling', () => {
    it('calls onError with the thrown error', async () => {
      const agent = new ThrowingAgent('agent-1', makeContext());
      await agent.run();
      expect(agent.calls).toContain('onError:boom');
    });

    it('calls cleanup after an error', async () => {
      const agent = new ThrowingAgent('agent-1', makeContext());
      await agent.run();
      expect(agent.calls).toContain('cleanup');
    });

    it('returns a fail result when execute throws', async () => {
      const agent = new ThrowingAgent('agent-1', makeContext());
      const result = await agent.run();
      expect(result.status).toBe('fail');
      expect(result.error?.message).toBe('boom');
    });

    it('ends in FAILED state when execute throws', async () => {
      const agent = new ThrowingAgent('agent-1', makeContext());
      await agent.run();
      expect(agent.getState()).toBe(AgentState.FAILED);
    });

    it('handles failure in initialize', async () => {
      const agent = new InitFailAgent('agent-1', makeContext());
      const result = await agent.run();
      expect(result.status).toBe('fail');
      expect(result.error?.message).toBe('init-failed');
      expect(agent.calls).toContain('onError:init-failed');
      expect(agent.calls).toContain('cleanup');
      expect(agent.calls).not.toContain('execute');
    });

    it('hooks are called in order even on error: initialize → onError → cleanup', async () => {
      const agent = new InitFailAgent('agent-1', makeContext());
      await agent.run();
      expect(agent.calls).toEqual(['initialize', 'onError:init-failed', 'cleanup']);
    });

    it('emits an error report via onErrorReported', async () => {
      const agent = new ThrowingAgent('agent-1', makeContext());
      const reports: ErrorReport[] = [];
      agent.onErrorReported = (r) => reports.push(r);
      await agent.run();
      expect(reports).toHaveLength(1);
      expect(reports[0].error.message).toBe('boom');
      expect(reports[0].agentId).toBe('agent-1');
    });
  });

  describe('reportProgress', () => {
    it('emits progress updates to onProgressReported', async () => {
      const agent = new RecordingAgent('agent-1', makeContext());
      const updates: ProgressUpdate[] = [];
      agent.onProgressReported = (u) => updates.push(u);
      await agent.run();
      expect(updates).toHaveLength(1);
      expect(updates[0].message).toBe('halfway there');
      expect(updates[0].progress).toBe(50);
      expect(updates[0].agentId).toBe('agent-1');
      expect(updates[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('reportResult', () => {
    it('emits result to onResultReported', async () => {
      const agent = new RecordingAgent('agent-1', makeContext());
      const results: AgentResult<{ answer: number }>[] = [];
      agent.onResultReported = (r) => results.push(r);
      await agent.run();
      // RecordingAgent calls reportResult, so we expect exactly one emission.
      expect(results).toHaveLength(1);
      expect(results[0].data).toEqual({ answer: 42 });
    });

    it('supports all ResultStatus values', async () => {
      const statuses = ['pass', 'fail', 'warning', 'skip'] as const;
      for (const status of statuses) {
        class StatusAgent extends BaseAgent {
          override async initialize(): Promise<void> {}
          override async execute(): Promise<void> {
            this.reportResult(status);
          }
          override async cleanup(): Promise<void> {}
          override async onError(_err: Error): Promise<void> {}
        }
        const agent = new StatusAgent('agent-1', makeContext());
        const result = await agent.run();
        expect(result.status).toBe(status);
      }
    });
  });

  describe('heartbeat', () => {
    it('emits heartbeats at the configured interval', async () => {
      jest.useFakeTimers();
      const beats: HeartbeatInfo[] = [];

      class SlowAgent extends BaseAgent {
        override async initialize(): Promise<void> {}
        override async execute(): Promise<void> {
          // Advance timers inside execute to trigger heartbeats
          jest.advanceTimersByTime(200);
        }
        override async cleanup(): Promise<void> {}
        override async onError(_err: Error): Promise<void> {}
      }

      const agent = new SlowAgent('agent-1', makeContext(), { heartbeatIntervalMs: 50 });
      agent.onHeartbeat = (info) => beats.push(info);
      await agent.run();
      jest.useRealTimers();

      expect(beats.length).toBeGreaterThanOrEqual(1);
      expect(beats[0].agentId).toBe('agent-1');
      expect(beats[0].lastHeartbeat).toBeInstanceOf(Date);
    });

    it('getHeartbeatInfo returns correct shape', () => {
      const agent = new NoOpAgent('agent-1', makeContext());
      const info = agent.getHeartbeatInfo();
      expect(info.agentId).toBe('agent-1');
      expect(info.state).toBe(AgentState.IDLE);
      expect(info.lastHeartbeat).toBeInstanceOf(Date);
    });
  });

  describe('cancel', () => {
    it('transitions to CANCELLED when called on an IDLE agent', async () => {
      const agent = new NoOpAgent('agent-1', makeContext());
      await agent.cancel();
      expect(agent.getState()).toBe(AgentState.CANCELLED);
    });

    it('does nothing when agent is already in a terminal state', async () => {
      const agent = new NoOpAgent('agent-1', makeContext());
      await agent.run(); // COMPLETED
      await agent.cancel(); // Should not throw
      expect(agent.getState()).toBe(AgentState.COMPLETED);
    });
  });
});
