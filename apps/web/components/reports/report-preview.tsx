'use client';

import { useRef } from 'react';
import { Printer, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Badge } from '../ui/badge';
import { formatDate, formatDateTime, formatPassRate } from '../../lib/utils';
import type { Report } from '../../types/report';

export interface ReportPreviewProps {
  report: Report;
  onClose: () => void;
}

/**
 * Printable report preview panel. Renders the report in a formatted layout
 * suitable for printing to PDF via the browser's print dialog.
 */
export function ReportPreview({ report, onClose }: ReportPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    window.print();
  }

  const metrics = report.metrics;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">{report.title}</h2>
          <Badge variant="secondary">{report.type.replace('_', ' ')}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print / Save as PDF
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Printable content */}
      <div
        ref={printRef}
        className="flex-1 overflow-auto bg-white"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        <div className="max-w-4xl mx-auto px-8 py-10 print:px-6 print:py-6">
          {/* Report header */}
          <div className="mb-8 border-b pb-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  SemkiEst Platform
                </p>
                <h1 className="text-3xl font-bold text-foreground">{report.title}</h1>
                <p className="mt-1 text-muted-foreground">{report.projectName}</p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>Generated {report.generatedAt ? formatDateTime(report.generatedAt) : '—'}</p>
                {report.createdBy && <p className="mt-0.5">By {report.createdBy}</p>}
              </div>
            </div>
          </div>

          {/* Summary metrics */}
          {metrics && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-4">Summary</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <MetricCard
                  label="Total Runs"
                  value={String(metrics.totalRuns)}
                />
                <MetricCard
                  label="Pass Rate"
                  value={formatPassRate(metrics.passRate)}
                  highlight={
                    metrics.passRate >= 0.9
                      ? 'green'
                      : metrics.passRate >= 0.7
                      ? 'yellow'
                      : 'red'
                  }
                />
                <MetricCard
                  label="Fail Rate"
                  value={formatPassRate(metrics.failRate)}
                  highlight={metrics.failRate > 0.1 ? 'red' : undefined}
                />
                <MetricCard
                  label="Total Tests"
                  value={String(metrics.totalTests)}
                />
              </div>
            </section>
          )}

          {/* Period */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Report Period</h2>
            <div className="rounded-md border border-border p-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Period: </span>
                  <span className="font-medium">
                    {report.customization.timePeriod.replace(/_/g, ' ')}
                  </span>
                </div>
                {report.customization.dateFrom && (
                  <div>
                    <span className="text-muted-foreground">From: </span>
                    <span className="font-medium">
                      {formatDate(report.customization.dateFrom)}
                    </span>
                  </div>
                )}
                {report.customization.dateTo && (
                  <div>
                    <span className="text-muted-foreground">To: </span>
                    <span className="font-medium">
                      {formatDate(report.customization.dateTo)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Categories: </span>
                  <span className="font-medium">
                    {report.customization.categories.join(', ')}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Pass rate bar chart (CSS-based) */}
          {metrics && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-4">Pass / Fail Breakdown</h2>
              <div className="space-y-3">
                <PassRateBar label="Pass" rate={metrics.passRate} color="green" />
                <PassRateBar label="Fail" rate={metrics.failRate} color="red" />
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="mt-12 border-t pt-4 text-xs text-muted-foreground flex justify-between">
            <span>SemkiEst Platform — Confidential</span>
            <span>Report ID: {report.id}</span>
          </div>
        </div>
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .fixed { position: static !important; }
          [ref] * { visibility: visible; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: string;
  highlight?: 'green' | 'yellow' | 'red';
}

function MetricCard({ label, value, highlight }: MetricCardProps) {
  const valueClass =
    highlight === 'green'
      ? 'text-green-600'
      : highlight === 'yellow'
      ? 'text-yellow-600'
      : highlight === 'red'
      ? 'text-red-600'
      : 'text-foreground';

  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

interface PassRateBarProps {
  label: string;
  rate: number;
  color: 'green' | 'red';
}

function PassRateBar({ label, rate, color }: PassRateBarProps) {
  const pct = Math.round(rate * 100);
  const barColor = color === 'green' ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-10 text-right text-muted-foreground">{label}</span>
      <div className="flex-1 rounded-full bg-muted h-4 overflow-hidden">
        <div
          className={`${barColor} h-full rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 font-medium">{pct}%</span>
    </div>
  );
}
