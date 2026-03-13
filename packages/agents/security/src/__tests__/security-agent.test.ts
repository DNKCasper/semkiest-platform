import { SecurityAgent } from '../security-agent';
import type { CertificateInfo, HttpResponse, ScanTarget } from '../types';

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return {
    status: 200,
    headers: {
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=()',
    },
    body: '<html><body><p>Hello</p></body></html>',
    url: 'https://example.com',
    ...overrides,
  };
}

function makeCert(overrides: Partial<CertificateInfo> = {}): CertificateInfo {
  const now = new Date();
  return {
    subject: 'CN=example.com',
    issuer: "CN=Let's Encrypt",
    validFrom: new Date(now.getTime() - 30 * 86_400_000),
    validTo: new Date(now.getTime() + 365 * 86_400_000),
    protocol: 'TLSv1.3',
    cipher: 'TLS_AES_256_GCM_SHA384',
    bits: 256,
    ...overrides,
  };
}

const goodTarget: ScanTarget = { url: 'https://example.com' };

describe('SecurityAgent', () => {
  describe('enabled/disabled state', () => {
    it('is disabled by default', () => {
      const agent = new SecurityAgent();
      expect(agent.isEnabled()).toBe(false);
    });

    it('can be enabled', () => {
      const agent = new SecurityAgent();
      agent.enable();
      expect(agent.isEnabled()).toBe(true);
    });

    it('can be disabled after being enabled', () => {
      const agent = new SecurityAgent();
      agent.enable();
      agent.disable();
      expect(agent.isEnabled()).toBe(false);
    });

    it('throws when run() is called while disabled', async () => {
      const agent = new SecurityAgent();
      await expect(agent.run(goodTarget)).rejects.toThrow(
        'SecurityAgent is disabled',
      );
    });

    it('does not throw when run() is called while enabled', async () => {
      const mockFetch = jest.fn().mockResolvedValue(makeResponse());
      const mockTls = jest.fn().mockResolvedValue(makeCert());
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();
      await expect(agent.run(goodTarget)).resolves.not.toThrow();
    });
  });

  describe('run() return structure', () => {
    let agent: SecurityAgent;
    let mockFetch: jest.Mock;
    let mockTls: jest.Mock;

    beforeEach(() => {
      mockFetch = jest.fn().mockResolvedValue(makeResponse());
      mockTls = jest.fn().mockResolvedValue(makeCert());
      agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();
    });

    it('returns a report with the correct target', async () => {
      const report = await agent.run(goodTarget);
      expect(report.target).toEqual(goodTarget);
    });

    it('returns a report with scannedAt date', async () => {
      const report = await agent.run(goodTarget);
      expect(report.scannedAt).toBeInstanceOf(Date);
    });

    it('returns a report with non-negative duration', async () => {
      const report = await agent.run(goodTarget);
      expect(report.duration).toBeGreaterThanOrEqual(0);
    });

    it('returns a summary with total and bySeverity', async () => {
      const report = await agent.run(goodTarget);
      expect(report.summary).toBeDefined();
      expect(typeof report.summary.total).toBe('number');
      expect(report.summary.bySeverity).toBeDefined();
      expect(typeof report.summary.bySeverity.critical).toBe('number');
      expect(typeof report.summary.bySeverity.high).toBe('number');
    });

    it('returns zero findings for a fully secure target', async () => {
      const report = await agent.run(goodTarget);
      expect(report.summary.total).toBe(0);
      expect(report.findings).toHaveLength(0);
    });
  });

  describe('header auditing', () => {
    it('includes header findings for missing CSP', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        makeResponse({
          headers: {
            // No CSP header
            'strict-transport-security': 'max-age=31536000; includeSubDomains',
            'x-frame-options': 'DENY',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
            'permissions-policy': 'camera=()',
          },
        }),
      );
      const mockTls = jest.fn().mockResolvedValue(makeCert());
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();

      const report = await agent.run(goodTarget);
      expect(
        report.findings.find((f) => f.id === 'HDR-CSP-MISSING'),
      ).toBeDefined();
    });
  });

  describe('SSL/TLS validation', () => {
    it('includes SSL findings when TLS is insecure', async () => {
      const mockFetch = jest.fn().mockResolvedValue(makeResponse());
      const mockTls = jest
        .fn()
        .mockResolvedValue(makeCert({ protocol: 'TLSv1' }));
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();

      const report = await agent.run(goodTarget);
      expect(
        report.findings.find((f) => f.id === 'SSL-INSECURE-PROTOCOL'),
      ).toBeDefined();
    });

    it('flags HTTP target as high severity', async () => {
      const mockFetch = jest.fn().mockResolvedValue(makeResponse());
      const agent = new SecurityAgent({ fetchFn: mockFetch });
      agent.enable();

      const report = await agent.run({ url: 'http://example.com' });
      expect(report.findings.find((f) => f.id === 'SSL-HTTP-USED')).toBeDefined();
      expect(
        report.findings.find((f) => f.id === 'SSL-HTTP-USED')?.severity,
      ).toBe('high');
    });
  });

  describe('CSRF validation', () => {
    it('includes CSRF finding when POST form has no token', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        makeResponse({
          body: `<html>
            <form method="post">
              <input type="text" name="username" />
              <input type="submit" value="Submit" />
            </form>
          </html>`,
        }),
      );
      const mockTls = jest.fn().mockResolvedValue(makeCert());
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();

      const report = await agent.run(goodTarget);
      expect(
        report.findings.find((f) => f.id === 'CSRF-TOKEN-MISSING'),
      ).toBeDefined();
    });

    it('does not report CSRF missing when token is present', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        makeResponse({
          body: `<html>
            <form method="post">
              <input type="hidden" name="csrf_token" value="abc123" />
              <input type="text" name="email" />
              <input type="submit" value="Submit" />
            </form>
          </html>`,
        }),
      );
      const mockTls = jest.fn().mockResolvedValue(makeCert());
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();

      const report = await agent.run(goodTarget);
      expect(
        report.findings.find((f) => f.id === 'CSRF-TOKEN-MISSING'),
      ).toBeUndefined();
    });
  });

  describe('XSS scanning', () => {
    it('includes XSS finding when URL param is reflected', async () => {
      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        const q = new URL(url).searchParams.get('q') ?? '';
        return makeResponse({
          body: `<html><body>${q}</body></html>`,
        });
      });
      const mockTls = jest.fn().mockResolvedValue(makeCert());
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();

      const report = await agent.run({ url: 'https://example.com?q=test' });
      expect(
        report.findings.find((f) => f.category === 'XSS'),
      ).toBeDefined();
    });
  });

  describe('SQL injection scanning', () => {
    it('includes SQLi finding when database error is returned', async () => {
      let callIndex = 0;
      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        callIndex++;
        const id = new URL(url).searchParams.get('id') ?? '';
        if (id !== '1' && callIndex > 1) {
          return makeResponse({
            body: 'You have an error in your SQL syntax near "1"',
          });
        }
        return makeResponse();
      });
      const mockTls = jest.fn().mockResolvedValue(makeCert());
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();

      const report = await agent.run({
        url: 'https://example.com?id=1',
      });
      expect(
        report.findings.find((f) => f.category === 'SQL Injection'),
      ).toBeDefined();
    });
  });

  describe('fetch failure handling', () => {
    it('returns informational finding when target is unreachable', async () => {
      const mockFetch = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED'));
      const agent = new SecurityAgent({ fetchFn: mockFetch });
      agent.enable();

      const report = await agent.run(goodTarget);
      expect(
        report.findings.find((f) => f.id === 'AGENT-FETCH-FAILED'),
      ).toBeDefined();
    });
  });

  describe('deduplication', () => {
    it('deduplicates findings with the same id', async () => {
      // Simulate a case where the same finding might be generated multiple times
      const mockFetch = jest.fn().mockResolvedValue(makeResponse());
      const mockTls = jest.fn().mockResolvedValue(makeCert());
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();

      const report = await agent.run(goodTarget);
      const ids = report.findings.map((f) => f.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('target with cookies and headers', () => {
    it('passes custom headers to fetch requests', async () => {
      const mockFetch = jest.fn().mockResolvedValue(makeResponse());
      const mockTls = jest.fn().mockResolvedValue(makeCert());
      const agent = new SecurityAgent({ fetchFn: mockFetch, tlsConnectFn: mockTls });
      agent.enable();

      await agent.run({
        url: 'https://example.com',
        headers: { Authorization: 'Bearer token123' },
        cookies: { session: 'abc' },
      });

      expect(mockFetch).toHaveBeenCalled();
      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer token123',
      );
    });
  });
});
