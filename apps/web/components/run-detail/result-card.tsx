'use client';

import * as React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  Wand2,
  Clock,
  Image as ImageIcon,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import type { TestResult, TestStatus, TestSeverity, Evidence } from '../../types/run';

/** Formats milliseconds as a compact duration label. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const STATUS_ICON: Record<TestStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />,
  fail: <XCircle className="h-5 w-5 text-red-500 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />,
  skip: <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0" />,
};

const STATUS_BORDER: Record<TestStatus, string> = {
  pass: 'border-l-green-400',
  fail: 'border-l-red-400',
  warning: 'border-l-yellow-400',
  skip: 'border-l-muted',
};

const SEVERITY_VARIANT: Record<
  TestSeverity,
  'destructive' | 'warning' | 'default' | 'secondary' | 'outline'
> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'default',
  low: 'secondary',
  info: 'outline',
};

const SEVERITY_LABEL: Record<TestSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

interface EvidenceLinkProps {
  evidence: Evidence;
  onOpen: (evidence: Evidence) => void;
}

function EvidenceLink({ evidence, onOpen }: EvidenceLinkProps) {
  if (evidence.type === 'network_log') {
    return (
      <button
        type="button"
        onClick={() => onOpen(evidence)}
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        {evidence.label ?? 'Network log'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(evidence)}
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      <ImageIcon className="h-3 w-3" />
      {evidence.label ?? 'Screenshot'}
    </button>
  );
}

interface ResultCardProps {
  result: TestResult;
  onEvidenceOpen: (evidence: Evidence, allEvidence: Evidence[]) => void;
}

/**
 * Displays a single test result with status, severity, description,
 * evidence links, and self-healing indicator.
 */
export function ResultCard({ result, onEvidenceOpen }: ResultCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const hasDetails = !!(result.error ?? result.selfHealingEvent ?? (result.evidence && result.evidence.length > 0));

  return (
    <div
      className={cn(
        'rounded-lg border bg-card border-l-4 transition-shadow hover:shadow-sm',
        STATUS_BORDER[result.status],
      )}
    >
      {/* Main row */}
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5">{STATUS_ICON[result.status]}</div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{result.name}</span>
            <Badge variant={SEVERITY_VARIANT[result.severity]} className="text-xs">
              {SEVERITY_LABEL[result.severity]}
            </Badge>
            {result.selfHealingEvent && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Wand2 className="h-3 w-3" />
                Self-healed
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{result.description}</p>
        </div>

        {/* Right section: duration + expand */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDuration(result.duration)}
          </span>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="rounded-sm p-0.5 hover:bg-muted transition-colors"
              aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expandable details */}
      {isExpanded && hasDetails && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          {/* Error details */}
          {result.error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-medium text-red-700 mb-1">Error</p>
              <pre className="text-xs text-red-600 whitespace-pre-wrap break-words font-mono">
                {result.error}
              </pre>
            </div>
          )}

          {/* Evidence links */}
          {result.evidence && result.evidence.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Evidence</p>
              <div className="flex flex-wrap gap-3">
                {result.evidence.map((ev) => (
                  <EvidenceLink
                    key={ev.id}
                    evidence={ev}
                    onOpen={(e) => onEvidenceOpen(e, result.evidence!)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Self-healing details */}
          {result.selfHealingEvent && (
            <div className="rounded-md bg-purple-50 border border-purple-200 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700">
                <Wand2 className="h-3.5 w-3.5" />
                Self-Healing Resolution
              </div>
              <p className="text-xs text-purple-600">{result.selfHealingEvent.description}</p>
              <p className="text-xs text-purple-800 font-medium">
                Resolution: {result.selfHealingEvent.resolution}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(result.selfHealingEvent.timestamp).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
