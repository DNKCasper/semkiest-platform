import {
  triggerTestRun,
  getTestRunStatus,
  pollTestRunToCompletion,
} from './semkiest-client.js';
import type {
  TriggerTestRunOptions,
  GetTestRunStatusOptions,
  PollTestRunOptions,
  TriggerTestRunResponse,
  TestRunResult,
} from './types.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.useFakeTimers();

function makeJsonResponse<T>(body: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeResult(
  status: TestRunResult['status'] = 'passed',
): TestRunResult {
  return {
    runId: 'run-1',
    projectId: 'proj-1',
    status,
    testProfile: null,
    summary: { total: 10, passed: 10, failed: 0, skipped: 0, durationMs: 500 },
    reportUrl: 'https://semkiest.io/reports/run-1',
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:00:01.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

const triggerOpts: TriggerTestRunOptions = {
  apiUrl: 'https://api.semkiest.io',
  apiToken: 'token-abc',
  request: {
    projectId: 'proj-1',
    triggerSource: 'github_pr',
    metadata: { commitSha: 'abc123', prNumber: 5 },
  },
};

const statusOpts: GetTestRunStatusOptions = {
  apiUrl: 'https://api.semkiest.io',
  apiToken: 'token-abc',
  runId: 'run-1',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('triggerTestRun', () => {
  it('POSTs to the correct API endpoint', async () => {
    const triggered: TriggerTestRunResponse = {
      runId: 'run-1',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(makeJsonResponse(triggered));

    await triggerTestRun(triggerOpts);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.semkiest.io/api/test-runs');
  });

  it('sends projectId and triggerSource in body', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse<TriggerTestRunResponse>({
        runId: 'run-1',
        status: 'pending',
        createdAt: '',
      }),
    );

    await triggerTestRun(triggerOpts);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.projectId).toBe('proj-1');
    expect(body.triggerSource).toBe('github_pr');
  });

  it('sends Authorization header', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse<TriggerTestRunResponse>({
        runId: 'run-1',
        status: 'pending',
        createdAt: '',
      }),
    );

    await triggerTestRun(triggerOpts);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer token-abc');
  });

  it('returns the parsed response body', async () => {
    const triggered: TriggerTestRunResponse = {
      runId: 'run-42',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(makeJsonResponse(triggered));

    const result = await triggerTestRun(triggerOpts);
    expect(result.runId).toBe('run-42');
    expect(result.status).toBe('pending');
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}, 422));

    await expect(triggerTestRun(triggerOpts)).rejects.toThrow(
      'Failed to trigger test run: HTTP 422',
    );
  });
});

describe('getTestRunStatus', () => {
  it('GETs the correct API endpoint with encoded runId', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeResult()));

    await getTestRunStatus(statusOpts);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.semkiest.io/api/test-runs/run-1');
  });

  it('returns the parsed test run result', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeResult('passed')));

    const result = await getTestRunStatus(statusOpts);
    expect(result.runId).toBe('run-1');
    expect(result.status).toBe('passed');
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}, 404));

    await expect(getTestRunStatus(statusOpts)).rejects.toThrow(
      'Failed to get test run status: HTTP 404',
    );
  });
});

describe('pollTestRunToCompletion', () => {
  const pollOpts: PollTestRunOptions = {
    apiUrl: 'https://api.semkiest.io',
    apiToken: 'token-abc',
    runId: 'run-1',
    intervalMs: 1000,
    timeoutMs: 10_000,
  };

  it('returns immediately when run is already in terminal state', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(makeResult('passed')));

    const resultPromise = pollTestRunToCompletion(pollOpts);
    await jest.runAllTimersAsync();

    const result = await resultPromise;
    expect(result.status).toBe('passed');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('polls until terminal state is reached', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(makeResult('running')))
      .mockResolvedValueOnce(makeJsonResponse(makeResult('running')))
      .mockResolvedValueOnce(makeJsonResponse(makeResult('passed')));

    const resultPromise = pollTestRunToCompletion(pollOpts);
    await jest.runAllTimersAsync();

    const result = await resultPromise;
    expect(result.status).toBe('passed');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('recognises all terminal states', async () => {
    const terminalStates = ['passed', 'failed', 'cancelled', 'timeout'] as const;

    for (const state of terminalStates) {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(makeJsonResponse(makeResult(state)));

      const resultPromise = pollTestRunToCompletion(pollOpts);
      await jest.runAllTimersAsync();

      const result = await resultPromise;
      expect(result.status).toBe(state);
    }
  });

  it('throws when timeout is exceeded', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse(makeResult('running')));

    const resultPromise = pollTestRunToCompletion({
      ...pollOpts,
      timeoutMs: 0,
    });
    await jest.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow('did not complete within');
  });
});
