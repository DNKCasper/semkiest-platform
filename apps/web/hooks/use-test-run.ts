'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createWebSocketClient, type ConnectionState, type WebSocketClient } from '../lib/websocket-client';
import { runsApi } from '../lib/api-client';
import type {
  TestRun,
  LogEntry,
  WsEvent,
  WsRunProgressPayload,
  WsAgentStatusPayload,
  WsLogEntryPayload,
  RunStatus,
} from '../types/run';

const WS_BASE_URL =
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001')
    : 'ws://localhost:3001';

/** Maximum number of log entries kept in memory. */
const MAX_LOG_ENTRIES = 1000;

const TERMINAL_STATUSES: RunStatus[] = ['completed', 'failed', 'cancelled'];

export interface UseTestRunReturn {
  run: TestRun | null;
  logs: LogEntry[];
  connectionState: ConnectionState;
  isLoading: boolean;
  error: string | null;
  cancelRun: () => Promise<void>;
  refetch: () => Promise<void>;
}

export interface UseTestRunOptions {
  projectId: string;
  runId: string | null;
  /** Optional initial run data to avoid a loading flash. */
  initialRun?: TestRun;
}

/**
 * Custom hook for subscribing to a live test run.
 *
 * - Fetches the initial run state from the REST API.
 * - Opens a WebSocket connection while the run is active.
 * - Applies real-time updates to the local state.
 * - Automatically reconnects on disconnect.
 * - Closes the WebSocket once the run reaches a terminal status.
 */
export function useTestRun({
  projectId,
  runId,
  initialRun,
}: UseTestRunOptions): UseTestRunReturn {
  const [run, setRun] = useState<TestRun | null>(initialRun ?? null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isLoading, setIsLoading] = useState(!initialRun);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<WebSocketClient | null>(null);
  const logIdRef = useRef(0);

  const isTerminal = run ? TERMINAL_STATUSES.includes(run.status) : false;

  // -------------------------------------------------------------------------
  // Fetch run data from REST API
  // -------------------------------------------------------------------------
  const refetch = useCallback(async () => {
    if (!runId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await runsApi.get(projectId, runId);
      setRun(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, runId]);

  useEffect(() => {
    if (!initialRun && runId) {
      void refetch();
    }
  }, [runId, initialRun, refetch]);

  // -------------------------------------------------------------------------
  // WebSocket subscription for active runs
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!runId || isTerminal) return;

    const wsUrl = `${WS_BASE_URL}/ws/runs/${runId}`;
    const client = createWebSocketClient({
      url: wsUrl,
      reconnectIntervalMs: 3000,
      maxReconnectAttempts: 10,
      onOpen: () => setConnectionState('connected'),
      onClose: () => setConnectionState('disconnected'),
    });

    const unsubOpen = client.on('connection:open', () => setConnectionState('connected'));
    const unsubClose = client.on('connection:close', () => setConnectionState('disconnected'));
    const unsubFailed = client.on('connection:failed', () => setConnectionState('failed'));

    // Handle all typed events via wildcard listener
    const unsubAll = client.on<WsEvent>('*', (event) => {
      if (!event || event.runId !== runId) return;

      switch (event.type) {
        case 'run:started':
        case 'run:progress':
        case 'run:completed':
        case 'run:failed':
        case 'run:cancelled': {
          const p = event.payload as WsRunProgressPayload;
          setRun((prev) =>
            prev
              ? {
                  ...prev,
                  status: p.status,
                  totalTests: p.totalTests,
                  completedTests: p.completedTests,
                  passedTests: p.passedTests,
                  failedTests: p.failedTests,
                }
              : prev,
          );
          break;
        }

        case 'agent:status': {
          const p = event.payload as WsAgentStatusPayload;
          setRun((prev) => {
            if (!prev) return prev;
            const agents = prev.agents.map((a) =>
              a.name === p.agentName
                ? {
                    ...a,
                    status: p.status,
                    progress: p.progress,
                    total: p.total,
                    message: p.message,
                    error: p.error,
                  }
                : a,
            );
            return { ...prev, agents };
          });
          break;
        }

        case 'log:entry': {
          const p = event.payload as WsLogEntryPayload;
          const entry: LogEntry = {
            id: `log-${logIdRef.current++}`,
            timestamp: event.timestamp,
            level: p.level,
            agent: p.agent,
            message: p.message,
          };
          setLogs((prev) => {
            const next = [...prev, entry];
            // Keep only the most recent MAX_LOG_ENTRIES entries
            return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
          });
          break;
        }

        default:
          break;
      }
    });

    clientRef.current = client;
    client.connect();

    return () => {
      unsubAll();
      unsubOpen();
      unsubClose();
      unsubFailed();
      client.disconnect();
      clientRef.current = null;
    };
    // Re-subscribe only when runId changes or the run becomes terminal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, isTerminal]);

  // -------------------------------------------------------------------------
  // Cancel action
  // -------------------------------------------------------------------------
  const cancelRun = useCallback(async () => {
    if (!runId) return;
    try {
      await runsApi.cancel(projectId, runId);
      setRun((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel run');
    }
  }, [projectId, runId]);

  return { run, logs, connectionState, isLoading, error, cancelRun, refetch };
}
