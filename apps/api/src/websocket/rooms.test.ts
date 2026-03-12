import { canAccessRoom, joinDefaultRooms, handleJoinRoom, handleLeaveRoom } from './rooms';
import type { SocketData } from '../types/websocket';

/** Creates a minimal socket mock with the given data */
function makeSocket(data: SocketData): {
  data: SocketData;
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
  rooms: Set<string>;
} {
  const socket = {
    data,
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    rooms: new Set<string>(),
  };
  return socket;
}

const memberData: SocketData = {
  userId: 'user-1',
  orgId: 'org-abc',
  role: 'member',
  projectIds: ['proj-1', 'proj-2'],
};

const adminData: SocketData = {
  userId: 'admin-1',
  orgId: 'org-abc',
  role: 'admin',
  projectIds: [],
};

// ---------------------------------------------------------------------------
// canAccessRoom
// ---------------------------------------------------------------------------
describe('canAccessRoom', () => {
  it('allows a member to access their own org room', () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccessRoom(socket as any, 'org-org-abc')).toBe(true);
  });

  it('allows a member to access a project room they belong to', () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccessRoom(socket as any, 'project-proj-1')).toBe(true);
  });

  it('denies a member access to a project they do not belong to', () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccessRoom(socket as any, 'project-proj-99')).toBe(false);
  });

  it('denies a member access to the admin room', () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccessRoom(socket as any, 'admin')).toBe(false);
  });

  it('allows a member to access test-run rooms', () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccessRoom(socket as any, 'test-run-run-123')).toBe(true);
  });

  it('allows an admin to access any room', () => {
    const socket = makeSocket(adminData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccessRoom(socket as any, 'admin')).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAccessRoom(socket as any, 'project-proj-99')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// joinDefaultRooms
// ---------------------------------------------------------------------------
describe('joinDefaultRooms', () => {
  it('joins org and project rooms for a member', async () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await joinDefaultRooms(socket as any);

    expect(socket.join).toHaveBeenCalledWith('org-org-abc');
    expect(socket.join).toHaveBeenCalledWith('project-proj-1');
    expect(socket.join).toHaveBeenCalledWith('project-proj-2');
    expect(socket.join).not.toHaveBeenCalledWith('admin');
  });

  it('additionally joins the admin room for an admin', async () => {
    const socket = makeSocket(adminData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await joinDefaultRooms(socket as any);

    expect(socket.join).toHaveBeenCalledWith('admin');
  });
});

// ---------------------------------------------------------------------------
// handleJoinRoom
// ---------------------------------------------------------------------------
describe('handleJoinRoom', () => {
  it('joins an accessible room', async () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleJoinRoom(socket as any, 'test-run-run-1');

    expect(socket.join).toHaveBeenCalledWith('test-run-run-1');
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('emits an error for an inaccessible room', async () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleJoinRoom(socket as any, 'admin');

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'ROOM_ACCESS_DENIED' }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleLeaveRoom
// ---------------------------------------------------------------------------
describe('handleLeaveRoom', () => {
  it('leaves the requested room', async () => {
    const socket = makeSocket(memberData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleLeaveRoom(socket as any, 'project-proj-1');

    expect(socket.leave).toHaveBeenCalledWith('project-proj-1');
  });
});
