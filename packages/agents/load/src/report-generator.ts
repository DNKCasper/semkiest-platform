/**
 * Report Generator
 *
 * Produces self-contained HTML reports for stress and soak test results.
 * Reports include:
 *  - Executive summary and pass/fail status
 *  - Response time distribution chart (p50/p95/p99 per stage or snapshot)
 *  - Throughput over time chart
 *  - Error rate over time chart
 *  - Threshold comparison table
 *  - Failure / degradation details
 *
 * Charts are rendered using Chart.js (loaded from CDN) with data embedded
 * as inline JSON — the report is a single self-contained HTML file.
 *
 * Usage:
 *   const generator = new ReportGenerator();
 *   const report = await generator.generate(testResult, config);
 */

import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import type {
  AnyTestResult,
  ChartData,
  ChartDataSeries,
  LoadTestReport,
  ReportConfig,
  SoakSnapshot,
  SoakTestResult,
  StressStageResult,
  StressTestResult,
} from './types';

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isStressTestResult(result: AnyTestResult): result is StressTestResult {
  return 'stages' in result && Array.isArray((result as StressTestResult).stages);
}

function isSoakTestResult(result: AnyTestResult): result is SoakTestResult {
  return (
    'snapshots' in result && Array.isArray((result as SoakTestResult).snapshots)
  );
}

// ---------------------------------------------------------------------------
// Chart data builders
// ---------------------------------------------------------------------------

/** Builds the response-time distribution chart from stress test stages */
function buildStressResponseTimeChart(stages: StressStageResult[]): ChartData {
  const labels = stages.map((s) => `${s.config.targetVus} VUs`);
  return {
    title: 'Response Time Distribution by Stage (ms)',
    xAxisLabel: 'Load Stage (Virtual Users)',
    yAxisLabel: 'Response Time (ms)',
    labels,
    series: [
      {
        label: 'p50',
        data: stages.map((s) => s.metrics.p50ResponseTimeMs),
        color: 'rgba(59, 130, 246, 0.8)',
      },
      {
        label: 'p95',
        data: stages.map((s) => s.metrics.p95ResponseTimeMs),
        color: 'rgba(245, 158, 11, 0.8)',
      },
      {
        label: 'p99',
        data: stages.map((s) => s.metrics.p99ResponseTimeMs),
        color: 'rgba(239, 68, 68, 0.8)',
      },
    ],
  };
}

/** Builds the throughput chart from stress test stages */
function buildStressThroughputChart(stages: StressStageResult[]): ChartData {
  const labels = stages.map((s) => `${s.config.targetVus} VUs`);
  return {
    title: 'Throughput by Stage (req/s)',
    xAxisLabel: 'Load Stage (Virtual Users)',
    yAxisLabel: 'Requests per Second',
    labels,
    series: [
      {
        label: 'Throughput (req/s)',
        data: stages.map((s) => parseFloat(s.metrics.requestsPerSecond.toFixed(2))),
        color: 'rgba(16, 185, 129, 0.8)',
      },
    ],
  };
}

/** Builds the error-rate chart from stress test stages */
function buildStressErrorRateChart(stages: StressStageResult[]): ChartData {
  const labels = stages.map((s) => `${s.config.targetVus} VUs`);
  return {
    title: 'Error Rate by Stage (%)',
    xAxisLabel: 'Load Stage (Virtual Users)',
    yAxisLabel: 'Error Rate (%)',
    labels,
    series: [
      {
        label: 'Error Rate (%)',
        data: stages.map((s) =>
          parseFloat((s.metrics.errorRate * 100).toFixed(2)),
        ),
        color: 'rgba(239, 68, 68, 0.8)',
      },
    ],
  };
}

