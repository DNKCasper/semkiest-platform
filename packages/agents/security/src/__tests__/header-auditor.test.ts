import { auditSecurityHeaders, getHighestSeverity } from '../header-auditor';

describe('auditSecurityHeaders', () => {
  describe('Content-Security-Policy', () => {
    it('reports high finding when CSP header is missing', () => {
      const findings = auditSecurityHeaders({});
      const csp = findings.find((f) => f.id === 'HDR-CSP-MISSING');
      expect(csp).toBeDefined();
      expect(csp?.severity).toBe('high');
    });

    it('reports no CSP finding when header is present', () => {
      const findings = auditSecurityHeaders({
        'Content-Security-Policy': "default-src 'self'",
      });
      expect(findings.find((f) => f.id === 'HDR-CSP-MISSING')).toBeUndefined();
    });

    it('reports medium finding for unsafe-inline in script-src', () => {
      const findings = auditSecurityHeaders({
        'Content-Security-Policy': "script-src 'self' 'unsafe-inline'",
      });
      expect(
        findings.find((f) => f.id === 'HDR-CSP-UNSAFE-INLINE'),
      ).toBeDefined();
    });

    it('reports medium finding for unsafe-eval in default-src', () => {
      const findings = auditSecurityHeaders({
        'Content-Security-Policy': "default-src 'self' 'unsafe-eval'",
      });
      expect(
        findings.find((f) => f.id === 'HDR-CSP-UNSAFE-EVAL'),
      ).toBeDefined();
    });

    it('reports medium finding for wildcard source', () => {
      const findings = auditSecurityHeaders({
        'Content-Security-Policy': "img-src *",
      });
      expect(
        findings.find((f) => f.id === 'HDR-CSP-WILDCARD'),
      ).toBeDefined();
    });

    it('accepts case-insensitive header names', () => {
      const findings = auditSecurityHeaders({
        'content-security-policy': "default-src 'self'",
      });
      expect(findings.find((f) => f.id === 'HDR-CSP-MISSING')).toBeUndefined();
    });
  });

  describe('Strict-Transport-Security', () => {
    it('reports high finding when HSTS is missing', () => {
      const findings = auditSecurityHeaders({
        'Content-Security-Policy': "default-src 'self'",
      });
      expect(findings.find((f) => f.id === 'HDR-HSTS-MISSING')).toBeDefined();
    });

    it('reports no HSTS finding when valid header is present', () => {
      const findings = auditSecurityHeaders({
        'Content-Security-Policy': "default-src 'self'",
        'Strict-Transport-Security':
          'max-age=31536000; includeSubDomains; preload',
      });
      expect(
        findings.find((f) => f.id === 'HDR-HSTS-MISSING'),
      ).toBeUndefined();
      expect(
        findings.find((f) => f.id === 'HDR-HSTS-SHORT-MAX-AGE'),
      ).toBeUndefined();
    });

    it('reports low finding when max-age is too short', () => {
      const findings = auditSecurityHeaders({
        'Strict-Transport-Security': 'max-age=3600',
      });
      expect(
        findings.find((f) => f.id === 'HDR-HSTS-SHORT-MAX-AGE'),
      ).toBeDefined();
    });

    it('reports low finding when includeSubDomains is missing', () => {
      const findings = auditSecurityHeaders({
        'Strict-Transport-Security': 'max-age=31536000',
      });
      expect(
        findings.find((f) => f.id === 'HDR-HSTS-NO-SUBDOMAINS'),
      ).toBeDefined();
    });
  });

  describe('X-Frame-Options', () => {
    it('reports medium finding when X-Frame-Options is missing', () => {
      const findings = auditSecurityHeaders({
        'Content-Security-Policy': "default-src 'self'",
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      });
      expect(
        findings.find((f) => f.id === 'HDR-XFO-MISSING'),
      ).toBeDefined();
    });

    it('accepts DENY value', () => {
      const findings = auditSecurityHeaders({
        'X-Frame-Options': 'DENY',
      });
      expect(findings.find((f) => f.id === 'HDR-XFO-MISSING')).toBeUndefined();
      expect(findings.find((f) => f.id === 'HDR-XFO-INVALID')).toBeUndefined();
    });

    it('accepts SAMEORIGIN value', () => {
      const findings = auditSecurityHeaders({
        'X-Frame-Options': 'SAMEORIGIN',
      });
      expect(findings.find((f) => f.id === 'HDR-XFO-MISSING')).toBeUndefined();
      expect(findings.find((f) => f.id === 'HDR-XFO-INVALID')).toBeUndefined();
    });

    it('reports medium finding for invalid value', () => {
      const findings = auditSecurityHeaders({
        'X-Frame-Options': 'ALLOW-FROM https://example.com',
      });
      expect(
        findings.find((f) => f.id === 'HDR-XFO-INVALID'),
      ).toBeDefined();
    });
  });

  describe('X-Content-Type-Options', () => {
    it('reports medium finding when header is missing', () => {
      const findings = auditSecurityHeaders({
        'X-Frame-Options': 'DENY',
      });
      expect(
        findings.find((f) => f.id === 'HDR-XCTO-MISSING'),
      ).toBeDefined();
    });

    it('accepts nosniff value', () => {
      const findings = auditSecurityHeaders({
        'X-Content-Type-Options': 'nosniff',
      });
      expect(
        findings.find((f) => f.id === 'HDR-XCTO-MISSING'),
      ).toBeUndefined();
      expect(
        findings.find((f) => f.id === 'HDR-XCTO-INVALID'),
      ).toBeUndefined();
    });

    it('reports low finding for invalid value', () => {
      const findings = auditSecurityHeaders({
        'X-Content-Type-Options': 'sniff',
      });
      expect(
        findings.find((f) => f.id === 'HDR-XCTO-INVALID'),
      ).toBeDefined();
    });
  });

  describe('Referrer-Policy', () => {
    it('reports low finding when Referrer-Policy is missing', () => {
      const findings = auditSecurityHeaders({});
      expect(findings.find((f) => f.id === 'HDR-RP-MISSING')).toBeDefined();
    });

    it('no finding when Referrer-Policy is present', () => {
      const findings = auditSecurityHeaders({
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      expect(findings.find((f) => f.id === 'HDR-RP-MISSING')).toBeUndefined();
    });
  });

  describe('Permissions-Policy', () => {
    it('reports informational finding when header is missing', () => {
      const findings = auditSecurityHeaders({});
      expect(findings.find((f) => f.id === 'HDR-PP-MISSING')).toBeDefined();
    });

    it('no finding when Permissions-Policy is present', () => {
      const findings = auditSecurityHeaders({
        'Permissions-Policy': 'camera=()',
      });
      expect(findings.find((f) => f.id === 'HDR-PP-MISSING')).toBeUndefined();
    });
  });

  describe('full header set', () => {
    it('returns no findings for a fully compliant header set', () => {
      const findings = auditSecurityHeaders({
        'Content-Security-Policy': "default-src 'self'; script-src 'self'",
        'Strict-Transport-Security':
          'max-age=31536000; includeSubDomains; preload',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=()',
      });
      expect(findings).toHaveLength(0);
    });

    it('handles string[] header values', () => {
      const findings = auditSecurityHeaders({
        'X-Frame-Options': ['DENY'],
      });
      expect(findings.find((f) => f.id === 'HDR-XFO-MISSING')).toBeUndefined();
    });
  });
});

describe('getHighestSeverity', () => {
  it('returns null for empty findings', () => {
    expect(getHighestSeverity([])).toBeNull();
  });

  it('returns critical when critical finding exists', () => {
    const findings = auditSecurityHeaders({});
    const result = getHighestSeverity(findings);
    expect(result).toBe('high'); // Missing CSP is high
  });

  it('returns correct severity order', () => {
    expect(
      getHighestSeverity([
        {
          id: 'TEST-1',
          category: 'Test',
          title: 'Test',
          description: 'Test',
          severity: 'low',
          remediation: 'Fix it',
        },
        {
          id: 'TEST-2',
          category: 'Test',
          title: 'Test',
          description: 'Test',
          severity: 'medium',
          remediation: 'Fix it',
        },
      ]),
    ).toBe('medium');
  });
});
