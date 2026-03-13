/**
 * Agent crash recovery with checkpoint-based resume capability.
 *
 * Provides:
 *   - Persistent checkpoints saved to disk so interrupted executions can resume.
 *   - Automatic restart with configurable retry limits and back-off delay.
 *   - Graceful isolation: one failed agent does not affect others.
 */

import * as fs from 'fs';
import * as path from 'path';

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'recovering';

/** Snapshot of agent execution state persisted between steps. */
export interface Checkpoint<TState = unknown> {
  /** Stable identifier for the agent type (e.g. "test-runner"). */
  agentId: string;
  /** Unique identifier for this specific execution run. */
  runId: string;
  /** Monotonically increasing step counter within the run. */
  step: number;
  /** Domain-specific state to restore on resume. */
  state: TState;
  /** Unix timestamp (ms) when this checkpoint was saved. */
  timestamp: number;
}

export interface AgentRecoveryOptions {
  /** Directory where checkpoint files are stored. Default: /tmp/sem-checkpoints */
  checkpointDir?: string;
  /** Maximum number of automatic restarts before propagating the error. Default: 3 */
  maxRestarts?: number;
  /** Milliseconds to wait before each restart attempt. Default: 5_000 */
  restartDelayMs?: number;
  /**
   * Called at the start of each restart attempt.
   * @param agentId  - The agent being restarted.
   * @param attempt  - 1-based restart attempt number.
   * @param checkpoint - The latest checkpoint, or null if none exists.
   */
  onRestart?: (agentId: string, attempt: number, checkpoint: Checkpoint | null) => void;
  /**
   * Called when the agent exceeds its restart budget.
   * @param agentId - The agent that permanently failed.
   * @param error   - The last error that caused the failure.
   */
  onMaxRestartsExceeded?: (agentId: string, error: unknown) => void;
}

/**
 * Persists agent checkpoints to the local filesystem.
 *
 * Checkpoints are stored as JSON files named `{agentId}_{runId}.json`.
 * The directory is created automatically if it does not exist.
 */
export class CheckpointStore {
  private readonly dir: string;

  constructor(dir = '/tmp/sem-checkpoints') {
    this.dir = dir;
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  /**
   * Persist a checkpoint synchronously.
   * Overwrites any previously saved checkpoint for the same agent/run pair.
   */
  save<TState>(checkpoint: Checkpoint<TState>): void {
    fs.writeFileSync(this.filePath(checkpoint.agentId, checkpoint.runId), JSON.stringify(checkpoint), 'utf8');
  }

  /**
   * Load the most recently saved checkpoint for an agent/run pair.
   * Returns null if no checkpoint exists or if the file is corrupt.
   */
  load<TState>(agentId: string, runId: string): Checkpoint<TState> | null {
    const file = this.filePath(agentId, runId);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as Checkpoint<TState>;
    } catch {
      return null;
    }
  }

  /** Delete the checkpoint after a successful run to avoid stale resume. */
  clear(agentId: string, runId: string): void {
    const file = this.filePath(agentId, runId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  /** List all checkpoint files currently stored. */
  list(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
  }

  private filePath(agentId: string, runId: string): string {
    const safe = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, `${safe(agentId)}_${safe(runId)}.json`);
  }
}

/**
 * Wraps an agent execution function with automatic restart and checkpoint resume.
 *
 * Usage:
 * ```ts
 * const recovery = new AgentRecovery({ maxRestarts: 3 });
 *
 * await recovery.run('test-runner', runId, async (checkpoint) => {
 *   const startStep = checkpoint?.step ?? 0;
 *   for (let step = startStep; step < totalSteps; step++) {
 *     await executeStep(step);
 *     recovery.saveCheckpoint({ agentId: 'test-runner', runId, step, state: { step }, timestamp: Date.now() });
 *   }
 * });
 * ```
 *
 * If the agent function throws, `AgentRecovery` will:
 * 1. Load the last checkpoint (if any).
 * 2. Wait `restartDelayMs` milliseconds.
 * 3. Re-invoke the agent function, passing the checkpoint.
 * 4. Repeat until `maxRestarts` is exhausted, then propagate the error.
 */
export class AgentRecovery {
  private readonly checkpointStore: CheckpointStore;
  private readonly maxRestarts: number;
  private readonly restartDelayMs: number;
  private readonly onRestart?: AgentRecoveryOptions['onRestart'];
  private readonly onMaxRestartsExceeded?: AgentRecoveryOptions['onMaxRestartsExceeded'];

  constructor(options: AgentRecoveryOptions = {}) {
    this.checkpointStore = new CheckpointStore(options.checkpointDir);
    this.maxRestarts = options.maxRestarts ?? 3;
    this.restartDelayMs = options.restartDelayMs ?? 5_000;
    this.onRestart = options.onRestart;
    this.onMaxRestartsExceeded = options.onMaxRestartsExceeded;
  }

  /**
   * Execute an agent function with automatic recovery.
   *
   * @param agentId - Stable agent type identifier.
   * @param runId   - Unique run identifier (e.g. a UUID).
   * @param fn      - The agent function. Receives the latest checkpoint or null.
   */
  async run<TState>(
    agentId: string,
    runId: string,
    fn: (checkpoint: Checkpoint<TState> | null) => Promise<void>,
  ): Promise<void> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRestarts) {
      const checkpoint = this.checkpointStore.load<TState>(agentId, runId);

      if (attempt > 0) {
        this.onRestart?.(agentId, attempt, checkpoint);
        await this.delay(this.restartDelayMs);
      }

      try {
        await fn(checkpoint);
        this.checkpointStore.clear(agentId, runId);
        return;
      } catch (err) {
        lastError = err;
        attempt++;
      }
    }

    this.onMaxRestartsExceeded?.(agentId, lastError);
    throw lastError;
  }

  /**
   * Save a checkpoint during agent execution.
   * Call this after each meaningful step so the agent can resume from here.
   */
  saveCheckpoint<TState>(checkpoint: Checkpoint<TState>): void {
    this.checkpointStore.save(checkpoint);
  }

  /** Direct access to the underlying checkpoint store. */
  getCheckpointStore(): CheckpointStore {
    return this.checkpointStore;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Default global recovery instance. Override options per-agent by creating a new instance. */
export const agentRecovery = new AgentRecovery();
