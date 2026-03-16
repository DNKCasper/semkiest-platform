'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RunUpdateMessage, LiveTestResult, RunStatus, RunSummary } from '../types/run';

const WS_BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_WS_URL ?? `ws://${window.location.hostname}:3001`)
    : 'ws://localhost:3001';

export interface UseRunWebSocketReturn {
  isConnected: boolean;
  latestResults: LiveTestResult[];
  runStatus: RunStatus | null;
  runSummary: RunSummary | null;
}

/**
 * Connects to the run's WebSocket endpoint and streams real-time result updates.
 * Gracefully handles unavailable connections (e.g., run already complete).
 */
export function useRunWebSocket(runId: string): UseRunWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [latestResults, setLatestResults] = useState<LiveTestResult[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (typeof WebSocket === 'undefined') return;

    try {
      const ws = new WebSocket(`${WS_BASE_URL}/api/runs/${runId}/updates`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as RunUpdateMessage;
          switch (message.type) {
            case 'run.status':
              setRunStatus(message.status);
              break;
            case 'run.result':
              setLatestResults((prev) => {
                const idx = prev.findIndex((r) => r.id === message.result.id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = message.result;
                  return updated;
                }
                return [...prev, message.result];
              });
              break;
            case 'run.summary':
              setRunSummary(message.summary);
              break;
            case 'run.complete':
              setRunStatus(message.run.status);
              setRunSummary(message.run.summary);
              break;
            default:
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };
    } catch {
      // WebSocket construction failed — connection unavailable
    }
  }, [runId]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected, latestResults, runStatus, runSummary };
}
