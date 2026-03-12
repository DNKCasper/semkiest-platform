/**
 * Socket event handlers.
 * Wires up all client-to-server events and manages the connection lifecycle.
 */

import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  JoinRoomPayload,
  LeaveRoomPayload,
  ServerToClientEvents,
  SocketData,
} from '../types/websocket';
import { WebSocketEvents } from './events';
import { joinDefaultRooms, handleJoinRoom, handleLeaveRoom } from './rooms';

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Interval between server-initiated heartbeat pongs (ms) */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Emits a standardised error event to the socket.
 */
function emitError(socket: AppSocket, code: string, message: string): void {
  socket.emit(WebSocketEvents.ERROR, {
    code,
    message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Registers all event listeners on a newly connected socket.
 * Called once per connection from the `connection` handler in websocket/index.ts.
 */
export function registerSocketHandlers(
  _io: AppServer,
  socket: AppSocket,
): void {
  // Auto-join org, project and (if admin) admin rooms
  joinDefaultRooms(socket).catch(() => {
    emitError(socket, 'ROOM_JOIN_ERROR', 'Failed to join default rooms');
  });

  // Server-side heartbeat – sends a pong at a fixed interval so clients can
  // detect a dead connection without waiting for the next client message.
  const heartbeatTimer = setInterval(() => {
    if (!socket.connected) {
      clearInterval(heartbeatTimer);
      return;
    }
    socket.emit(WebSocketEvents.PONG);
  }, HEARTBEAT_INTERVAL_MS);

  // Respond to explicit client pings
  socket.on(WebSocketEvents.PING, () => {
    socket.emit(WebSocketEvents.PONG);
  });

  // Room subscription management
  socket.on(WebSocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
    if (typeof payload?.room !== 'string' || payload.room.trim() === '') {
      emitError(socket, 'INVALID_PAYLOAD', 'join-room requires a non-empty room string');
      return;
    }
    handleJoinRoom(socket, payload.room).catch(() => {
      emitError(socket, 'ROOM_JOIN_ERROR', `Failed to join room: ${payload.room}`);
    });
  });

  socket.on(WebSocketEvents.LEAVE_ROOM, (payload: LeaveRoomPayload) => {
    if (typeof payload?.room !== 'string' || payload.room.trim() === '') {
      emitError(socket, 'INVALID_PAYLOAD', 'leave-room requires a non-empty room string');
      return;
    }
    handleLeaveRoom(socket, payload.room).catch(() => {
      emitError(socket, 'ROOM_LEAVE_ERROR', `Failed to leave room: ${payload.room}`);
    });
  });

  // Cleanup on disconnect – socket.io removes room memberships automatically,
  // but we clear the heartbeat timer to avoid memory leaks.
  socket.on('disconnect', (_reason: string) => {
    clearInterval(heartbeatTimer);
  });
}
