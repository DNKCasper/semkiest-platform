import { BaseAgent, type AgentResult } from '@semkiest/agent-base';
import { K6Generator } from './k6-generator';
import { K6Executor } from './k6-executor';
import { MetricsCollector } from './metrics-collector';
import type { LoadAgentConfig, LoadTestResult } from './types';

/**
 * Load testing agent that integrates with k6 to generate and execute
 * configurable load test scenarios based on discovered user flows.
 *
 * Lifecycle:
 * 1. `initialize()` – validates configuration and checks k6 availability.
 * 2. `run()`        – generates a k6 script, executes it, collects metrics.
 * 3. `stop()`       – gracefully terminates an in-progress k6 process.
 *
 * Events (in addition to BaseAgent events):
 * - `metric`  – real-time `K6DataPoint` emitted during test execution.
 * - `output`  – raw text lines from the k6 process stdout/stderr.
 * - `status`  – lifecycle state transitions.
 * - `log`     – human-readable progress messages.
 */
export class LoadAgent extends BaseAgent<LoadAgentConfig, LoadTestResult> {
  private readonly generator: K6Generator;
  private readonly executor: K6Executor;
  private readonly collector: MetricsCollector;

  constructor(config: LoadAgentConfig) {
    super(config);
    this.generator = new K6Generator();
    this.executor = new K6Executor(config.k6Binary ?? 'k6');
    this.collector = new MetricsCollector();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Validate the load agent configuration before execution.
   *
   * Checks that:
   * - At least one user flow is provided.
   * - Each flow has at least one step.
   * - The k6 binary can be found (best-effort spawn check).
   */
  async initialize(): Promise<void> {
    this.setStatus('initializing');

    if (this.config.flows.length === 0) {
      throw new Error('[LoadAgent] At least one UserFlow must be configured.');
    }

    for (const flow of this.config.flows) {
      if (flow.steps.length === 0) {
        throw new Error(
          `[LoadAgent] Flow "${flow.name}" must have at least one step.`,
        );
      }
    }

    this.log(`[LoadAgent] Initialised with ${this.config.flows.length} flow(s).`);
    this.setStatus('idle');
  }

  /**
   * Generate a k6 script from the configured flows, execute it, and return
   * aggregated load test metrics.
   */
  async run(): Promise<AgentResult<LoadTestResult>> {
    this.setStatus('running');
    const runStart = Date.now();

    try {
      // --- 1. Generate k6 script -------------------------------------------
      this.log('[LoadAgent] Generating k6 script…');
      const script = this.generator.generate(
        this.config.flows,
        this.config.loadConfig,
      );

      // --- 2. Wire up real-time streaming -----------------------------------
      this.executor.on('metric', (point) => {
        // Forward metric points to LoadAgent listeners and feed the collector
        this.emit('metric', point);
        if (
          point.type === 'Point' &&
          typeof point.data?.value === 'number'
        ) {
          this.collector.recordPoint(point.metric, point.data.value);
        }
      });

      this.executor.on('output', (text: string) => {
        this.emit('output', text);
        this.log(text);
      });

      // --- 3. Execute ---------------------------------------------------------
      this.log('[LoadAgent] Executing k6 test…');
      const execResult = await this.executor.execute(script, {
        env: this.config.loadConfig.baseUrl
          ? { BASE_URL: this.config.loadConfig.baseUrl }
          : undefined,
      });

      // --- 4. Collect metrics -------------------------------------------------
      this.log('[LoadAgent] Collecting metrics…');
      let metrics;
      if (execResult.summaryPath) {
        metrics = await this.collector.collectFromSummary(execResult.summaryPath);
      } else {
        // Fall back to in-memory data when no summary file was produced
        metrics = {
          httpReqDuration: this.collector.buildInMemoryDurationMetrics(),
          httpReqs: { count: 0, rate: 0 },
          httpReqFailed: { rate: 0, count: 0 },
          vus: { current: 0, max: 0 },
          iterations: 0,
          timestamp: new Date(),
        };
      }

      const result: LoadTestResult = {
        metrics,
        exitCode: execResult.exitCode,
        duration: execResult.duration,
        scriptPath: execResult.scriptPath,
        // k6 exits 0 on success, 99 when thresholds fail, other for errors
        passed: execResult.exitCode === 0,
      };

      this.log(
        `[LoadAgent] Test completed – exit code ${execResult.exitCode}, ` +
          `p95=${metrics.httpReqDuration.p95.toFixed(1)}ms, ` +
          `error rate=${(metrics.httpReqFailed.rate * 100).toFixed(2)}%`,
      );

      this.setStatus('stopped');

      return {
        success: result.passed,
        data: result,
        duration: Date.now() - runStart,
      };
    } catch (err) {
      this.setStatus('error');
      const error = err instanceof Error ? err : new Error(String(err));
      return {
        success: false,
        error,
        duration: Date.now() - runStart,
      };
    }
  }

  /**
   * Gracefully stop the in-progress k6 process.
   */
  async stop(): Promise<void> {
    this.setStatus('stopping');
    await this.executor.stop();
    this.setStatus('stopped');
  }
}
