import * as tls from 'tls';
import type { CertificateInfo, Finding, TlsConnectFn } from './types';

/** Minimum acceptable days before certificate expiry triggers a warning. */
const CERT_EXPIRY_WARNING_DAYS = 30;
/** Minimum acceptable days before certificate expiry triggers a critical alert. */
const CERT_EXPIRY_CRITICAL_DAYS = 7;

/** TLS protocol versions considered insecure. */
const INSECURE_PROTOCOLS = new Set(['SSLv2', 'SSLv3', 'TLSv1', 'TLSv1.1']);

/** Known weak cipher keywords (substring match). */
const WEAK_CIPHER_PATTERNS = ['RC4', 'DES', 'NULL', 'EXPORT', 'anon', 'MD5'];

/**
 * Default TLS connect implementation using Node's built-in `tls` module.
 * Connects to the host, extracts certificate and protocol info, then closes.
 */
export const defaultTlsConnect: TlsConnectFn = (
  hostname: string,
  port: number,
): Promise<CertificateInfo> =>
  new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate(false);
          const protocol = socket.getProtocol() ?? 'unknown';
          const cipher = socket.getCipher();

          if (!cert || !cert.subject) {
            socket.destroy();
            reject(new Error('No certificate returned by server'));
            return;
          }

          const info: CertificateInfo = {
            subject:
              typeof cert.subject === 'object'
                ? JSON.stringify(cert.subject)
                : String(cert.subject),
            issuer:
              typeof cert.issuer === 'object'
                ? JSON.stringify(cert.issuer)
                : String(cert.issuer),
            validFrom: new Date(cert.valid_from),
            validTo: new Date(cert.valid_to),
            protocol,
            cipher: cipher?.name ?? 'unknown',
            bits: cipher?.standardName
              ? extractBits(cipher.standardName)
              : (cipher as { bits?: number })?.bits ?? 0,
          };

          socket.destroy();
          resolve(info);
        } catch (err) {
          socket.destroy();
          reject(err);
        }
      },
    );

    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error(`TLS connection to ${hostname}:${port} timed out`));
    });

    socket.on('error', (err: Error) => {
      reject(err);
    });
  });

/**
 * Extract bit length from a cipher standard name (e.g. AES_128 → 128).
 */
