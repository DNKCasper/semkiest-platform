import { validateSsl } from '../ssl-validator';
import type { CertificateInfo } from '../types';

function makeCert(overrides: Partial<CertificateInfo> = {}): CertificateInfo {
  const now = new Date();
  const future = new Date(now.getTime() + 365 * 86_400_000);
  return {
    subject: 'CN=example.com',
    issuer: "CN=Let's Encrypt Authority",
    validFrom: new Date(now.getTime() - 30 * 86_400_000),
    validTo: future,
    protocol: 'TLSv1.3',
    cipher: 'TLS_AES_256_GCM_SHA384',
    bits: 256,
    ...overrides,
  };
}

describe('validateSsl', () => {
  it('returns no findings for a valid, modern TLS configuration', async () => {
    const mockConnect = jest.fn().mockResolvedValue(makeCert());
    const findings = await validateSsl('example.com', 443, mockConnect);
    expect(findings).toHaveLength(0);
  });

  it('returns critical finding when TLS connection fails', async () => {
    const mockConnect = jest
      .fn()
      .mockRejectedValue(new Error('Connection refused'));
    const findings = await validateSsl('example.com', 443, mockConnect);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('SSL-CONNECTION-FAILED');
    expect(findings[0].severity).toBe('critical');
  });

  describe('certificate expiry', () => {
    it('returns critical finding for expired certificate', async () => {
      const past = new Date(Date.now() - 1000);
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ validTo: past }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(findings.find((f) => f.id === 'SSL-CERT-EXPIRED')).toBeDefined();
      expect(findings.find((f) => f.severity === 'critical')).toBeDefined();
    });

    it('returns critical finding when certificate expires within 7 days', async () => {
      const soon = new Date(Date.now() + 3 * 86_400_000); // 3 days
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ validTo: soon }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-CERT-EXPIRING-CRITICAL'),
      ).toBeDefined();
    });

    it('returns high finding when certificate expires within 30 days', async () => {
      const soon = new Date(Date.now() + 20 * 86_400_000); // 20 days
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ validTo: soon }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-CERT-EXPIRING-SOON'),
      ).toBeDefined();
      expect(findings.find((f) => f.severity === 'high')).toBeDefined();
    });

    it('returns critical finding when certificate is not yet valid', async () => {
      const future = new Date(Date.now() + 10 * 86_400_000);
      const mockConnect = jest.fn().mockResolvedValue(
        makeCert({ validFrom: future }),
      );
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-CERT-NOT-YET-VALID'),
      ).toBeDefined();
    });
  });

  describe('TLS protocol version', () => {
    it('returns critical finding for SSLv3', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ protocol: 'SSLv3' }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-INSECURE-PROTOCOL'),
      ).toBeDefined();
      expect(findings.find((f) => f.severity === 'critical')).toBeDefined();
    });

    it('returns critical finding for TLSv1', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ protocol: 'TLSv1' }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-INSECURE-PROTOCOL'),
      ).toBeDefined();
    });

    it('returns critical finding for TLSv1.1', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ protocol: 'TLSv1.1' }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-INSECURE-PROTOCOL'),
      ).toBeDefined();
    });

    it('accepts TLSv1.2', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ protocol: 'TLSv1.2' }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-INSECURE-PROTOCOL'),
      ).toBeUndefined();
    });

    it('accepts TLSv1.3', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ protocol: 'TLSv1.3' }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-INSECURE-PROTOCOL'),
      ).toBeUndefined();
    });
  });

  describe('cipher suite', () => {
    it('returns high finding for RC4 cipher', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ cipher: 'RC4-SHA' }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id.startsWith('SSL-WEAK-CIPHER')),
      ).toBeDefined();
    });

    it('returns high finding for DES cipher', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ cipher: 'DES-CBC3-SHA' }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id.startsWith('SSL-WEAK-CIPHER')),
      ).toBeDefined();
    });

    it('returns high finding for weak bit length', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(makeCert({ bits: 64, cipher: 'AES_64_CBC' }));
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id === 'SSL-WEAK-CIPHER-BITS'),
      ).toBeDefined();
    });

    it('accepts strong cipher with 256 bits', async () => {
      const mockConnect = jest
        .fn()
        .mockResolvedValue(
          makeCert({ cipher: 'TLS_AES_256_GCM_SHA384', bits: 256 }),
        );
      const findings = await validateSsl('example.com', 443, mockConnect);
      expect(
        findings.find((f) => f.id.startsWith('SSL-WEAK-CIPHER')),
      ).toBeUndefined();
    });
  });

  it('uses default port 443 when not specified', async () => {
    const mockConnect = jest.fn().mockResolvedValue(makeCert());
    await validateSsl('example.com', undefined, mockConnect);
    expect(mockConnect).toHaveBeenCalledWith('example.com', 443);
  });
});
