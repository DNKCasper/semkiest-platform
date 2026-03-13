'use client';

import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { useOnboarding } from '../../../context/onboarding-context';

// ─── Types ────────────────────────────────────────────────────────────────────

type RunStatus = 'idle' | 'running' | 'success' | 'error';

interface MockTestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
}

// ─── Mock test results ────────────────────────────────────────────────────────

const DEMO_RESULTS: MockTestResult[] = [
  { name: 'Home page loads successfully', status: 'passed', durationMs: 812 },
  { name: 'Navigation links are visible', status: 'passed', durationMs: 340 },
  { name: 'Page title matches expected', status: 'passed', durationMs: 120 },
  { name: 'No console errors on load', status: 'passed', durationMs: 250 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function RunFirstTestStep() {
  const { completeStep, goToStep, projectData, testProfileData } =
    useOnboarding();
  const [status, setStatus] = useState<RunStatus>('idle');
  const [results, setResults] = useState<MockTestResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);

  async function runTest() {
    setStatus('running');
    setResults([]);
    setVisibleCount(0);

    // Simulate async test execution with streaming results
    for (let i = 0; i < DEMO_RESULTS.length; i++) {
      await delay(600 + Math.random() * 400);
      setResults((prev) => [...prev, DEMO_RESULTS[i]]);
      setVisibleCount((n) => n + 1);
    }

    setStatus('success');
  }

  function handleComplete() {
    completeStep('run-first-test');
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Run your first test
        </h2>
        <p className="text-sm text-gray-500">
          We&apos;ll run a quick smoke test on{' '}
          <span className="font-medium text-gray-700">
            {projectData?.url ?? 'your project URL'}
          </span>{' '}
          using{' '}
          <span className="font-medium text-gray-700">
            {testProfileData?.browser ?? 'Chromium'}
          </span>
          .
        </p>
      </div>

      {/* Config summary */}
      <div className="rounded-lg bg-gray-50 p-4 text-sm">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <ConfigItem label="Project" value={projectData?.name ?? '—'} />
          <ConfigItem label="URL" value={projectData?.url ?? '—'} truncate />
          <ConfigItem
            label="Browser"
            value={capitalize(testProfileData?.browser ?? 'chromium')}
          />
          <ConfigItem
            label="Viewport"
            value={testProfileData?.viewport ?? '1280x720'}
          />
          <ConfigItem
            label="Mode"
            value={testProfileData?.headless ? 'Headless' : 'Headed'}
          />
        </dl>
      </div>

      {/* Results stream */}
      {results.length > 0 && (
        <ul className="space-y-2" aria-label="Test results">
          {results.map((r, i) => (
            <TestResultRow key={i} result={r} />
          ))}
        </ul>
      )}

      {/* Running indicator */}
      {status === 'running' && visibleCount < DEMO_RESULTS.length && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          Running tests…
        </div>
      )}

      {/* Success summary */}
      {status === 'success' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">
            All {DEMO_RESULTS.length} tests passed!
          </p>
          <p className="mt-0.5 text-sm text-green-700">
            Your project is configured and ready. You can now add more test
            suites from the dashboard.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          The test run encountered an error. Check your URL and try again.
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => goToStep('configure-test-profile')}
          disabled={status === 'running'}
        >
          Back
        </Button>

        {status !== 'success' && (
          <Button onClick={runTest} disabled={status === 'running'}>
            {status === 'running' ? 'Running…' : 'Run test'}
          </Button>
        )}

        {status === 'success' && (
          <Button onClick={handleComplete}>
            Finish setup
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ConfigItem({
  label,
  value,
  truncate = false,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd
        className={`font-medium text-gray-800 ${truncate ? 'max-w-[160px] truncate' : ''}`}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function TestResultRow({ result }: { result: MockTestResult }) {
  const statusConfig = {
    passed: { icon: '✓', color: 'text-green-600', bg: 'bg-green-50' },
    failed: { icon: '✗', color: 'text-red-600', bg: 'bg-red-50' },
    skipped: { icon: '–', color: 'text-gray-400', bg: 'bg-gray-50' },
  }[result.status];

  return (
    <li
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${statusConfig.bg}`}
    >
      <span className={`font-bold ${statusConfig.color}`}>
        {statusConfig.icon}
      </span>
      <span className="flex-1 text-gray-800">{result.name}</span>
      <span className="tabular-nums text-gray-400">
        {result.durationMs}ms
      </span>
    </li>
  );
}
