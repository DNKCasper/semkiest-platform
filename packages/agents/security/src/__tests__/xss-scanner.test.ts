import {
  scanUrlParametersForXss,
  extractFormInputNames,
} from '../xss-scanner';
import type { HttpResponse } from '../types';

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return {
    status: 200,
    headers: {},
    body: '<html><body>No reflection here</body></html>',
    url: 'https://example.com',
    ...overrides,
  };
}

describe('scanUrlParametersForXss', () => {
  it('returns no findings for a URL with no query parameters', async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeResponse());
    const findings = await scanUrlParametersForXss(
      'https://example.com',
      mockFetch,
    );
    expect(findings).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns no findings when payloads are not reflected', async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeResponse());
    const findings = await scanUrlParametersForXss(
      'https://example.com/search?q=test',
      mockFetch,
    );
    expect(findings).toHaveLength(0);
  });

  it('reports high finding when XSS payload is reflected in response', async () => {
    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      // Reflect the query param value directly in the response body
      const value = new URL(url).searchParams.get('q') ?? '';
      return makeResponse({ body: `<html><body>${value}</body></html>` });
    });

    const findings = await scanUrlParametersForXss(
      'https://example.com/search?q=test',
      mockFetch,
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].id).toBe('XSS-URL-PARAM-Q');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].category).toBe('XSS');
  });

  it('includes remediation guidance in findings', async () => {
    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      const value = new URL(url).searchParams.get('q') ?? '';
      return makeResponse({ body: `<html>${value}</html>` });
    });

    const findings = await scanUrlParametersForXss(
      'https://example.com?q=test',
      mockFetch,
    );

    expect(findings[0].remediation).toBeTruthy();
  });

  it('scans multiple URL parameters independently', async () => {
    const reflectedParams = new Set<string>();
    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      // Only reflect the 'search' param, not 'page'
      const search = parsed.searchParams.get('search') ?? '';
      const body = search.includes('xss-probe-semkiest')
        ? `<html>${search}</html>`
        : '<html>No reflection</html>';
      return makeResponse({ body });
    });

    await scanUrlParametersForXss(
      'https://example.com?search=foo&page=1',
      mockFetch,
    );

    // Should have called fetch with payloads for both params
    expect(mockFetch).toHaveBeenCalled();
    const calledUrls: string[] = mockFetch.mock.calls.map(
      (c: [string]) => c[0],
    );
    const searchCalls = calledUrls.filter((u) =>
      new URL(u).searchParams.get('search')?.includes('xss-probe-semkiest'),
    );
    expect(searchCalls.length).toBeGreaterThan(0);
  });

  it('skips parameters when fetch throws', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const findings = await scanUrlParametersForXss(
      'https://example.com?q=test',
      mockFetch,
    );
    expect(findings).toHaveLength(0);
  });

  it('reports at most one finding per parameter (stops after first hit)', async () => {
    let callCount = 0;
    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      callCount++;
      const value = new URL(url).searchParams.get('q') ?? '';
      // Always reflect the payload
      return makeResponse({ body: `<html>${value}</html>` });
    });

    const findings = await scanUrlParametersForXss(
      'https://example.com?q=test',
      mockFetch,
    );

    // Only one finding per parameter even though multiple payloads were tried
    const qFindings = findings.filter((f) => f.id === 'XSS-URL-PARAM-Q');
    expect(qFindings.length).toBe(1);
  });
});

describe('extractFormInputNames', () => {
  it('returns empty array for HTML with no inputs', () => {
    expect(extractFormInputNames('<html><body><p>Hello</p></body></html>')).toEqual([]);
  });

  it('extracts input names from standard form inputs', () => {
    const html = `
      <form>
        <input type="text" name="username" />
        <input type="password" name="password" />
        <input type="submit" value="Login" />
      </form>
    `;
    expect(extractFormInputNames(html)).toEqual(['username', 'password']);
  });

  it('extracts textarea names', () => {
    const html = '<textarea name="comment"></textarea>';
    expect(extractFormInputNames(html)).toContain('comment');
  });

  it('extracts select names', () => {
    const html = '<select name="country"><option>US</option></select>';
    expect(extractFormInputNames(html)).toContain('country');
  });

  it('deduplicates repeated input names', () => {
    const html = `
      <input name="email" />
      <input name="email" />
    `;
    const names = extractFormInputNames(html);
    expect(names.filter((n) => n === 'email')).toHaveLength(1);
  });

  it('handles single-quoted name attributes', () => {
    const html = "<input name='username' type='text' />";
    expect(extractFormInputNames(html)).toContain('username');
  });

  it('handles name attribute appearing after other attributes', () => {
    const html = '<input type="text" class="form-control" name="search" />';
    expect(extractFormInputNames(html)).toContain('search');
  });
});
