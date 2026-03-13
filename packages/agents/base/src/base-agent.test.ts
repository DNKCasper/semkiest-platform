import { BaseAgent } from './base-agent';
import type { AgentConfig, AgentResult } from './types';

/** Minimal concrete subclass for testing BaseAgent behaviour. */
class TestAgent extends BaseAgent<AgentConfig, string> {
  public initCalled = false;
  public runCalled = false;
  public stopCalled = false;

  async initialize(): Promise<void> {
    this.initCalled = true;
    this.setStatus('initializing');
  }

  async run(): Promise<AgentResult<string>> {
    this.runCalled = true;
    this.setStatus('running');
    this.setStatus('stopped');
    return { success: true, data: 'done', duration: 0 };
  }

  async stop(): Promise<void> {
    this.stopCalled = true;
    this.setStatus('stopping');
    this.setStatus('stopped');
  }
}

describe('BaseAgent', () => {
  it('assigns a stable id at construction', () => {
    const agent = new TestAgent({ name: 'test' });
    expect(typeof agent.getId()).toBe('string');
    expect(agent.getId().length).toBeGreaterThan(0);
  });

  it('uses a provided id when given', () => {
    const agent = new TestAgent({ id: 'custom-id', name: 'test' });
    expect(agent.getId()).toBe('custom-id');
  });

  it('returns the configured name', () => {
    const agent = new TestAgent({ name: 'my-agent' });
    expect(agent.getName()).toBe('my-agent');
  });

  it('starts in idle status', () => {
    const agent = new TestAgent({ name: 'test' });
    expect(agent.getStatus()).toBe('idle');
  });

  it('emits status events on transition', async () => {
    const agent = new TestAgent({ name: 'test' });
    const statuses: string[] = [];
    agent.on('status', (s) => statuses.push(s));

    await agent.run();

    expect(statuses).toEqual(['running', 'stopped']);
  });

  it('calls lifecycle methods correctly', async () => {
    const agent = new TestAgent({ name: 'test' });
    await agent.initialize();
    const result = await agent.run();
    await agent.stop();

    expect(agent.initCalled).toBe(true);
    expect(agent.runCalled).toBe(true);
    expect(agent.stopCalled).toBe(true);
    expect(result.success).toBe(true);
    expect(result.data).toBe('done');
  });

  it('emits log events via protected log()', () => {
    class LoggingAgent extends BaseAgent<AgentConfig, void> {
      async initialize() {
        this.log('initializing');
      }
      async run(): Promise<AgentResult<void>> {
        return { success: true, duration: 0 };
      }
      async stop() {}
    }

    const agent = new LoggingAgent({ name: 'logger' });
    const messages: string[] = [];
    agent.on('log', (m) => messages.push(m));

    void agent.initialize();
    expect(messages).toEqual(['initializing']);
  });
});
