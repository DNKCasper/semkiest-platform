import { AsanaClient, AsanaApiError } from './asana-client';
import type { AsanaTask, AsanaTag } from './types';

// ─── fetch mock helpers ────────────────────────────────────────────────────────

function mockFetch(
  data: unknown,
  status = 200,
  ok = true,
): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: jest.fn().mockResolvedValue(ok ? { data } : data),
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function mockFetchError(
  errors: { message: string }[],
  status = 400,
): jest.Mock {
  return mockFetch({ errors }, status, false);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const TOKEN = 'test-pat-token';

describe('AsanaClient constructor', () => {
  it('throws when accessToken is empty', () => {
    expect(() => new AsanaClient('')).toThrow('accessToken must not be empty');
  });

  it('creates an instance with a valid token', () => {
    expect(() => new AsanaClient(TOKEN)).not.toThrow();
  });
});

describe('AsanaClient.createTask', () => {
  it('calls POST /tasks with wrapped data body', async () => {
    const fakeTask: Partial<AsanaTask> = {
      gid: '123',
      name: '[P0] Bug: test',
      notes: 'details',
      resource_type: 'task',
    };
    const mock = mockFetch(fakeTask);

    const client = new AsanaClient(TOKEN);
    const result = await client.createTask({
      name: '[P0] Bug: test',
      notes: 'details',
      projects: ['proj-1'],
      memberships: [{ project: 'proj-1' }],
    });

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, options] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/tasks');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toMatchObject({
      data: { name: '[P0] Bug: test' },
    });
    expect(result.gid).toBe('123');
  });

  it('throws AsanaApiError on non-2xx response', async () => {
    mockFetchError([{ message: 'Invalid request' }]);

    const client = new AsanaClient(TOKEN);
    await expect(
      client.createTask({
        name: 'x',
        notes: '',
        projects: [],
        memberships: [],
      }),
    ).rejects.toBeInstanceOf(AsanaApiError);
  });

  it('AsanaApiError includes status code', async () => {
    mockFetchError([{ message: 'Not found' }], 404);

    const client = new AsanaClient(TOKEN);
    try {
      await client.getTask('nonexistent');
    } catch (err) {
      expect(err).toBeInstanceOf(AsanaApiError);
      expect((err as AsanaApiError).statusCode).toBe(404);
    }
  });
});

describe('AsanaClient.addTagToTask', () => {
  it('calls POST /tasks/:gid/addTag', async () => {
    const mock = mockFetch({});

    const client = new AsanaClient(TOKEN);
    await client.addTagToTask('task-1', 'tag-1');

    const [url, options] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/tasks/task-1/addTag');
    expect(options.method).toBe('POST');
  });
});

describe('AsanaClient.getTags', () => {
  it('calls GET /tags with workspace query param', async () => {
    const fakeTags: Partial<AsanaTag>[] = [
      { gid: 't1', name: '[BUG] Critical' },
    ];
    const mock = mockFetch(fakeTags);

    const client = new AsanaClient(TOKEN);
    const tags = await client.getTags('ws-1');

    const [url] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/tags');
    expect(url).toContain('workspace=ws-1');
    expect(tags).toHaveLength(1);
    expect(tags[0]?.name).toBe('[BUG] Critical');
  });
});

describe('AsanaClient.createTag', () => {
  it('calls POST /tags with workspace and color', async () => {
    const fakeTag: Partial<AsanaTag> = {
      gid: 'new-tag',
      name: '[BUG] High',
      color: 'dark-orange',
    };
    const mock = mockFetch(fakeTag);

    const client = new AsanaClient(TOKEN);
    const tag = await client.createTag('ws-1', '[BUG] High', 'dark-orange');

    const [, options] = mock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toMatchObject({
      data: {
        name: '[BUG] High',
        color: 'dark-orange',
        workspace: { gid: 'ws-1' },
      },
    });
    expect(tag.name).toBe('[BUG] High');
  });
});

describe('AsanaClient.getProjects', () => {
  it('calls GET /projects with workspace param', async () => {
    const mock = mockFetch([{ gid: 'p1', name: 'My Project' }]);

    const client = new AsanaClient(TOKEN);
    await client.getProjects('ws-1');

    const [url] = mock.mock.calls[0] as [string];
    expect(url).toContain('/projects');
    expect(url).toContain('workspace=ws-1');
  });
});

describe('AsanaClient.getSections', () => {
  it('calls GET /projects/:gid/sections', async () => {
    const mock = mockFetch([{ gid: 's1', name: 'Bugs' }]);

    const client = new AsanaClient(TOKEN);
    await client.getSections('proj-1');

    const [url] = mock.mock.calls[0] as [string];
    expect(url).toContain('/projects/proj-1/sections');
  });
});