/** Builds the response-time over time chart from soak test snapshots */
function buildSoakResponseTimeChart(snapshots: SoakSnapshot[]): ChartData {
  const labels = snapshots.map((s) => `${(s.elapsedSeconds / 60).toFixed(1)}m`);
  return {
    title: 'Response Time Over Time (ms)',
    xAxisLabel: 'Elapsed Time (minutes)',
    yAxisLabel: 'Response Time (ms)',
    labels,
    series: [
      {
        label: 'p50',
        data: snapshots.map((s) => s.metrics.p50ResponseTimeMs),
        color: 'rgba(59, 130, 246, 0.8)',
      },
      {
        label: 'p95',
        data: snapshots.map((s) => s.metrics.p95ResponseTimeMs),
        color: 'rgba(245, 158, 11, 0.8)',
      },
      {
        label: 'p99',
        data: snapshots.map((s) => s.metrics.p99ResponseTimeMs),
        color: 'rgba(239, 68, 68, 0.8)',
      },
    ],
  };
}

/** Builds the throughput over time chart from soak test snapshots */
function buildSoakThroughputChart(snapshots: SoakSnapshot[]): ChartData {
  const labels = snapshots.map((s) => `${(s.elapsedSeconds / 60).toFixed(1)}m`);
  return {
    title: 'Throughput Over Time (req/s)',
    xAxisLabel: 'Elapsed Time (minutes)',
    yAxisLabel: 'Requests per Second',
    labels,
    series: [
      {
        label: 'Throughput (req/s)',
        data: snapshots.map((s) =>
          parseFloat(s.metrics.requestsPerSecond.toFixed(2)),
        ),
        color: 'rgba(16, 185, 129, 0.8)',
      },
    ],
  };
}

