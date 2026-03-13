'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FolderPlus,
  Play,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActivityEvent, ActivityEventType } from '@/types/dashboard';

const INITIAL_VISIBLE = 5;
const PAGE_SIZE = 5;

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface EventConfig {
  icon: React.ReactNode;
  badgeVariant: 'success' | 'destructive' | 'default' | 'warning' | 'secondary' | 'outline';
  label: string;
}

function getEventConfig(type: ActivityEventType): EventConfig {
  switch (type) {
    case 'test_run_completed':
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
        badgeVariant: 'success',
        label: 'Completed',
      };
    case 'test_run_failed':
      return {
        icon: <AlertCircle className="h-4 w-4 text-red-500" />,
        badgeVariant: 'destructive',
        label: 'Failed',
      };
    case 'test_run_started':
      return {
        icon: <Play className="h-4 w-4 text-blue-500" />,
        badgeVariant: 'default',
        label: 'Started',
      };
    case 'project_created':
      return {
        icon: <FolderPlus className="h-4 w-4 text-indigo-500" />,
        badgeVariant: 'secondary',
        label: 'New Project',
      };
    case 'tests_triggered':
      return {
        icon: <Zap className="h-4 w-4 text-purple-500" />,
        badgeVariant: 'outline',
        label: 'Triggered',
      };
    case 'issue_discovered':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
        badgeVariant: 'warning',
        label: 'Issue',
      };
  }
}

interface ActivityFeedItemProps {
  event: ActivityEvent;
}

function ActivityFeedItem({ event }: ActivityFeedItemProps) {
  const config = getEventConfig(event.type);

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        {config.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{event.title}</span>
          <Badge variant={config.badgeVariant}>{config.label}</Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{event.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {event.projectName && (
            <span className="font-medium text-foreground">{event.projectName}</span>
          )}
          {event.projectName && event.user && <span>·</span>}
          {event.user && <span>{event.user}</span>}
          <span>·</span>
          <span>{formatRelativeTime(event.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

interface ActivityFeedProps {
  events: ActivityEvent[];
}

/**
 * Recent activity feed showing test runs, user actions, and discovered issues.
 * Supports incremental "load more" pagination.
 */
export function ActivityFeed({ events }: ActivityFeedProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const visibleEvents = events.slice(0, visibleCount);
  const hasMore = visibleCount < events.length;

  function loadMore() {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, events.length));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {visibleEvents.map((event) => (
                <ActivityFeedItem key={event.id} event={event} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-4">
                <Button variant="outline" size="sm" className="w-full" onClick={loadMore}>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Load more ({events.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
