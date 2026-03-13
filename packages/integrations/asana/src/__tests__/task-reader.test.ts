import { AsanaTaskReader } from '../task-reader';
import { AsanaClient } from '../client';
import { AsanaTask } from '../types';

jest.mock('../client');

const MockedAsanaClient = AsanaClient as jest.MockedClass<typeof AsanaClient>;

const makeTask = (overrides: Partial<AsanaTask> = {}): AsanaTask => ({
  gid: 'task-1',
  name: 'Login button should redirect to dashboard',
  notes: '',
  completed: false,
  due_on: null,
  assignee: null,
  projects: [],
  memberships: [],
  custom_fields: [],
  tags: [],
  created_at: '2024-01-01T00:00:00.000Z',
  modified_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('AsanaTaskReader', () => {
  let reader: AsanaTaskReader;
  let mockGet: jest.Mock;

  beforeEach(() => {
    MockedAsanaClient.mockClear();
    reader = new AsanaTaskReader({ accessToken: 'test-token' });
    mockGet = MockedAsanaClient.mock.instances[0]?.get as jest.Mock;
  });

  describe('getTask', () => {
    it('fetches a task by GID', async () => {
      const task = makeTask();
      mockGet.mockResolvedValueOnce(task);

      const result = await reader.getTask('task-1');

      expect(mockGet).toHaveBeenCalledWith('/tasks/task-1', expect.objectContaining({ opt_fields: expect.any(String) }));
      expect(result).toEqual(task);
    });
  });

  describe('getProjectTasks', () => {
    it('fetches all tasks for a project', async () => {
      const tasks = [makeTask({ gid: 'task-1' }), makeTask({ gid: 'task-2' })];
      mockGet.mockResolvedValueOnce(tasks);

      const result = await reader.getProjectTasks('project-1');

      expect(mockGet).toHaveBeenCalledWith('/projects/project-1/tasks', expect.objectContaining({ opt_fields: expect.any(String) }));
      expect(result).toHaveLength(2);
    });
  });

  describe('getTaskWithSubtasks', () => {
    it('returns task merged with subtasks array', async () => {
      const task = makeTask();
      const subtasks = [makeTask({ gid: 'sub-1', name: 'Subtask' })];
      mockGet
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(subtasks);

      const result = await reader.getTaskWithSubtasks('task-1');

      expect(result.subtasks).toEqual(subtasks);
      expect(result.gid).toBe('task-1');
    });
  });

  describe('extractTestCaseInfo', () => {
    it('maps task fields to ExtractedTestCase', () => {
      const task = makeTask({
        tags: [{ gid: 't1', name: 'regression' }],
      });

      const extracted = reader.extractTestCaseInfo(task);

      expect(extracted.title).toBe(task.name);
      expect(extracted.asanaTaskId).toBe(task.gid);
      expect(extracted.tags).toEqual(['regression']);
      expect(extracted.priority).toBe('medium');
    });

    it('parses numbered steps from notes', () => {
      const task = makeTask({
        notes: '1. Open the app\n2. Click login\n3. Enter credentials',
      });

      const extracted = reader.extractTestCaseInfo(task);

      expect(extracted.steps).toEqual(['Open the app', 'Click login', 'Enter credentials']);
    });

    it('parses steps from a labelled section', () => {
      const task = makeTask({
        notes: 'Steps:\nGo to login page\nFill in credentials\nClick submit\n\nExpected result:\nUser is redirected',
      });

      const extracted = reader.extractTestCaseInfo(task);

      expect(extracted.steps).toContain('Go to login page');
    });

    it('parses expected result from notes', () => {
      const task = makeTask({
        notes: 'Some description\n\nExpected result:\nUser sees the dashboard',
      });

      const extracted = reader.extractTestCaseInfo(task);

      expect(extracted.expectedResult).toBe('User sees the dashboard');
    });

    it('returns high priority for urgent custom field', () => {
      const task = makeTask({
        custom_fields: [
          {
            gid: 'cf-1',
            name: 'Priority',
            type: 'enum',
            enum_value: { gid: 'ev-1', name: 'Urgent', color: 'red' },
            text_value: null,
            number_value: null,
          },
        ],
      });

      expect(reader.extractTestCaseInfo(task).priority).toBe('high');
    });

    it('returns low priority for minor custom field', () => {
      const task = makeTask({
        custom_fields: [
          {
            gid: 'cf-1',
            name: 'Priority',
            type: 'enum',
            enum_value: { gid: 'ev-1', name: 'Minor', color: 'green' },
            text_value: null,
            number_value: null,
          },
        ],
      });

      expect(reader.extractTestCaseInfo(task).priority).toBe('low');
    });

    it('returns high priority from tag names', () => {
      const task = makeTask({
        tags: [{ gid: 't1', name: 'p0' }],
      });

      expect(reader.extractTestCaseInfo(task).priority).toBe('high');
    });

    it('returns empty steps when notes have no structured content', () => {
      const task = makeTask({ notes: 'Just a plain description.' });
      expect(reader.extractTestCaseInfo(task).steps).toEqual([]);
    });
  });

  describe('fetchAndExtract', () => {
    it('fetches a task and returns extracted test case info', async () => {
      const task = makeTask({ name: 'My Test Case' });
      mockGet.mockResolvedValueOnce(task);

      const result = await reader.fetchAndExtract('task-1');

      expect(result.title).toBe('My Test Case');
    });
  });

  describe('extractProjectTestCases', () => {
    it('returns an array of extracted test cases for all project tasks', async () => {
      const tasks = [makeTask({ gid: 't1', name: 'Case A' }), makeTask({ gid: 't2', name: 'Case B' })];
      mockGet.mockResolvedValueOnce(tasks);

      const result = await reader.extractProjectTestCases('project-1');

      expect(result).toHaveLength(2);
      expect(result[0]?.title).toBe('Case A');
    });
  });
});