/** Builds the error-rate over time chart from soak test snapshots */
function buildSoakErrorRateChart(snapshots: SoakSnapshot[]): ChartData {
  const labels = snapshots.map((s) => `${(s.elapsedSeconds / 60).toFixed(1)}m`);
  return {
    title: 'Error Rate Over Time (%)',
    xAxisLabel: 'Elapsed Time (minutes)',
    yAxisLabel: 'Error Rate (%)',
    labels,
    series: [
      {
        label: 'Error Rate (%)',
        data: snapshots.map((s) =>
          parseFloat((s.metrics.errorRate * 100).toFixed(2)),
        ),
        color: 'rgba(239, 68, 68, 0.8)',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Findings extraction
// ---------------------------------------------------------------------------

function extractStressFindings(result: StressTestResult): string[] {
  const findings: string[] = [];

  findings.push(result.summary);

  if (result.breakingPointStageIndex !== null) {
    const bp = result.stages[result.breakingPointStageIndex];
    findings.push(
      `Breaking point reached at ${bp.config.targetVus} virtual users: ` +
        `error rate ${(bp.metrics.errorRate * 100).toFixed(1)}%, ` +
        `p95 ${bp.metrics.p95ResponseTimeMs.toFixed(0)}ms.`,
    );
  }

  // Identify the fastest stage
  const stableStages = result.stages.filter((s) => !s.isBreakingPoint);
  if (stableStages.length > 0) {
    const fastest = stableStages.reduce((best, s) =>
      s.metrics.requestsPerSecond > best.metrics.requestsPerSecond ? s : best,
    );
    findings.push(
      `Peak throughput: ${fastest.metrics.requestsPerSecond.toFixed(1)} req/s at ${fastest.config.targetVus} VUs.`,
    );
  }

  return findings;
}

function extractSoakFindings(result: SoakTestResult): string[] {
  const findings: string[] = [result.summary];

  for (const pattern of result.degradationPatterns) {
    findings.push(pattern.description);
  }

  if (result.memoryLeakDetected) {
    findings.push(
      'Action required: Memory leak indicators detected. ' +
        'Run heap profiling and review connection pool / cache usage.',
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderChartScript(chartId: string, chart: ChartData): string {
  const datasets = chart.series.map((s: ChartDataSeries) => ({
    label: s.label,
    data: s.data,
    backgroundColor: s.color,
    borderColor: s.color.replace('0.8', '1'),
    borderWidth: 2,
    fill: false,
    tension: 0.3,
  }));

  const chartConfig = {
    type: chart.series.length === 1 ? 'bar' : 'line',
    data: {
      labels: chart.labels,
      datasets,
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: false,
        },
        legend: {
          position: 'top',
        },
      },
      scales: {
        x: {
          title: { display: true, text: chart.xAxisLabel },
        },
        y: {
          title: { display: true, text: chart.yAxisLabel },
          beginAtZero: true,
        },
      },
    },
  };

  return `
    <script>
      (function() {
        var ctx = document.getElementById(${JSON.stringify(chartId)}).getContext('2d');
        new Chart(ctx, ${JSON.stringify(chartConfig)});
      })();
    </script>`;
}

function renderCharts(charts: ChartData[]): string {
  return charts
    .map((chart, i) => {
      const chartId = `chart_${i}`;
      return `
      <div class="chart-container">
        <h3 class="chart-title">${escapeHtml(chart.title)}</h3>
        <canvas id="${chartId}"></canvas>
        ${renderChartScript(chartId, chart)}
      </div>`;
    })
    .join('\n');
}

function renderStressTable(result: StressTestResult): string {
  const rows = result.stages
    .map((s) => {
      const status = s.isBreakingPoint
        ? '<span class="badge badge-fail">BREAKING POINT</span>'
        : '<span class="badge badge-pass">STABLE</span>';
      return `
        <tr class="${s.isBreakingPoint ? 'row-fail' : ''}">
          <td>${s.config.targetVus}</td>
          <td>${s.metrics.avgResponseTimeMs.toFixed(0)}</td>
          <td>${s.metrics.p95ResponseTimeMs.toFixed(0)}</td>
          <td>${s.metrics.p99ResponseTimeMs.toFixed(0)}</td>
          <td>${s.metrics.requestsPerSecond.toFixed(1)}</td>
          <td>${(s.metrics.errorRate * 100).toFixed(2)}%</td>
          <td>${status}</td>
        </tr>`;
    })
    .join('');

  return `
    <table>
      <thead>
        <tr>
          <th>VUs</th>
          <th>Avg (ms)</th>
          <th>p95 (ms)</th>
          <th>p99 (ms)</th>
          <th>Req/s</th>
          <th>Error Rate</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSoakTable(result: SoakTestResult): string {
  const rows = result.snapshots
    .map((s) => {
      const hasPattern = result.degradationPatterns.some(
        (p) => Math.abs(p.elapsedSeconds - s.elapsedSeconds) < 1,
      );
      return `
        <tr class="${hasPattern ? 'row-warn' : ''}">
          <td>${(s.elapsedSeconds / 60).toFixed(1)}m</td>
          <td>${s.metrics.avgResponseTimeMs.toFixed(0)}</td>
          <td>${s.metrics.p95ResponseTimeMs.toFixed(0)}</td>
          <td>${s.metrics.requestsPerSecond.toFixed(1)}</td>
          <td>${(s.metrics.errorRate * 100).toFixed(2)}%</td>
          <td>${s.metrics.virtualUsers}</td>
        </tr>`;
    })
    .join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Elapsed</th>
          <th>Avg (ms)</th>
          <th>p95 (ms)</th>
          <th>Req/s</th>
          <th>Error Rate</th>
          <th>VUs</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderFindings(findings: string[]): string {
  return findings
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join('');
}

function renderDegradationPatterns(result: SoakTestResult): string {
  if (result.degradationPatterns.length === 0) {
    return '<p class="no-issues">No degradation patterns detected.</p>';
  }

  return result.degradationPatterns
    .map((p) => {
      const iconMap: Record<string, string> = {
        response_time_increase: '⚡',
        memory_leak_indicator: '🔴',
        error_rate_spike: '❌',
        throughput_drop: '📉',
      };
      const icon = iconMap[p.type] ?? '⚠️';
      return `
        <div class="pattern-card">
          <div class="pattern-header">${icon} ${escapeHtml(p.type.replace(/_/g, ' ').toUpperCase())}</div>
          <p>${escapeHtml(p.description)}</p>
          <div class="pattern-meta">
            Detected at: ${escapeHtml(new Date(p.detectedAt).toLocaleString())}
            &nbsp;|&nbsp;
            Elapsed: ${(p.elapsedSeconds / 60).toFixed(1)} minutes
            &nbsp;|&nbsp;
            Change: ${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(1)}%
          </div>
        </div>`;
    })
    .join('');
}

function buildHtml(params: {
  title: string;
  result: AnyTestResult;
  charts: ChartData[];
  findings: string[];
  generatedAt: string;
  includeRawData: boolean;
}): string {
  const { title, result, charts, findings, generatedAt, includeRawData } =
    params;

  const statusClass = result.passed ? 'status-pass' : 'status-fail';
  const statusText = result.passed ? 'PASSED' : 'FAILED';

  const rawDataSection = includeRawData
    ? `
      <section>
        <h2>Raw Data</h2>
        ${isStressTestResult(result) ? renderStressTable(result) : ''}
        ${isSoakTestResult(result) ? renderSoakTable(result) : ''}
      </section>`
    : '';

  const degradationSection = isSoakTestResult(result)
    ? `
      <section>
        <h2>Degradation Analysis</h2>
        ${renderDegradationPatterns(result)}
      </section>`
    : '';

  const chartsHtml = renderCharts(charts);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1f2937;
      background: #f9fafb;
      padding: 24px;
      line-height: 1.6;
    }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin: 24px 0 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
    h3 { font-size: 15px; margin-bottom: 8px; color: #374151; }
    section { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .status-pass { color: #fff; background: #10b981; padding: 4px 12px; border-radius: 999px; font-weight: 700; font-size: 13px; }
    .status-fail { color: #fff; background: #ef4444; padding: 4px 12px; border-radius: 999px; font-weight: 700; font-size: 13px; }
    .meta { color: #6b7280; font-size: 12px; margin-top: 4px; }
    .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
    .chart-container { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chart-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #374151; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    thead tr { background: #f3f4f6; }
    th { text-align: left; padding: 8px 12px; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
    td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:hover td { background: #fafafa; }
    .row-fail td { background: #fef2f2; }
    .row-warn td { background: #fffbeb; }
    .badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .badge-pass { background: #d1fae5; color: #065f46; }
    .badge-fail { background: #fee2e2; color: #991b1b; }
    ul.findings { list-style: disc; padding-left: 20px; }
    ul.findings li { margin-bottom: 6px; }
    .pattern-card { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; }
    .pattern-header { font-weight: 700; margin-bottom: 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
    .pattern-meta { font-size: 12px; color: #6b7280; margin-top: 8px; }
    .no-issues { color: #10b981; font-weight: 600; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 12px; }
    .summary-card { background: #f3f4f6; border-radius: 6px; padding: 12px 16px; }
    .summary-card .value { font-size: 22px; font-weight: 700; color: #1f2937; }
    .summary-card .label { font-size: 11px; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Generated: ${escapeHtml(generatedAt)} &nbsp;|&nbsp; Duration: ${escapeHtml(formatMs(result.durationMs))}</div>
    </div>
    <span class="${statusClass}">${statusText}</span>
  </div>

  <section>
    <h2>Summary</h2>
    <p>${escapeHtml(result.summary ?? '')}</p>
    ${buildSummaryCards(result)}
  </section>

  <section>
    <h2>Key Findings</h2>
    <ul class="findings">
      ${renderFindings(findings)}
    </ul>
  </section>

  <section>
    <h2>Charts</h2>
    <div class="charts-grid">
      ${chartsHtml}
    </div>
  </section>

  ${degradationSection}

  ${rawDataSection}

  <div class="meta" style="text-align:center; margin-top: 32px;">
    SemkiEst Load Testing Agent &mdash; Report generated by @semkiest/agents-load
  </div>
</body>
</html>`;
}

function buildSummaryCards(result: AnyTestResult): string {
  const cards: Array<{ label: string; value: string }> = [];

  if (isStressTestResult(result)) {
    cards.push(
      { label: 'Stages Run', value: String(result.stages.length) },
      {
        label: 'Max Stable VUs',
        value: String(result.maxSustainableVus),
      },
      {
        label: 'Breaking Point',
        value:
          result.breakingPointStageIndex !== null
            ? `Stage ${result.breakingPointStageIndex + 1}`
            : 'None',
      },
    );
  } else if (isSoakTestResult(result)) {
    cards.push(
      { label: 'Snapshots', value: String(result.snapshots.length) },
      {
        label: 'Degradation Patterns',
        value: String(result.degradationPatterns.length),
      },
      {
        label: 'Memory Leak',
        value: result.memoryLeakDetected ? 'Detected' : 'None',
      },
    );
  }

  if (result.overallMetrics.values['p(95)'] != null) {
    cards.push({
      label: 'Overall p95',
      value: `${result.overallMetrics.values['p(95)'].toFixed(0)}ms`,
    });
  }

  return `
    <div class="summary-grid">
      ${cards
        .map(
          (c) => `
        <div class="summary-card">
          <div class="value">${escapeHtml(c.value)}</div>
          <div class="label">${escapeHtml(c.label)}</div>
        </div>`,
        )
        .join('')}
    </div>`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(2)}h`;
}

// ---------------------------------------------------------------------------
// ReportGenerator class
// ---------------------------------------------------------------------------

/** Generates HTML load test reports from stress or soak test results */
export class ReportGenerator {
  /**
   * Generates an HTML report for the given test result.
   *
   * @param result - A StressTestResult or SoakTestResult
   * @param config - Report configuration (output directory, title, etc.)
   * @returns A LoadTestReport describing the generated file and its contents
   */
  async generate(
    result: AnyTestResult,
    config: ReportConfig,
  ): Promise<LoadTestReport> {
    this.validateConfig(config);

    await mkdir(config.outputDir, { recursive: true });

    const generatedAt = new Date().toISOString();
    const charts: ChartData[] = this.buildCharts(result);
    const findings: string[] = this.buildFindings(result);
    const includeRawData = config.includeRawData ?? true;

    const html = buildHtml({
      title: config.title,
      result,
      charts,
      findings,
      generatedAt: new Date(generatedAt).toLocaleString(),
      includeRawData,
    });

    const fileName = config.fileName ?? 'load-test-report';
    const reportPath = path.join(config.outputDir, `${fileName}.html`);
    await writeFile(reportPath, html, 'utf8');

    return {
      reportPath,
      title: config.title,
      generatedAt,
      charts,
      passed: result.passed,
      findings,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildCharts(result: AnyTestResult): ChartData[] {
    if (isStressTestResult(result)) {
      return [
        buildStressResponseTimeChart(result.stages),
        buildStressThroughputChart(result.stages),
        buildStressErrorRateChart(result.stages),
      ];
    }

    if (isSoakTestResult(result)) {
      return [
        buildSoakResponseTimeChart(result.snapshots),
        buildSoakThroughputChart(result.snapshots),
        buildSoakErrorRateChart(result.snapshots),
      ];
    }

    return [];
  }

  private buildFindings(result: AnyTestResult): string[] {
    if (isStressTestResult(result)) return extractStressFindings(result);
    if (isSoakTestResult(result)) return extractSoakFindings(result);
    return [];
  }

  private validateConfig(config: ReportConfig): void {
    if (!config.title || config.title.trim() === '') {
      throw new Error('ReportConfig.title is required');
    }
    if (!config.outputDir || config.outputDir.trim() === '') {
      throw new Error('ReportConfig.outputDir is required');
    }
  }
}
