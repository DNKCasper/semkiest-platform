import { BugReporter } from './bug-reporter';
import { AsanaClient } from './asana-client';
import { encryptToken } from './encryption';
import type { FailedTestResult, AsanaTask, AsanaTag } from './types';

// ─── Mock AsanaClient ──────────────────────────────────────────────────────────

jest.mock('./asana-client');

const MockAsanaClient = AsanaClient as jest.MockedClass<typeof AsanaClient>;

const FAKE_TASK: AsanaTask = {
  gid: 'task-001',
  name: '[P1] Bug: login fails',
  notes: 'details',
  resource_type: 'task',
  assignee: null,
  projects: [],
  tags: [],
  memberships: [],
  created_at: '2024-01-01T00:00:00.000Z',
  modified_at: '2024-01-01T00:00:00.000Z',
};

const EXISTING_TAG: AsanaTag = {
  gid: 'tag-high',
  name: '[BUG] High',
  color: 'dark-orange',
  resource_type: 'tag',
};

function buildMockClient(overrides: Partial<{
  createTask: jest.Mock;
  addTagToTask: jest.Mock;
  getTags: jest.Mock;
  createTag: jest.Mock;
  addAttachment: jest.Mock;
}> = {}) {
  const proto = MockAsanaClient.prototype;
  proto.createTask = overrides.createTask ?? jest.fn().mockResolvedValue(FAKE_TASK);
  proto.addTagToTask = overrides.addTagToTask ?? jest.fn().mockResolvedValue(undefined);
  proto.getTags = overrides.getTags ?? jest.fn().mockResolvedValue([EXISTING_TAG]);
  proto.createTag = overrides.createTag ?? jest.fn().mockResolvedValue(EXISTING_TAG);
  proto.addAttachment = overrides.addAttachment ?? jest.fn().mockResolvedValue({ gid: 'att-1' });
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  accessToken: 'test-pat',
  workspaceGid: 'ws-1',
  projectGid: 'proj-1',
};

const BASE_RESULT: FailedTestResult = {
  testName: 'login fails',
  suiteName: 'Auth',
  errorMessage: 'Expected redirect',
  severity: 'high',
  testRunId: 'run-001',
  timestamp: new Date('2024-01-15T00:00:00.000Z'),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  MockAsanaClient.mockClear();
  buildMockClient();
});

describe('BugReporter constructor', () => {
  it('accepts a plaintext accessToken', () => {
    expect(() => new BugReporter(BASE_CONFIG)).not.toThrow();
  });

  it('accepts an encryptedToken + encryptionKey', () => {
    const key = 'encryption-key-that-is-32-chars!';
    const encryptedToken = encryptToken('real-pat', key);
    expect(
      () =>
        new BugReporter({
          encryptedToken,
          encryptionKey: key,
          workspaceGid: 'ws-1',
          projectGid: 'proj-1',
        }),
    ).not.toThrow();
  });

  it('throws when neither accessToken nor encryptedToken is provided', () => {
    expect(
      () =>
        new BugReporter({ workspaceGid: 'ws-1', projectGid: 'proj-1' }),
    ).toThrow(/accessToken/);
  });
});

describe('BugReporter.reportFailedTest', () => {
  it('calls createTask with correct name and notes', async () => {
    const reporter = new BugReporter(BASE_CONFIG);
    await reporter.reportFailedTest(BASE_RESULT);

    const createTaskMock = MockAsanaClient.prototype.createTask as jest.Mock;
    expect(createTaskMock).toHaveBeenCalledTimes(1);
    const [input] = createTaskMock.mock.calls[0] as [{ name: string; notes: string }];
    expect(input.name).toBe('[P1] Bug: login fails');
    expect(input.notes).toContain('login fails');
    expect(input.notes).toContain('Auth');
    expect(input.notes).toContain('HIGH');
  });

  it('passes the project GID in memberships', async () => {
    const reporter = new BugReporter(BASE_CONFIG);
    await reporter.reportFailedTest(BASE_RESULT);

    const createTaskMock = MockAsanaClient.prototype.createTask as jest.Mock;
    const [input] = createTaskMock.mock.calls[0] as [{ memberships: { project: string }[] }];
    expect(input.memberships[0]?.project).toBe('proj-1');
  });

  it('includes sectionGid in membership when configured', async () => {
    const reporter = new BugReporter({ ...BASE_CONFIG, sectionGid: 'sec-1' });
    await reporter.reportFailedTest(BASE_RESULT);

    const createTaskMock = MockAsanaClient.prototype.createTask as jest.Mock;
    const [input] = createTaskMock.mock.calls[0] as [{ memberships: { project: string; section?: string }[] }];
    expect(input.memberships[0]?.section).toBe('sec-1');
  });

  it('uses per-test assignee over config assignee', async () => {
    const reporter = new BugReporter({
      ...BASE_CONFIG,
      assigneeGid: 'config-user',
    });
    await reporter.reportFailedTest({
      ...BASE_RESULT,
      assigneeGid: 'test-user',
    });

    const createTaskMock = MockAsanaClient.prototype.createTask as jest.Mock;
    const [input] = createTaskMock.mock.calls[0] as [{ assignee?: string }];
    expect(input.assignee).toBe('test-user');
  });

  it('returns the created task', async () => {
    const reporter = new BugReporter(BASE_CONFIG);
    const task = await reporter.reportFailedTest(BASE_RESULT);
    expect(task.gid).toBe('task-001');
  });

  it('reuses an existing tag instead of creating a new one', async () => {
    buildMockClient({ getTags: jest.fn().mockResolvedValue([EXISTING_TAG]) });

    const reporter = new BugReporter(BASE_CONFIG);
    await reporter.reportFailedTest(BASE_RESULT);

    expect(MockAsanaClient.prototype.createTag).not.toHaveBeenCalled();
    expect(MockAsanaClient.prototype.addTagToTask).toHaveBeenCalledWith(
      FAKE_TASK.gid,
      EXISTING_TAG.gid,
    );
  });

  it('creates a new tag when none exists', async () => {
    const newTag: AsanaTag = { gid: 'new-tag', name: '[BUG] High', color: 'dark-orange', resource_type: 'tag' };
    buildMockClient({
      getTags: jest.fn().mockResolvedValue([]),
      createTag: jest.fn().mockResolvedValue(newTag),
    });

    const reporter = new BugReporter(BASE_CONFIG);
    await reporter.reportFailedTest(BASE_RESULT);

    expect(MockAsanaClient.prototype.createTag).toHaveBeenCalledWith(
      'ws-1',
      '[BUG] High',
      'dark-orange',
    );
  });

  it('attaches screenshots and artifacts to the task', async () => {
    const reporter = new BugReporter(BASE_CONFIG);
    await reporter.reportFailedTest({
      ...BASE_RESULT,
      screenshots: [
        { name: 'screen.png', data: Buffer.from('img'), mimeType: 'image/png' },
      ],
      artifacts: [
        { name: 'trace.har', data: Buffer.from('{}'), mimeType: 'application/json' },
      ],
    });

    expect(MockAsanaClient.prototype.addAttachment).toHaveBeenCalledTimes(2);
  });

  it('does not throw when an attachment upload fails', async () => {
    buildMockClient({
      addAttachment: jest.fn().mockRejectedValue(new Error('upload failed')),
    });

    const reporter = new BugReporter(BASE_CONFIG);
    await expect(
      reporter.reportFailedTest({
        ...BASE_RESULT,
        screenshots: [
          {
            name: 'fail.png',
            data: Buffer.from('img'),
            mimeType: 'image/png',
          },
        ],
      }),
    ).resolves.toBeDefined();
  });
});
