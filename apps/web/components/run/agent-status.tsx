'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import type { AgentState, AgentStatus } from '../../types/run';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AGENT_LABELS: Record<string, string> = {
  explorer: 'Explorer Agent',
  'spec-reader': 'Spec Reader Agent',
  executor: 'Executor Agent',
  validator: 'Validator Agent',
  reporter: 'Reporter Agent',
};

function statusVariant(
  status: AgentStatus,
): 'default' | 'secondary' | 'success' | 'destructive' | 'warning' {
  switch (status) {
    case 'running':
      return 'default';
    case 'completed':
    case 'idle':
      return 'success';
    case 'failed':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'idle':
      return 'Idle';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function StatusIcon({ status, className }: { status: AgentStatus; className?: string }) {
  const base = cn('h-4 w-4 shrink-0', className);
  switch (status) {
    case 'running':
      return <Loader2 className={cn(base, 'animate-spin text-primary')} />;
    case 'completed':
    case 'idle':
      return <CheckCircle2 className={cn(base, 'text-green-600')} />;
    case 'failed':
      return <AlertCircle className={cn(base, 'text-destructive')} />;
    default:
      return <Clock className={cn(base, 'text-muted-foreground')} />;
  }
}

// ---------------------------------------------------------------------------
// Single agent row
// ---------------------------------------------------------------------------

interface AgentRowProps {
  agent: AgentState;
}

function AgentRow({ agent }: AgentRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const label = AGENT_LABELS[agent.name] ?? agent.label;
  const hasDetails = Boolean(agent.message ?? agent.error ?? (agent.progress !== undefined));

  return (
    <div className="rounded-md border">
      {/* Header row */}
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left',
          hasDetails && 'cursor-pointer hover:bg-muted/50',
          !hasDetails && 'cursor-default',
        )}
        onClick={() => hasDetails && setExpanded((v) => !v)}
        aria-expanded={hasDetails ? expanded : undefined}
      >
        <StatusIcon status={agent.status} />

        <span className="flex-1 text-sm font-medium">{label}</span>

        {/* Progress fraction */}
        {agent.progress !== undefined && agent.total !== undefined && (
          <span className="text-xs text-muted-foreground">
            {agent.progress}/{agent.total}
          </span>
        )}

        <Badge variant={statusVariant(agent.status)} className="ml-1">
          {statusLabel(agent.status)}
        </Badge>

        {hasDetails && (
          <span className="ml-1 text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="border-t bg-muted/30 px-4 py-3 text-sm space-y-2">
          {/* Progress bar */}
          {agent.progress !== undefined && agent.total !== undefined && agent.total > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>
                  {Math.round((agent.progress / agent.total) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.min(100, (agent.progress / agent.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {agent.message && (
            <p className="text-muted-foreground">{agent.message}</p>
          )}

          {agent.error && (
            <p className="text-destructive font-medium">
              <AlertCircle className="inline mr-1 h-3 w-3" />
              {agent.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface AgentStatusProps {
  agents: AgentState[];
  className?: string;
}

/**
 * Displays per-agent status indicators for a test run.
 * Each row is clickable to expand details when available.
 */
export function AgentStatus({ agents, className }: AgentStatusProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {agents.map((agent) => (
        <AgentRow key={agent.name} agent={agent} />
      ))}
    </div>
  );
}
