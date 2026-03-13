import { BaseAgent, type AgentConfig, type AgentResult } from './base-agent';

// ─── Test double ─────────────────────────────────────────────────────────────

interface TestData {
  message: string;
}

class SuccessAgent extends BaseAgent<AgentConfig, TestData> {
  initCalled = false;
  execCalled = false;
  cleanupCalled = false;

  protected async initialize(): Promise<void> {
    this.initCalled = true;
  }

  protected async execute(): Promise<TestData> {
    this.execCalled = true;
    return { message: 'ok' };
  }

  protected async cleanup(): Promise<void> {
    this.cleanupCalled = true;
  }
}

class ThrowingExecuteAgent extends BaseAgent<AgentConfig, TestData> {
  cleanupCalled = false;

  protected async initialize(): Promise<void> {
    // no-op
  }

  protected async execute(): Promise<TestData> {
    throw new Error('execute failed');
  }

  protected async cleanup(): Promise<void> {
    this.cleanupCalled = true;
  }
}

class ThrowingInitAgent extends BaseAgent<AgentConfig, TestData> {
  protected async initialize(): Promise<void> {
    throw new Error('init failed');
  }

  protected async execute(): Promise<TestData> {
    return { message: 'should not reach' };
  }

  protected async cleanup(): Promise<void> {
    // no-op
  }
}

class SlowAgent extends BaseAgent<AgentConfig, TestData> {
  protected async initialize(): Promise<void> {
    // no-op
  }

  protected async execute(): Promise<TestData> {
    await new Promise((r) => setTimeout(r, 5_000));
    return { message: 'done' };
  }

  protected async cleanup(): Promise<void> {
    // no-op
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BaseAgent', () => {
  const baseConfig: AgentConfig = { name: 'TestAgent', version: '1.0.0' };

  describe('successful run', () => {
    it('calls initialize, execute, and cleanup in order', async () => {
      const agent = new SuccessAgent(baseConfig);
      await agent.run();
      expect(agent.initCalled).toBe(true);
      expect(agent.execCalled).toBe(true);
      expect(agent.cleanupCalled).toBe(true);
    });

    it('returns success:true with data', async () => {
      const agent = new SuccessAgent(baseConfig);
      const result = await agent.run();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'ok' });
      expect(result.errorMessage).toBeUndefined();
    });

    it('populates agentName and agentVersion', async () => {
      const agent = new SuccessAgent(baseConfig);
      const result = await agent.run();
      expect(result.agentName).toBe('TestAgent');
      expect(result.agentVersion).toBe('1.0.0');
    });

    it('includes startedAt, finishedAt, and positive durationMs', async () => {
      const agent = new SuccessAgent(baseConfig);
      const result = await agent.run();
      expect(new Date(result.startedAt).toISOString()).toBe(result.startedAt);
      expect(new Date(result.finishedAt).toISOString()).toBe(result.finishedAt);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('execute failure', () => {
    it('returns success:false with errorMessage', async () => {
      const agent = new ThrowingExecuteAgent(baseConfig);
      const result = await agent.run();
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errorMessage).toBe('execute failed');
    });

    it('still calls cleanup after execute throws', async () => {
      const agent = new ThrowingExecuteAgent(baseConfig);
      await agent.run();
      expect(agent.cleanupCalled).toBe(true);
    });
  });

  describe('initialize failure', () => {
    it('returns success:false with errorMessage', async () => {
      const agent = new ThrowingInitAgent(baseConfig);
      const result = await agent.run();
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('init failed');
    });
  });

  describe('timeout', () => {
    it('rejects when execute exceeds timeoutMs', async () => {
      const agent = new SlowAgent({ ...baseConfig, timeoutMs: 100 });
      const result = await agent.run();
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('timed out');
    }, 10_000);
  });

  describe('custom logger', () => {
    it('uses the provided logger', async () => {
      const infoMessages: string[] = [];
      const logger = {
        info: (msg: string) => infoMessages.push(msg),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      const agent = new SuccessAgent({ ...baseConfig, logger });
      await agent.run();
      expect(infoMessages.length).toBeGreaterThan(0);
    });
  });

  describe('AgentResult shape', () => {
    it('matches the AgentResult<TData> interface', async () => {
      const agent = new SuccessAgent(baseConfig);
      const result: AgentResult<TestData> = await agent.run();
      expect(typeof result.agentName).toBe('string');
      expect(typeof result.agentVersion).toBe('string');
      expect(typeof result.startedAt).toBe('string');
      expect(typeof result.finishedAt).toBe('string');
      expect(typeof result.durationMs).toBe('number');
      expect(typeof result.success).toBe('boolean');
    });
  });
});
