import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { K6ExecutionOptions, K6ExecutionResult } from './types';

/** How often (ms) the executor polls the JSON output file for new data points. */
const POLL_INTERVAL_MS = 500;

/** Default process timeout: 10 minutes. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Executes a k6 load test script in a child process and streams real-time
 * metric data points to listeners via EventEmitter events.
 *
 * Events:
 * - `output`  – raw stdout/stderr text from the k6 process.
 * - `metric`  – a parsed `K6DataPoint` from the JSON output stream.
 * - `error`   – a non-fatal error (e.g. unable to read output file mid-run).
 */
export class K6Executor extends EventEmitter {
  private readonly k6Binary: string;
  private currentProcess: ChildProcess | undefined;
  private pollInterval: ReturnType<typeof setInterval> | undefined;

  constructor(k6Binary = 'k6') {
    super();
    this.k6Binary = k6Binary;
  }

  /**
   * Write `script` to a temporary file, execute it with k6, and resolve once
   * the process exits.
   *
   * Streams metric data points via `metric` events during execution.
   *
   * @throws If the k6 binary cannot be spawned (e.g. not found in PATH).
   */
  async execute(
    script: string,
    options: K6ExecutionOptions = {},
  ): Promise<K6ExecutionResult> {
    const tmpDir = this.createTempDir();
    const scriptPath = path.join(tmpDir, 'script.js');
    const summaryPath = options.summaryExportPath ?? path.join(tmpDir, 'summary.json');
    const jsonOutputPath = options.outputPath ?? path.join(tmpDir, 'output.jsonl');

    fs.writeFileSync(scriptPath, script, 'utf-8');

    const args = [
      'run',
      '--summary-export', summaryPath,
      '--out', `json=${jsonOutputPath}`,
      scriptPath,
    ];

    return new Promise<K6ExecutionResult>((resolve, reject) => {
      const startTime = Date.now();
      let rawOutput = '';
      let bytesRead = 0;
      let timedOut = false;

      this.currentProcess = spawn(this.k6Binary, args, {
        env: { ...process.env, ...(options.env ?? {}) },
      });

      // --- stdout / stderr passthrough -----------------------------------------
      this.currentProcess.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        rawOutput += text;
        this.emit('output', text);
      });

      this.currentProcess.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        rawOutput += text;
        this.emit('output', text);
      });

      // --- real-time JSON metric polling ----------------------------------------
      this.pollInterval = setInterval(() => {
        try {
          if (!fs.existsSync(jsonOutputPath)) return;
          const stat = fs.statSync(jsonOutputPath);
          if (stat.size <= bytesRead) return;

          const fd = fs.openSync(jsonOutputPath, 'r');
          const buffer = Buffer.alloc(stat.size - bytesRead);
          fs.readSync(fd, buffer, 0, buffer.length, bytesRead);
          bytesRead = stat.size;
          fs.closeSync(fd);

          const text = buffer.toString('utf-8');
          for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed) as { type?: string };
              if (parsed.type === 'Point') {
                this.emit('metric', parsed);
              }
            } catch {
              // Partial line — will be picked up on the next poll
            }
          }
        } catch (err) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
      }, POLL_INTERVAL_MS);

      // --- optional timeout -----------------------------------------------------
      const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        this.currentProcess?.kill('SIGTERM');
      }, timeoutMs);

      // --- process exit ---------------------------------------------------------
      this.currentProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.stopPolling();

        if (timedOut) {
          reject(new Error(`k6 process timed out after ${timeoutMs}ms`));
          return;
        }

        resolve({
          exitCode: code ?? 1,
          duration: Date.now() - startTime,
          scriptPath,
          summaryPath: fs.existsSync(summaryPath) ? summaryPath : undefined,
          rawOutput,
          tmpDir,
        });
      });

      this.currentProcess.on('error', (err) => {
        clearTimeout(timeoutHandle);
        this.stopPolling();
        reject(err);
      });
    });
  }

  /**
   * Gracefully terminate an in-progress k6 process with SIGTERM.
   * Resolves immediately if no process is running.
   */
  async stop(): Promise<void> {
    this.stopPolling();
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'semkiest-k6-'));
  }

  private stopPolling(): void {
    if (this.pollInterval !== undefined) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }
}