function extractBits(standardName: string): number {
  const match = /_(\d+)/.exec(standardName);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Check certificate validity dates and expiry.
 */
function auditCertificateExpiry(cert: CertificateInfo): Finding[] {
  const findings: Finding[] = [];
  const now = new Date();
  const msPerDay = 86_400_000;

  if (cert.validFrom > now) {
    findings.push({
      id: 'SSL-CERT-NOT-YET-VALID',
      category: 'SSL/TLS',
      title: 'Certificate is not yet valid',
      description:
        `The SSL certificate is not valid until ${cert.validFrom.toISOString()}. ` +
        'Clients will display certificate errors for this site.',
      severity: 'critical',
      location: `Certificate subject: ${cert.subject}`,
      remediation:
        'Replace this certificate with one that is currently valid. ' +
        'Check your server clock if the certificate was just issued.',
    });
    return findings;
  }

  const daysUntilExpiry = Math.floor(
    (cert.validTo.getTime() - now.getTime()) / msPerDay,
  );

  if (cert.validTo < now) {
    findings.push({
      id: 'SSL-CERT-EXPIRED',
      category: 'SSL/TLS',
      title: 'SSL certificate has expired',
      description:
        `The SSL certificate expired on ${cert.validTo.toISOString()}. ` +
        'Browsers will block access and display security errors.',
      severity: 'critical',
      location: `Certificate subject: ${cert.subject}`,
      remediation:
        'Renew the SSL certificate immediately. ' +
        'Consider automating certificate renewal with tools like certbot/ACME.',
    });
  } else if (daysUntilExpiry <= CERT_EXPIRY_CRITICAL_DAYS) {
    findings.push({
      id: 'SSL-CERT-EXPIRING-CRITICAL',
      category: 'SSL/TLS',
      title: `SSL certificate expires in ${daysUntilExpiry} days`,
      description:
        `The SSL certificate will expire on ${cert.validTo.toISOString()} — ` +
        `only ${daysUntilExpiry} day(s) remaining. Immediate action required.`,
      severity: 'critical',
      location: `Certificate subject: ${cert.subject}`,
      remediation:
        'Renew the SSL certificate now. Automate renewal to avoid future expirations.',
    });
  } else if (daysUntilExpiry <= CERT_EXPIRY_WARNING_DAYS) {
    findings.push({
      id: 'SSL-CERT-EXPIRING-SOON',
      category: 'SSL/TLS',
      title: `SSL certificate expires in ${daysUntilExpiry} days`,
      description:
        `The SSL certificate will expire on ${cert.validTo.toISOString()} — ` +
        `${daysUntilExpiry} day(s) remaining. Renew before expiry to avoid outages.`,
      severity: 'high',
      location: `Certificate subject: ${cert.subject}`,
      remediation:
        'Renew the SSL certificate and set up automated renewal (e.g., certbot --renew-hook).',
    });
  }

  return findings;
}

/**
 * Check TLS protocol version for known insecure versions.
 */
function auditProtocol(cert: CertificateInfo): Finding[] {
  const findings: Finding[] = [];

  if (INSECURE_PROTOCOLS.has(cert.protocol)) {
    findings.push({
      id: 'SSL-INSECURE-PROTOCOL',
      category: 'SSL/TLS',
      title: `Insecure TLS protocol in use: ${cert.protocol}`,
      description:
        `The server negotiated ${cert.protocol}, which is considered cryptographically ` +
        'broken and susceptible to known attacks (POODLE, BEAST, etc.).',
      severity: 'critical',
      location: `TLS Protocol: ${cert.protocol}`,
      remediation:
        'Disable SSLv2, SSLv3, TLSv1, and TLSv1.1 in your web server configuration. ' +
        'Support only TLSv1.2 and TLSv1.3. ' +
        'For nginx: ssl_protocols TLSv1.2 TLSv1.3; ' +
        'For Apache: SSLProtocol -all +TLSv1.2 +TLSv1.3',
    });
  }

  return findings;
}

/**
 * Check cipher suite for known weak algorithms.
 */
function auditCipherSuite(cert: CertificateInfo): Finding[] {
  const findings: Finding[] = [];
  const cipherUpper = cert.cipher.toUpperCase();

  for (const weakPattern of WEAK_CIPHER_PATTERNS) {
    if (cipherUpper.includes(weakPattern.toUpperCase())) {
      findings.push({
        id: `SSL-WEAK-CIPHER-${weakPattern.toUpperCase()}`,
        category: 'SSL/TLS',
        title: `Weak cipher suite in use: ${cert.cipher}`,
        description:
          `The negotiated cipher suite '${cert.cipher}' contains '${weakPattern}', ` +
          'which is cryptographically weak or broken and must not be used.',
        severity: 'high',
        location: `TLS Cipher: ${cert.cipher}`,
        evidence: cert.cipher,
        remediation:
          'Configure your server to use only modern cipher suites. ' +
          'Remove RC4, DES, NULL, EXPORT, and anonymous ciphers. ' +
          'Use Mozilla SSL Configuration Generator for recommended settings: ' +
          'https://ssl-config.mozilla.org',
      });
      break; // One finding per cipher is sufficient
    }
  }

  if (cert.bits > 0 && cert.bits < 128) {
    findings.push({
      id: 'SSL-WEAK-CIPHER-BITS',
      category: 'SSL/TLS',
      title: `Cipher uses weak key length: ${cert.bits} bits`,
      description:
        `The negotiated cipher uses only ${cert.bits}-bit keys, which provides ` +
        'insufficient security by modern standards.',
      severity: 'high',
      location: `TLS Cipher: ${cert.cipher} (${cert.bits} bits)`,
      remediation:
        'Use cipher suites with at least 128-bit symmetric keys and ' +
        '2048-bit or larger asymmetric keys.',
    });
  }

  return findings;
}

/**
 * Validates SSL/TLS configuration for a given hostname.
 *
 * Checks: certificate validity/expiry, TLS protocol version,
 * and cipher suite strength.
 *
 * @param hostname - The hostname to validate (e.g. "example.com").
 * @param port - TCP port (default: 443).
 * @param connectFn - Injectable TLS connect function (defaults to real TLS connection).
 * @returns List of security findings with remediation guidance.
 *
 * @example
 * ```typescript
 * const findings = await validateSsl('example.com');
 * ```
 */
export async function validateSsl(
  hostname: string,
  port = 443,
  connectFn: TlsConnectFn = defaultTlsConnect,
): Promise<Finding[]> {
  let cert: CertificateInfo;

  try {
    cert = await connectFn(hostname, port);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      {
        id: 'SSL-CONNECTION-FAILED',
        category: 'SSL/TLS',
        title: 'SSL/TLS connection failed',
        description:
          `Could not establish a TLS connection to ${hostname}:${port}. ` +
          `Error: ${message}`,
        severity: 'critical',
        location: `${hostname}:${port}`,
        remediation:
          'Ensure the server is running, the hostname is correct, and TLS is properly configured.',
      },
    ];
  }

  return [
    ...auditCertificateExpiry(cert),
    ...auditProtocol(cert),
    ...auditCipherSuite(cert),
  ];
}
