import { createCommitStatus, postPRComment } from './pr-check.js';
import type { PRCheckOptions, PRCommentOptions } from './types.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeOkResponse(body: unknown = {}): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body = 'API error'): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const baseCheckOptions: PRCheckOptions = {
  token: 'ghp_token123',
  owner: 'acme',
  repo: 'my-app',
  commitSha: 'abc123def456',
  state: 'success',
  description: 'All 42 tests passed',
};

const baseCommentOptions: PRCommentOptions = {
  token: 'ghp_token123',
  owner: 'acme',
  repo: 'my-app',
  prNumber: 7,
  body: '## Test results',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('createCommitStatus', () => {
  it('POSTs to the correct GitHub Statuses API URL', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await createCommitStatus(baseCheckOptions);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/acme/my-app/statuses/abc123def456',
    );
  });

  it('sends correct request body with state, context, and description', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await createCommitStatus(baseCheckOptions);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.state).toBe('success');
    expect(body.context).toBe('semkiest/test-run');
    expect(body.description).toBe('All 42 tests passed');
    expect(body.target_url).toBeUndefined();
  });

  it('includes target_url when targetUrl is provided', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await createCommitStatus({
      ...baseCheckOptions,
      targetUrl: 'https://semkiest.io/reports/run-1',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.target_url).toBe('https://semkiest.io/reports/run-1');
  });

  it('uses custom context when provided', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await createCommitStatus({
      ...baseCheckOptions,
      context: 'ci/custom-check',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.context).toBe('ci/custom-check');
  });

  it('truncates description to 140 characters', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());
    const longDescription = 'x'.repeat(200);

    await createCommitStatus({
      ...baseCheckOptions,
      description: longDescription,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.description).toHaveLength(140);
  });

  it('sends Authorization header with Bearer token', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await createCommitStatus(baseCheckOptions);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ghp_token123');
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(403, 'Forbidden'));

    await expect(createCommitStatus(baseCheckOptions)).rejects.toThrow(
      'Failed to create commit status: HTTP 403 - Forbidden',
    );
  });
});

describe('postPRComment', () => {
  it('POSTs to the correct GitHub Issues Comments URL', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await postPRComment(baseCommentOptions);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/acme/my-app/issues/7/comments',
    );
  });

  it('sends comment body in request payload', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await postPRComment(baseCommentOptions);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.body).toBe('## Test results');
  });

  it('sends Authorization header with Bearer token', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await postPRComment(baseCommentOptions);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ghp_token123');
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(404, 'Not Found'));

    await expect(postPRComment(baseCommentOptions)).rejects.toThrow(
      'Failed to post PR comment: HTTP 404 - Not Found',
    );
  });
});
