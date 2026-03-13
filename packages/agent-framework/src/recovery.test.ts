import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentRecovery, CheckpointStore, type Checkpoint } from './recovery';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sem-recovery-test-'));
}

describe('CheckpointStore', () => {
  let dir: string;
  let store: CheckpointStore;

  beforeEach(() => {
    dir = tempDir();
    store = new CheckpointStore(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saves and loads a checkpoint', () => {
    const cp: Checkpoint<{ value: number }> = {
      agentId: 'agent-1',
      runId: 'run-1',
      step: 3,
      state: { value: 42 },
      timestamp: Date.now(),
    };
    store.save(cp);
    const loaded = store.load<{ value: number }>('agent-1', 'run-1');
    expect(loaded).toEqual(cp);
  });

  it('returns null for a missing checkpoint', () => {
    expect(store.load('missing', 'run')).toBeNull();
  });

  it('returns null for a corrupt checkpoint file', () => {
    const filePath = path.join(dir, 'corrupt_run.json');
    fs.writeFileSync(filePath, 'not-json', 'utf8');
    // Use a store pointed at the same dir, the key must match file naming convention
    const corruptStore = new CheckpointStore(dir);
    expect(corruptStore.load('corrupt', 'run')).toBeNull();
  });

  it('overwrites an existing checkpoint on save', () => {
    const base = { agentId: 'a', runId: 'r', step: 0, state: {}, timestamp: 0 };
    store.save({ ...base, step: 1 });
    store.save({ ...base, step: 2 });
    expect(store.load('a', 'r')?.step).toBe(2);
  });

  it('clear() removes the checkpoint file', () => {
    store.save({ agentId: 'a', runId: 'r', step: 1, state: {}, timestamp: 0 });
    store.clear('a', 'r');
    expect(store.load('a', 'r')).toBeNull();
  });

  it('clear() is a no-op when no file exists', () => {
    expect(() => store.clear('ghost', 'run')).not.toThrow();
  });

  it('list() returns all checkpoint files', () => {
    store.save({ agentId: 'a', runId: 'r1', step: 1, state: {}, timestamp: 0 });
    store.save({ agentId: 'b', runId: 'r2', step: 1, state: {}, timestamp: 0 });
    expect(store.list().length).toBe(2);
  });

  it('creates the directory if it does not exist', () => {
    const nested = path.join(dir, 'deep', 'nested');
    new CheckpointStore(nested);
    expect(fs.existsSync(nested)).toBe(true);
  });
});

describe('AgentRecovery', () => {
  let dir: string;
  let recovery: AgentRecovery;

  beforeEach(() => {
    dir = tempDir();
    recovery = new AgentRecovery({ checkpointDir: dir, maxRestarts: 2, restartDelayMs: 0 });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('runs successfully on the first attempt', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    await recovery.run('agent', 'run-1', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(null);
  });

  it('clears the checkpoint on success', async () => {
    recovery.saveCheckpoint({ agentId: 'agent', runId: 'run-2', step: 1, state: {}, timestamp: 0 });
    await recovery.run('agent', 'run-2', jest.fn().mockResolvedValue(undefined));
    expect(recovery.getCheckpointStore().load('agent', 'run-2')).toBeNull();
  });

  it('retries on failure and passes checkpoint to subsequent attempts', async () => {
    // Save a checkpoint to simulate a previous partial run
    recovery.saveCheckpoint({ agentId: 'agent', runId: 'run-3', step: 5, state: { x: 1 }, timestamp: 0 });

    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValue(undefined);

    await recovery.run('agent', 'run-3', fn);
    expect(fn).toHaveBeenCalledTimes(2);
    // Second call passes the checkpoint that was already on disk
    expect(fn.mock.calls[1][0]).toMatchObject({ step: 5 });
  });

  it('throws after exceeding maxRestarts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));
    await expect(recovery.run('agent', 'run-4', fn)).rejects.toThrow('always fails');
    // 1 initial + maxRestarts(2) retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('calls onRestart callback for each restart', async () => {
    const onRestart = jest.fn();
    const r = new AgentRecovery({
      checkpointDir: dir,
      maxRestarts: 2,
      restartDelayMs: 0,
      onRestart,
    });

    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(r.run('agent', 'run-5', fn)).rejects.toThrow();
    expect(onRestart).toHaveBeenCalledTimes(2);
    expect(onRestart.mock.calls[0][1]).toBe(1);
    expect(onRestart.mock.calls[1][1]).toBe(2);
  });

  it('calls onMaxRestartsExceeded when budget is exhausted', async () => {
    const onMaxRestartsExceeded = jest.fn();
    const r = new AgentRecovery({
      checkpointDir: dir,
      maxRestarts: 1,
      restartDelayMs: 0,
      onMaxRestartsExceeded,
    });

    const err = new Error('terminal');
    await expect(r.run('agent', 'run-6', jest.fn().mockRejectedValue(err))).rejects.toThrow('terminal');
    expect(onMaxRestartsExceeded).toHaveBeenCalledWith('agent', err);
  });

  it('saveCheckpoint persists state accessible on resume', () => {
    recovery.saveCheckpoint({ agentId: 'a', runId: 'r', step: 7, state: { done: true }, timestamp: 0 });
    const cp = recovery.getCheckpointStore().load('a', 'r');
    expect(cp?.step).toBe(7);
  });

  it('first arg is null when no prior checkpoint exists', async () => {
    const captured: (Checkpoint | null)[] = [];
    const fn = jest.fn().mockImplementation((cp: Checkpoint | null) => {
      captured.push(cp);
      return Promise.resolve();
    });
    await recovery.run('fresh-agent', 'run-7', fn);
    expect(captured[0]).toBeNull();
  });
});
