export { BaseAgent } from './base-agent';
export { SecurityAgent } from './security-agent';
export type { SecurityAgentOptions } from './security-agent';
export { auditSecurityHeaders, getHighestSeverity } from './header-auditor';
export { validateSsl, defaultTlsConnect } from './ssl-validator';
export {
  scanUrlParametersForXss,
  scanFormInputsForXss,
  extractFormInputNames,
} from './xss-scanner';
export {
  scanUrlParametersForSqli,
  scanFormInputsForSqli,
  extractFormInputNames as extractSqliFormInputNames,
} from './sqli-scanner';
export type {
  Severity,
  Finding,
  ScanTarget,
  ScanResult,
  SecurityReport,
  BrowserPage,
  HttpResponse,
  FetchFn,
  CertificateInfo,
  TlsConnectFn,
  CsrfValidationResult,
} from './types';
