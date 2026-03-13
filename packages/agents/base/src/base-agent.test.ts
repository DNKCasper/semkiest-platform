import { BaseAgent } from './base-agent';
import type { AgentConfig } from './types';

// Concrete test implementation
class EchoAgent extends BaseAgent<AgentConfig, string, string> {
  protected async executeImpl(input: string): Promise<string> {
    this.info('Echoing input', { input });
    return input;
  }
}

class FailingAgent extends BaseAgent<AgentConfig, void, void> {
  protected async executeImpl(): Promise<void> {
    throw new Error('Intentional failure');
  }
}

class SlowAgent extends BaseAgent<AgentConfig, void, void> {
  protected async executeImpl(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
  }
}

const makeConfig = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  id: 'test-agent',
  name: 'Test Agent',
  ...overrides,
});

describe('BaseAgent', () => {
  describe('run()', () => {
    it('returns success result when executeImpl resolves', async () => {
      const agent = new EchoAgent(makeConfig());
      const result = await agent.run('hello');

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
      expect(result.error).toBeUndefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('returns failure result when executeImpl throws', async () => {
      const agent = new FailingAgent(makeConfig());
      const result = await agent.run();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Intentional failure');
      expect(result.data).toBeUndefined();
    });

    it('respects the timeout option', async () => {
      const agent = new SlowAgent(makeConfig({ timeout: 100 }));
      const result = await agent.run();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/timed out after 100ms/);
    });
  });

  describe('logging', () => {
    it('accumulates log entries via getLogs()', async () => {
      const agent = new EchoAgent(makeConfig());
      await agent.run('hello');

      const logs = agent.getLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toContain('Echoing');
    });

    it('includes logs in result metadata', async () => {
      const agent = new EchoAgent(makeConfig());
      const result = await agent.run('hello');

      const logs = (result.metadata as { logs: unknown[] })?.logs;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('events', () => {
    it('emits start and end events', async () => {
      const agent = new EchoAgent(makeConfig());
      const events: string[] = [];

      agent.on('start', () => events.push('start'));
      agent.on('end', () => events.push('end'));

      await agent.run('hello');

      expect(events).toEqual(['start', 'end']);
    });

    it('emits error event on failure', async () => {
      const agent = new FailingAgent(makeConfig());
      const errors: Error[] = [];

      agent.on('error', (event: { error: Error }) => errors.push(event.error));

      await agent.run();

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Intentional failure');
    });
  });

  describe('id and name accessors', () => {
    it('exposes id and name from config', () => {
      const agent = new EchoAgent(makeConfig({ id: 'my-id', name: 'My Agent' }));
      expect(agent.id).toBe('my-id');
      expect(agent.name).toBe('My Agent');
    });
  });
});
