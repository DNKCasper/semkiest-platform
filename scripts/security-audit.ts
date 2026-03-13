#!/usr/bin/env ts-node
/**
 * SemkiEst Platform – Security Audit Script
 *
 * Performs a static configuration audit of the platform's security posture
 * and emits a structured JSON report. Non-zero exit code on any FAIL result.
 *
 * Usage:
 *   npx ts-node scripts/security-audit.ts [--env /path/to/.env] [--output report.json]
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
type Status = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

interface Finding {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: Severity;
  status: Status;
  detail?: string;
  remediation?: string;
}

interface AuditReport {
  generatedAt: string;
  environment: string;
  summary: {
    total: number;
    pass: number;
    fail: number;
    warn: number;
    skip: number;
    criticalFails: number;
  };
  findings: Finding[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function pass(base: Omit<Finding, 'status'>): Finding {
  return { ...base, status: 'PASS' };
}

function fail(base: Omit<Finding, 'status'>, detail?: string): Finding {
  return { ...base, status: 'FAIL', detail };
}

function warn(base: Omit<Finding, 'status'>, detail?: string): Finding {
  return { ...base, status: 'WARN', detail };
}

function skip(base: Omit<Finding, 'status'>, detail?: string): Finding {
  return { ...base, status: 'SKIP', detail };
}

// ---------------------------------------------------------------------------
// Audit Checks
// ---------------------------------------------------------------------------

function checkJwtSecret(): Finding {
  const base = {
    id: 'AUTH-001',
    category: 'Authentication',
    title: 'JWT_SECRET strength',
    description: 'JWT_SECRET must be at least 32 characters long',
    severity: 'CRITICAL' as Severity,
    remediation: 'Generate a strong secret: openssl rand -base64 32',
  };

  const secret = getEnv('JWT_SECRET');
  if (!secret) return fail(base, 'JWT_SECRET is not set');
  if (secret.startsWith('CHANGE_ME')) return fail(base, 'JWT_SECRET is using the default placeholder value');
  if (secret.length < 32) return fail(base, `JWT_SECRET is only ${secret.length} characters (minimum 32)`);
  return pass(base);
}

function checkInternalApiKey(): Finding {
  const base = {
    id: 'AUTH-002',
    category: 'Authentication',
    title: 'INTERNAL_API_KEY configured',
    description: 'Internal service-to-service API key should be at least 16 characters',
    severity: 'HIGH' as Severity,
    remediation: 'Set INTERNAL_API_KEY to a random string of at least 16 characters',
  };

  const key = getEnv('INTERNAL_API_KEY');
  if (!key) return warn(base, 'INTERNAL_API_KEY is not set – internal endpoints are unauthenticated');
  if (key.length < 16) return fail(base, `INTERNAL_API_KEY is only ${key.length} characters (minimum 16)`);
  return pass(base);
}

function checkDatabaseUrl(): Finding {
  const base = {
    id: 'DB-001',
    category: 'Database',
    title: 'DATABASE_URL TLS enforcement',
    description: 'Production database connections must use SSL/TLS',
    severity: 'CRITICAL' as Severity,
    remediation: 'Append ?sslmode=require to DATABASE_URL',
  };

  const url = getEnv('DATABASE_URL');
  if (!url) return fail(base, 'DATABASE_URL is not set');

  const nodeEnv = getEnv('NODE_ENV') ?? 'development';
  if (nodeEnv !== 'production') return skip(base, 'TLS check skipped outside production');

  if (url.includes('sslmode=require') || url.includes('sslmode=verify-full')) {
    return pass(base);
  }
  return fail(base, 'DATABASE_URL does not include sslmode=require');
}

function checkDatabaseCredentialsNotDefault(): Finding {
  const base = {
    id: 'DB-002',
    category: 'Database',
    title: 'Database credentials are not default',
    description: 'DATABASE_URL must not use the default development credentials in production',
    severity: 'CRITICAL' as Severity,
    remediation: 'Rotate database credentials and use AWS Secrets Manager in production',
  };

  const url = getEnv('DATABASE_URL');
  const nodeEnv = getEnv('NODE_ENV') ?? 'development';

  if (!url) return skip(base, 'DATABASE_URL not set');
  if (nodeEnv !== 'production') return skip(base, 'Credential check skipped outside production');

  if (url.includes('semkiest_password') || url.includes(':semkiest@')) {
    return fail(base, 'DATABASE_URL contains default development credentials');
  }
  return pass(base);
}

function checkRedisUrl(): Finding {
  const base = {
    id: 'REDIS-001',
    category: 'Cache',
    title: 'Redis TLS (rediss://) in production',
    description: 'Production Redis connections should use TLS (rediss:// scheme)',
    severity: 'HIGH' as Severity,
    remediation: 'Update REDIS_URL to use rediss:// scheme with a password',
  };

  const url = getEnv('REDIS_URL');
  const nodeEnv = getEnv('NODE_ENV') ?? 'development';

  if (!url) return fail(base, 'REDIS_URL is not set');
  if (nodeEnv !== 'production') return skip(base, 'Redis TLS check skipped outside production');

  if (url.startsWith('rediss://')) return pass(base);
  return fail(base, 'REDIS_URL uses plain redis:// (no TLS) in production');
}

function checkCorsOrigins(): Finding {
  const base = {
    id: 'CORS-001',
    category: 'CORS',
    title: 'CORS origins explicitly configured',
    description: 'CORS_ORIGINS must be set to an explicit allow-list (not wildcard)',
    severity: 'HIGH' as Severity,
    remediation: 'Set CORS_ORIGINS to a comma-separated list of allowed origins',
  };

  const origins = getEnv('CORS_ORIGINS');
  if (!origins) return fail(base, 'CORS_ORIGINS is not set');
  if (origins.trim() === '*') return fail(base, 'CORS_ORIGINS is set to wildcard (*) – all origins are allowed');

  const originList = origins.split(',').map((o) => o.trim());
  const hasWildcard = originList.some((o) => o === '*' || o.includes('*'));
  if (hasWildcard) return warn(base, `CORS_ORIGINS contains a wildcard entry: ${origins}`);

  return pass(base);
}

function checkS3Credentials(): Finding {
  const base = {
    id: 'S3-001',
    category: 'Storage',
    title: 'S3 credentials are not default MinIO values',
    description: 'S3 access credentials must be rotated from default MinIO values in production',
    severity: 'HIGH' as Severity,
    remediation: 'Create dedicated IAM user/role with least-privilege S3 permissions',
  };

  const accessKey = getEnv('S3_ACCESS_KEY_ID');
  const secretKey = getEnv('S3_SECRET_ACCESS_KEY');
  const nodeEnv = getEnv('NODE_ENV') ?? 'development';

  if (!accessKey || !secretKey) return fail(base, 'S3 credentials (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY) are not set');
  if (nodeEnv !== 'production') return skip(base, 'S3 credential check skipped outside production');
  if (accessKey === 'minioadmin' || secretKey === 'minioadmin') {
    return fail(base, 'S3 credentials are using default MinIO values in production');
  }
  return pass(base);
}

function checkNodeEnv(): Finding {
  const base = {
    id: 'ENV-001',
    category: 'Runtime',
    title: 'NODE_ENV is set',
    description: 'NODE_ENV must be explicitly set to control security-relevant behavior',
    severity: 'MEDIUM' as Severity,
    remediation: 'Set NODE_ENV=production in production deployments',
  };

  const nodeEnv = getEnv('NODE_ENV');
  if (!nodeEnv) return fail(base, 'NODE_ENV is not set');
  if (!['development', 'test', 'staging', 'production'].includes(nodeEnv)) {
    return warn(base, `NODE_ENV has unexpected value: ${nodeEnv}`);
  }
  return pass(base);
}

function checkRateLimiting(): Finding {
  const base = {
    id: 'RATELIMIT-001',
    category: 'Rate Limiting',
    title: 'Rate limiting configuration is present',
    description: 'RATE_LIMIT_POINTS and RATE_LIMIT_DURATION should be configured explicitly',
    severity: 'MEDIUM' as Severity,
    remediation: 'Set RATE_LIMIT_POINTS and RATE_LIMIT_DURATION in your environment',
  };

  const points = getEnv('RATE_LIMIT_POINTS');
  const duration = getEnv('RATE_LIMIT_DURATION');

  if (!points && !duration) {
    return warn(base, 'Rate limit variables not set – defaults will be used (1000 req/60 s)');
  }
  return pass(base);
}

function checkLogLevel(): Finding {
  const base = {
    id: 'LOG-001',
    category: 'Logging',
    title: 'LOG_LEVEL is not set to debug/trace in production',
    description: 'Verbose log levels in production may expose sensitive data',
    severity: 'MEDIUM' as Severity,
    remediation: 'Set LOG_LEVEL=info (or warn/error) in production',
  };

  const logLevel = getEnv('LOG_LEVEL') ?? 'info';
  const nodeEnv = getEnv('NODE_ENV') ?? 'development';

  if (nodeEnv !== 'production') return skip(base, 'Log level check skipped outside production');
  if (['debug', 'trace'].includes(logLevel)) {
    return warn(base, `LOG_LEVEL=${logLevel} is verbose – may expose sensitive information`);
  }
  return pass(base);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function runAudit(): AuditReport {
  const findings: Finding[] = [
    checkJwtSecret(),
    checkInternalApiKey(),
    checkDatabaseUrl(),
    checkDatabaseCredentialsNotDefault(),
    checkRedisUrl(),
    checkCorsOrigins(),
    checkS3Credentials(),
    checkNodeEnv(),
    checkRateLimiting(),
    checkLogLevel(),
  ];

  const summary = findings.reduce(
    (acc, f) => {
      acc.total++;
      if (f.status === 'PASS') acc.pass++;
      if (f.status === 'FAIL') { acc.fail++; if (f.severity === 'CRITICAL') acc.criticalFails++; }
      if (f.status === 'WARN') acc.warn++;
      if (f.status === 'SKIP') acc.skip++;
      return acc;
    },
    { total: 0, pass: 0, fail: 0, warn: 0, skip: 0, criticalFails: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    environment: getEnv('NODE_ENV') ?? 'unknown',
    summary,
    findings,
  };
}

function main(): void {
  const args = process.argv.slice(2);

  // Simple arg parsing
  const envFileIdx = args.indexOf('--env');
  if (envFileIdx !== -1) {
    const envFile = args[envFileIdx + 1];
    if (envFile && fs.existsSync(envFile)) {
      const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
      }
    }
  }

  const report = runAudit();
  const json = JSON.stringify(report, null, 2);

  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1) {
    const outputFile = args[outputIdx + 1];
    if (outputFile) {
      fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true });
      fs.writeFileSync(path.resolve(outputFile), json, 'utf-8');
      process.stdout.write(`Security audit report written to ${outputFile}\n`);
    }
  } else {
    process.stdout.write(`${json}\n`);
  }

  // Print summary
  const { summary } = report;
  process.stderr.write(
    `\n[security-audit] ${summary.pass} passed, ${summary.fail} failed (${summary.criticalFails} critical), ${summary.warn} warnings, ${summary.skip} skipped\n`,
  );

  if (summary.fail > 0) {
    process.exit(1);
  }
}

main();
