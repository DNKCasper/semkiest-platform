'use client';

import * as React from 'react';
import {
  Download,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import type { LogEntry, LogLevel, AgentName } from '../../types/run';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-blue-400',
  debug: 'text-muted-foreground',
};

const LOG_LEVEL_BADGE_VARIANTS: Record<LogLevel, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  error: 'destructive',
  warning: 'warning',
  info: 'default',
  debug: 'secondary',
};

const AGENT_LABELS: Record<string, string> = {
  explorer: 'Explorer',
  'spec-reader': 'Spec Reader',
  executor: 'Executor',
  validator: 'Validator',
  reporter: 'Reporter',
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveLogsProps {
  logs: LogEntry[];
  className?: string;
}

type LevelFilter = LogLevel | 'all';
type AgentFilter = AgentName | 'all';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Scrollable log panel with:
 * - Color-coded log levels
 * - Filters by level, agent, and text search
 * - Auto-scroll to latest (pauses on user scroll)
 * - Export / download functionality
 */
export function LiveLogs({ logs, className }: LiveLogsProps) {
  const [levelFilter, setLevelFilter] = React.useState<LevelFilter>('all');
  const [agentFilter, setAgentFilter] = React.useState<AgentFilter>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isPaused, setIsPaused] = React.useState(false);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const userScrolledRef = React.useRef(false);

  // Detect unique agents in logs for the filter dropdown
  const agentOptions = React.useMemo(() => {
    const names = new Set<AgentName>();
    for (const entry of logs) {
      if (entry.agent) names.add(entry.agent);
    }
    return Array.from(names);
  }, [logs]);

  // Filtered log entries
  const filteredLogs = React.useMemo(() => {
    return logs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (agentFilter !== 'all' && entry.agent !== agentFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inMessage = entry.message.toLowerCase().includes(q);
        const inAgent = entry.agent?.toLowerCase().includes(q) ?? false;
        if (!inMessage && !inAgent) return false;
      }
      return true;
    });
  }, [logs, levelFilter, agentFilter, searchQuery]);

  // Auto-scroll to bottom when new entries arrive, unless paused
  React.useEffect(() => {
    if (!isPaused && !userScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, isPaused]);

  // Detect manual scroll to pause auto-scroll
  const handleScroll = React.useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!isAtBottom) {
      userScrolledRef.current = true;
      setIsPaused(true);
    } else {
      userScrolledRef.current = false;
    }
  }, []);

  const handleResume = () => {
    userScrolledRef.current = false;
    setIsPaused(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Download logs as plain text
  const handleExport = () => {
    const text = filteredLogs
      .map(
        (e) =>
          `[${formatTimestamp(e.timestamp)}] [${e.level.toUpperCase()}]${e.agent ? ` [${e.agent}]` : ''} ${e.message}`,
      )
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearSearch = () => setSearchQuery('');

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Level filter */}
        <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as LevelFilter)}>
          <SelectTrigger className="h-8 w-[120px]">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>

        {/* Agent filter */}
        <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v as AgentFilter)}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agentOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {AGENT_LABELS[name] ?? name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-7 pr-7 text-xs"
            placeholder="Search logs…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Pause / resume auto-scroll */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={isPaused ? handleResume : () => setIsPaused(true)}
          >
            {isPaused ? (
              <>
                <Play className="h-3.5 w-3.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </>
            )}
          </Button>

          {/* Export */}
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Log count */}
      <div className="text-xs text-muted-foreground">
        Showing {filteredLogs.length} of {logs.length} entries
      </div>

      {/* Log panel */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-96 overflow-y-auto rounded-md border bg-black/90 p-3 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No log entries match the current filters.</p>
        ) : (
          filteredLogs.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-0.5 leading-5">
              {/* Timestamp */}
              <span className="shrink-0 text-muted-foreground/60">
                {formatTimestamp(entry.timestamp)}
              </span>

              {/* Level badge */}
              <Badge
                variant={LOG_LEVEL_BADGE_VARIANTS[entry.level]}
                className="shrink-0 h-4 px-1 text-[10px] leading-none rounded"
              >
                {entry.level.toUpperCase()}
              </Badge>

              {/* Agent tag */}
              {entry.agent && (
                <span className="shrink-0 text-purple-400">
                  [{AGENT_LABELS[entry.agent] ?? entry.agent}]
                </span>
              )}

              {/* Message */}
              <span className={cn('break-all', LOG_LEVEL_COLORS[entry.level])}>
                {entry.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Paused indicator */}
      {isPaused && (
        <p className="text-xs text-muted-foreground text-center">
          Auto-scroll paused.{' '}
          <button
            type="button"
            onClick={handleResume}
            className="underline hover:text-foreground"
          >
            Resume
          </button>
        </p>
      )}
    </div>
  );
}
