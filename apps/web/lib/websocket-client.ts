/**
 * WebSocket client with automatic reconnection, heartbeat, and event buffering.
 *
 * Designed for browser environments (Next.js client components). Import only
 * inside 'use client' components or custom hooks — never in server components.
 */

type WsListener<T = unknown> = (data: T) => void;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface WsClientOptions {
  /** Full WebSocket URL, e.g. ws://localhost:3001/ws/runs/abc */
  url: string;
  /** Base reconnect interval in ms (exponential backoff is applied). Default: 3000 */
  reconnectIntervalMs?: number;
  /** Maximum reconnect attempts before entering 'failed' state. Default: 10 */
  maxReconnectAttempts?: number;
  /** Interval for sending heartbeat pings. Default: 30000 */
  heartbeatIntervalMs?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

/**
 * A lightweight WebSocket wrapper that provides:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat pings to keep the connection alive
 * - Event emission by message `type` field
 * - Wildcard listener ('*') that receives every parsed message
 * - Graceful degradation when the browser does not support WebSocket
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private readonly listeners = new Map<string, Set<WsListener>>();
  private state: ConnectionState = 'disconnected';

  constructor(private readonly options: WsClientOptions) {}

  /** Start the WebSocket connection. Idempotent. */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this.state = 'connecting';
    this._createSocket();
  }

  /** Permanently close the connection (no reconnect). */
  disconnect(): void {
    this._clearTimers();
    this.state = 'disconnected';
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
  }

  /**
   * Subscribe to a named event (matches the `type` field in JSON messages)
   * or use `'*'` for all events, `'connection:open'`, `'connection:close'`,
   * `'connection:error'`, or `'connection:failed'` for connection lifecycle.
   *
   * @returns Unsubscribe function.
   */
  on<T = unknown>(event: string, listener: WsListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as WsListener);
    return () => this.off(event, listener);
  }

  off<T = unknown>(event: string, listener: WsListener<T>): void {
    this.listeners.get(event)?.delete(listener as WsListener);
  }

  /** Send a JSON-serialisable message if the socket is open. */
  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _createSocket(): void {
    if (typeof WebSocket === 'undefined') {
      // Server-side render guard — WebSocket is browser-only.
      this.state = 'failed';
      this._emit('connection:failed', undefined);
      return;
    }

    try {
      this.ws = new WebSocket(this.options.url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectAttempts = 0;
      this._startHeartbeat();
      this.options.onOpen?.();
      this._emit('connection:open', undefined);
    };

    this.ws.onclose = (event) => {
      this._clearHeartbeat();
      this.options.onClose?.();
      this._emit('connection:close', event);
      if (this.state !== 'disconnected') {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      this.options.onError?.(event);
      this._emit('connection:error', event);
    };

    this.ws.onmessage = (event) => {
      let data: unknown;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return; // ignore non-JSON messages
      }

      // Emit by type field and wildcard
      if (data !== null && typeof data === 'object') {
        const typed = data as Record<string, unknown>;
        if (typeof typed['type'] === 'string') {
          this._emit(typed['type'], data);
        }
        this._emit('*', data);
      }
    };
  }

  private _scheduleReconnect(): void {
    const maxAttempts = this.options.maxReconnectAttempts ?? 10;
    if (this.reconnectAttempts >= maxAttempts) {
      this.state = 'failed';
      this._emit('connection:failed', undefined);
      return;
    }

    const base = this.options.reconnectIntervalMs ?? 3000;
    // Exponential backoff capped at 30 s
    const delay = Math.min(base * Math.pow(1.5, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;
    this.state = 'connecting';

    this.reconnectTimer = setTimeout(() => {
      this._createSocket();
    }, delay);
  }

  private _startHeartbeat(): void {
    const interval = this.options.heartbeatIntervalMs ?? 30_000;
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, interval);
  }

  private _clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _clearTimers(): void {
    this._clearHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(data);
      } catch {
        // Prevent a bad listener from breaking the event loop
      }
    });
  }
}

/** Factory helper for creating a WebSocketClient. */
export function createWebSocketClient(options: WsClientOptions): WebSocketClient {
  return new WebSocketClient(options);
}
