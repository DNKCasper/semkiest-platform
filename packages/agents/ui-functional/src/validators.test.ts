import type { Page, Response } from 'playwright';
import {
  validateElementVisible,
  validateTextContent,
  validateUrl,
  validateHttpResponse,
} from './validators';
import type {
  ElementVisibleAssertion,
  TextContentAssertion,
  UrlAssertion,
  HttpResponseAssertion,
} from './types';

// ─── Minimal page mock ────────────────────────────────────────────────────────

function makePage(overrides: Partial<Record<string, unknown>> = {}): Page {
  return {
    locator: jest.fn().mockReturnValue({
      isVisible: jest.fn().mockResolvedValue(true),
      textContent: jest.fn().mockResolvedValue('hello world'),
    }),
    url: jest.fn().mockReturnValue('https://example.com/dashboard'),
    ...overrides,
  } as unknown as Page;
}

function makeResponse(status: number, body: string): Response {
  return {
    status: jest.fn().mockReturnValue(status),
    text: jest.fn().mockResolvedValue(body),
    url: jest.fn().mockReturnValue('https://example.com/api/data'),
  } as unknown as Response;
}

// ─── validateElementVisible ───────────────────────────────────────────────────

describe('validateElementVisible', () => {
  it('passes when element is visible and negate=false', async () => {
    const page = makePage();
    const assertion: ElementVisibleAssertion = { kind: 'element_visible', selector: '#btn' };
    const result = await validateElementVisible(page, assertion);
    expect(result.passed).toBe(true);
  });

  it('fails when element is not visible and negate=false', async () => {
    const page = makePage({
      locator: jest.fn().mockReturnValue({ isVisible: jest.fn().mockResolvedValue(false) }),
    });
    const assertion: ElementVisibleAssertion = { kind: 'element_visible', selector: '#btn' };
    const result = await validateElementVisible(page, assertion);
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/visible/);
  });

  it('passes when element is hidden and negate=true', async () => {
    const page = makePage({
      locator: jest.fn().mockReturnValue({ isVisible: jest.fn().mockResolvedValue(false) }),
    });
    const assertion: ElementVisibleAssertion = { kind: 'element_visible', selector: '#btn', negate: true };
    const result = await validateElementVisible(page, assertion);
    expect(result.passed).toBe(true);
  });
});

// ─── validateTextContent ──────────────────────────────────────────────────────

describe('validateTextContent', () => {
  it('passes on exact string match', async () => {
    const page = makePage();
    const assertion: TextContentAssertion = {
      kind: 'text_content',
      selector: 'h1',
      expected: 'hello world',
    };
    const result = await validateTextContent(page, assertion);
    expect(result.passed).toBe(true);
  });

  it('passes on substring match when contains=true', async () => {
    const page = makePage();
    const assertion: TextContentAssertion = {
      kind: 'text_content',
      selector: 'h1',
      expected: 'hello',
      contains: true,
    };
    const result = await validateTextContent(page, assertion);
    expect(result.passed).toBe(true);
  });

  it('passes on RegExp match', async () => {
    const page = makePage();
    const assertion: TextContentAssertion = {
      kind: 'text_content',
      selector: 'h1',
      expected: /^hello/,
    };
    const result = await validateTextContent(page, assertion);
    expect(result.passed).toBe(true);
  });

  it('fails when text does not match', async () => {
    const page = makePage();
    const assertion: TextContentAssertion = {
      kind: 'text_content',
      selector: 'h1',
      expected: 'goodbye',
    };
    const result = await validateTextContent(page, assertion);
    expect(result.passed).toBe(false);
  });
});

// ─── validateUrl ─────────────────────────────────────────────────────────────

describe('validateUrl', () => {
  it('passes on exact URL match', async () => {
    const page = makePage();
    const assertion: UrlAssertion = {
      kind: 'url',
      expected: 'https://example.com/dashboard',
    };
    const result = await validateUrl(page, assertion);
    expect(result.passed).toBe(true);
  });

  it('passes when contains=true and URL contains substring', async () => {
    const page = makePage();
    const assertion: UrlAssertion = { kind: 'url', expected: '/dashboard', contains: true };
    const result = await validateUrl(page, assertion);
    expect(result.passed).toBe(true);
  });

  it('passes on RegExp match', async () => {
    const page = makePage();
    const assertion: UrlAssertion = { kind: 'url', expected: /example\.com/ };
    const result = await validateUrl(page, assertion);
    expect(result.passed).toBe(true);
  });

  it('fails when URL does not match', async () => {
    const page = makePage();
    const assertion: UrlAssertion = { kind: 'url', expected: 'https://other.com/' };
    const result = await validateUrl(page, assertion);
    expect(result.passed).toBe(false);
  });
});

// ─── validateHttpResponse ─────────────────────────────────────────────────────

describe('validateHttpResponse', () => {
  it('passes when status matches', async () => {
    const res = makeResponse(200, '{"ok":true}');
    const responses = new Map([['https://example.com/api/data', res]]);
    const assertion: HttpResponseAssertion = {
      kind: 'http_response',
      urlPattern: '/api/data',
      expectedStatus: 200,
    };
    const result = await validateHttpResponse(assertion, responses);
    expect(result.passed).toBe(true);
  });

  it('fails when status does not match', async () => {
    const res = makeResponse(404, 'Not Found');
    const responses = new Map([['https://example.com/api/data', res]]);
    const assertion: HttpResponseAssertion = {
      kind: 'http_response',
      urlPattern: '/api/data',
      expectedStatus: 200,
    };
    const result = await validateHttpResponse(assertion, responses);
    expect(result.passed).toBe(false);
  });

  it('passes when body contains expected string', async () => {
    const res = makeResponse(200, '{"status":"success","user":"alice"}');
    const responses = new Map([['https://example.com/api/user', res]]);
    const assertion: HttpResponseAssertion = {
      kind: 'http_response',
      urlPattern: '/api/user',
      expectedBodyContains: '"user":"alice"',
    };
    const result = await validateHttpResponse(assertion, responses);
    expect(result.passed).toBe(true);
  });

  it('fails when no response matches the URL pattern', async () => {
    const responses = new Map<string, Response>();
    const assertion: HttpResponseAssertion = {
      kind: 'http_response',
      urlPattern: '/api/missing',
    };
    const result = await validateHttpResponse(assertion, responses);
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/No captured HTTP response/);
  });
});
