import { BaseAgent, AgentConfig, AgentResult } from './base-agent';

// Concrete test double
class DoubleAgent extends BaseAgent<string, string> {
  private readonly shouldFail: boolean;

  constructor(config: AgentConfig, shouldFail = false) {
    super(config);
    this.shouldFail = shouldFail;
  }

  protected async execute(input: string): Promise<string> {
    if (this.shouldFail) throw new Error('intentional failure');
    return `processed: ${input}`;
  }
}

describe('BaseAgent', () => {
  describe('run()', () => {
    it('returns success=true and data on successful execution', async () => {
      const agent = new DoubleAgent({ name: 'test-agent' });
      const result: AgentResult<string> = await agent.run('hello');
      expect(result.success).toBe(true);
      expect(result.data).toBe('processed: hello');
      expect(result.error).toBeUndefined();
    });

    it('returns success=false and error when execute throws', async () => {
      const agent = new DoubleAgent({ name: 'failing-agent' }, true);
      const result = await agent.run('input');
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('intentional failure');
      expect(result.data).toBeUndefined();
    });

    it('always resolves (never rejects)', async () => {
      const agent = new DoubleAgent({ name: 'safe-agent' }, true);
      await expect(agent.run('input')).resolves.toBeDefined();
    });

    it('records a non-negative durationMs', async () => {
      const agent = new DoubleAgent({ name: 'timed-agent' });
      const result = await agent.run('data');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('custom logger', () => {
    it('calls logger.info on success', async () => {
      const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const agent = new DoubleAgent({ name: 'logged-agent', logger });
      await agent.run('x');
      expect(logger.info).toHaveBeenCalledTimes(2); // started + completed
    });

    it('calls logger.error on failure', async () => {
      const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const agent = new DoubleAgent({ name: 'logged-agent', logger }, true);
      await agent.run('x');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
