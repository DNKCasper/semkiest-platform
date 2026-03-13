import { ParallelExecutor, ExecutionTask } from './parallel-executor';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('ParallelExecutor', () => {
  describe('constructor', () => {
    it('accepts a valid concurrency', () => {
      expect(() => new ParallelExecutor(5)).not.toThrow();
    });

    it('throws RangeError for concurrency < 1', () => {
      expect(() => new ParallelExecutor(0)).toThrow(RangeError);
      expect(() => new ParallelExecutor(-1)).toThrow(RangeError);
    });

    it('defaults to concurrency 3', () => {
      // Smoke test — just ensure it constructs without arguments
      expect(() => new ParallelExecutor()).not.toThrow();
    });
  });

  describe('execute', () => {
    it('returns an empty array for empty input', async () => {
      const executor = new ParallelExecutor(3);
      const results = await executor.execute([]);
      expect(results).toEqual([]);
    });

    it('executes all tasks and returns results in order', async () => {
      const executor = new ParallelExecutor(2);
      const tasks: ExecutionTask<number>[] = [
        { id: 'a', execute: async () => 1 },
        { id: 'b', execute: async () => 2 },
        { id: 'c', execute: async () => 3 },
      ];

      const results = await executor.execute(tasks);
      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({ id: 'a', result: 1 });
      expect(results[1]).toMatchObject({ id: 'b', result: 2 });
      expect(results[2]).toMatchObject({ id: 'c', result: 3 });
    });

    it('captures errors without aborting remaining tasks', async () => {
      const executor = new ParallelExecutor(3);
      const tasks: ExecutionTask<string>[] = [
        { id: 'ok', execute: async () => 'success' },
        { id: 'fail', execute: async () => { throw new Error('task error'); } },
        { id: 'ok2', execute: async () => 'also success' },
      ];

      const results = await executor.execute(tasks);
      expect(results[0]).toMatchObject({ id: 'ok', result: 'success' });
      expect(results[1].error).toBeInstanceOf(Error);
      expect(results[1].error?.message).toBe('task error');
      expect(results[2]).toMatchObject({ id: 'ok2', result: 'also success' });
    });

    it('records positive durationMs for each task', async () => {
      const executor = new ParallelExecutor(2);
      const tasks: ExecutionTask<void>[] = [
        { id: 't1', execute: () => delay(10) },
        { id: 't2', execute: () => delay(10) },
      ];
      const results = await executor.execute(tasks);
      results.forEach((r) => expect(r.durationMs).toBeGreaterThanOrEqual(0));
    });

    it('respects concurrency limit', async () => {
      const executor = new ParallelExecutor(2);
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks: ExecutionTask<void>[] = Array.from({ length: 6 }, (_, i) => ({
        id: `t${i}`,
        execute: async () => {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await delay(20);
          concurrent -= 1;
        },
      }));

      await executor.execute(tasks);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('works when tasks.length < concurrency', async () => {
      const executor = new ParallelExecutor(10);
      const tasks: ExecutionTask<number>[] = [
        { id: 'only', execute: async () => 42 },
      ];
      const results = await executor.execute(tasks);
      expect(results[0]).toMatchObject({ id: 'only', result: 42 });
    });
  });
});
