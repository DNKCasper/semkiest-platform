import { AsanaStatusSync } from '../status-sync';
import { AsanaClient } from '../client';
import { TestResult } from '../types';

jest.mock('../client');

const MockedAsanaClient = AsanaClient as jest.MockedClass<typeof AsanaClient>;

const makeResult = (overrides: Partial<TestResult> = {}): TestResult => ({
  testName: 'Login redirects to dashboard',
  status: 'passed',
  timestamp: new Date('2024-06-01T12:00:00.000Z'),
  ...overrides,
});

describe('AsanaStatusSync', () => {
  let sync: AsanaStatusSync;
  let mockPost: jest.Mock;
  let mockPut: jest.Mock;

  beforeEach(() => {
    MockedAsanaClient.mockClear();
    sync = new AsanaStatusSync({ accessToken: 'test-token' });
    const instance = MockedAsanaClient.mock.instances[0];
    mockPost = instance?.post as jest.Mock;
    mockPut = instance?.put as jest.Mock;
  });

  describe('updateTaskStatus', () => {
    it('calls addTask on the section endpoint', async () => {
      mockPost.mockResolvedValueOnce({});

      await sync.updateTaskStatus('task-1', 'section-2');

      expect(mockPost).toHaveBeenCalledWith('/sections/section-2/addTask', { task: 'task-1' });
    });
  });

  describe('completeTask', () => {
    it('sets completed=true by default', async () => {
      mockPut.mockResolvedValueOnce({});

      await sync.completeTask('task-1');

      expect(mockPut).toHaveBeenCalledWith('/tasks/task-1', { completed: true });
    });

    it('sets completed=false when explicitly passed', async () => {
      mockPut.mockResolvedValueOnce({});

      await sync.completeTask('task-1', false);

      expect(mockPut).toHaveBeenCalledWith('/tasks/task-1', { completed: false });
    });
  });

  describe('updateCustomField', () => {
    it('calls the task endpoint with the custom_fields map', async () => {
      mockPut.mockResolvedValueOnce({});

      await sync.updateCustomField('task-1', 'cf-gid', 'enum-gid');

      expect(mockPut).toHaveBeenCalledWith('/tasks/task-1', {
        custom_fields: { 'cf-gid': 'enum-gid' },
      });
    });
  });

  describe('addTestResultComment', () => {
    it('posts a story with formatted comment text', async () => {
      const story = { gid: 's1', text: 'comment', created_at: '', created_by: { gid: 'u1', name: 'Bot', email: '' }, type: 'comment' };
      mockPost.mockResolvedValueOnce(story);

      const result = await sync.addTestResultComment('task-1', makeResult());

      expect(mockPost).toHaveBeenCalledWith(
        '/tasks/task-1/stories',
        expect.objectContaining({ text: expect.stringContaining('PASSED') }),
      );
      expect(result).toEqual(story);
    });

    it('includes error details in the comment when test failed', async () => {
      mockPost.mockResolvedValueOnce({});

      await sync.addTestResultComment(
        'task-1',
        makeResult({ status: 'failed', error: 'AssertionError: expected true' }),
      );

      const posted = mockPost.mock.calls[0]?.[1] as { text: string };
      expect(posted.text).toContain('AssertionError: expected true');
    });

    it('includes duration when provided', async () => {
      mockPost.mockResolvedValueOnce({});

      await sync.addTestResultComment('task-1', makeResult({ duration: 320 }));

      const posted = mockPost.mock.calls[0]?.[1] as { text: string };
      expect(posted.text).toContain('320ms');
    });
  });

  describe('syncTestResult', () => {
    it('posts comment and completes task when test passed', async () => {
      mockPost.mockResolvedValue({});
      mockPut.mockResolvedValue({});

      await sync.syncTestResult('task-1', makeResult({ status: 'passed' }), []);

      expect(mockPost).toHaveBeenCalledWith('/tasks/task-1/stories', expect.any(Object));
      expect(mockPut).toHaveBeenCalledWith('/tasks/task-1', { completed: true });
    });

    it('moves task to matching section when section mapping exists', async () => {
      mockPost.mockResolvedValue({});
      mockPut.mockResolvedValue({});

      await sync.syncTestResult(
        'task-1',
        makeResult({ status: 'failed' }),
        [],
        [{ testStatus: 'failed', sectionId: 'section-failed' }],
      );

      expect(mockPost).toHaveBeenCalledWith('/sections/section-failed/addTask', { task: 'task-1' });
    });

    it('does not move section when no mapping matches', async () => {
      mockPost.mockResolvedValue({});

      await sync.syncTestResult(
        'task-1',
        makeResult({ status: 'skipped' }),
        [],
        [{ testStatus: 'failed', sectionId: 'section-failed' }],
      );

      // Only the comment post, not the section addTask
      const sectionCalls = mockPost.mock.calls.filter(([path]) =>
        (path as string).includes('/sections/'),
      );
      expect(sectionCalls).toHaveLength(0);
    });
  });
});
