/**
 * Room management utilities.
 * Handles auto-joining default rooms on connection and access-controlled
 * join/leave requests from clients.
 */

import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../types/websocket';
import { RoomNames } from './events';

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Determines whether a socket is allowed to subscribe to a given room.
 *
 * Admins can join any room.
 * Members can join:
 *  - Their own org room
 *  - Project rooms for projects they belong to
 *  - Test-run rooms (run-level access is checked at the application layer)
 */
export function canAccessRoom(socket: AppSocket, room: string): boolean {
  const { orgId, role, projectIds } = socket.data;

  if (role === 'admin') {
    return true;
  }

  if (room === RoomNames.org(orgId)) {
    return true;
  }

  if (room === RoomNames.admin()) {
    return false;
  }

  if (room.startsWith('project-')) {
    const projectId = room.slice('project-'.length);
    return projectIds.includes(projectId);
  }

  // Allow test-run rooms; deeper auth is enforced when the run is created
  if (room.startsWith('test-run-')) {
    return true;
  }

  return false;
}

/**
 * Subscribes the socket to all rooms it should be in by default:
 *  - Its organisation room
 *  - All project rooms it has access to
 *  - The admin room (admin role only)
 */
export async function joinDefaultRooms(socket: AppSocket): Promise<void> {
  const { orgId, role, projectIds } = socket.data;

  await socket.join(RoomNames.org(orgId));

  for (const projectId of projectIds) {
    await socket.join(RoomNames.project(projectId));
  }

  if (role === 'admin') {
    await socket.join(RoomNames.admin());
  }
}

/**
 * Handles a client request to join a specific room.
 * Emits an error event if access is denied.
 */
export async function handleJoinRoom(socket: AppSocket, room: string): Promise<void> {
  if (!canAccessRoom(socket, room)) {
    socket.emit('error', {
      code: 'ROOM_ACCESS_DENIED',
      message: `Access denied to room: ${room}`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  await socket.join(room);
}

/**
 * Handles a client request to leave a specific room.
 */
export async function handleLeaveRoom(socket: AppSocket, room: string): Promise<void> {
  await socket.leave(room);
}
