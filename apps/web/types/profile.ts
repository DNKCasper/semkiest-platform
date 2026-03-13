/**
 * Test profile domain types for the SemkiEst platform.
 */

export type ProfileType = 'smoke' | 'regression' | 'performance';

export type WcagLevel = 'A' | 'AA' | 'AAA';

export type SecurityScanType = 'OWASP' | 'CWE';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export type BrowserType = 'chrome' | 'firefox' | 'safari' | 'edge';

export type ViewportType = 'mobile' | 'tablet' | 'desktop' | 'custom';

export type BaselineComparison = 'strict' | 'lenient';

export type AuthMethod = 'none' | 'bearer' | 'basic';

/** UI functional testing configuration */
export interface UITestingConfig {
  enabled: boolean;
  retryOnFailure: boolean;
  retryCount: number;
  timeoutPerTest: number;
}

/** Visual/appearance testing configuration */
export interface VisualTestingConfig {
  enabled: boolean;
  baselineComparison: BaselineComparison;
  ignoreRegions: string;
  devicePixelRatioHandling: boolean;
}

/** Cross-browser compatibility configuration */
export interface CrossBrowserConfig {
  enabled: boolean;
  browsers: BrowserType[];
  viewports: ViewportType[];
  parallelExecution: boolean;
}

/** Performance testing configuration */
export interface PerformanceTestingConfig {
  enabled: boolean;
  performanceThreshold: number;
  memoryThreshold: number;
  cpuThreshold: number;
}

/** Load/stress testing configuration */
export interface LoadTestingConfig {
  enabled: boolean;
  concurrentUsers: number;
  rampUpTime: number;
  duration: number;
  endpoints: string;
}

/** Accessibility testing configuration */
export interface AccessibilityConfig {
  enabled: boolean;
  wcagLevel: WcagLevel;
  includeExcludeRules: string;
}

/** Security testing configuration */
export interface SecurityConfig {
  enabled: boolean;
  scanningType: SecurityScanType;
  severityFilter: SeverityLevel[];
}

/** API/backend testing configuration */
export interface APITestingConfig {
  enabled: boolean;
  apiBaseUrl: string;
  authMethod: AuthMethod;
  requestTimeout: number;
}

/** All test category configurations */
export interface ProfileCategories {
  ui: UITestingConfig;
  visual: VisualTestingConfig;
  browser: CrossBrowserConfig;
  performance: PerformanceTestingConfig;
  load: LoadTestingConfig;
  accessibility: AccessibilityConfig;
  security: SecurityConfig;
  api: APITestingConfig;
}

/** A test profile entity */
export interface TestProfile {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  profileType: ProfileType;
  isTemplate: boolean;
  categories: ProfileCategories;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating a new profile */
export interface CreateProfileInput {
  name: string;
  description?: string;
  profileType: ProfileType;
  isTemplate?: boolean;
  categories: ProfileCategories;
}

/** Payload for updating an existing profile */
export type UpdateProfileInput = Partial<CreateProfileInput>;

/** Payload for cloning a profile */
export interface CloneProfileInput {
  name: string;
}

/** Paginated list of profiles */
export interface ProfileListResponse {
  data: TestProfile[];
  total: number;
  page: number;
  pageSize: number;
}

/** Query parameters for listing profiles */
export interface ProfileQueryParams {
  search?: string;
  profileType?: ProfileType;
  isTemplate?: boolean;
  page?: number;
  pageSize?: number;
}

/** Default configuration values for a new profile */
export const defaultProfileCategories: ProfileCategories = {
  ui: {
    enabled: false,
    retryOnFailure: true,
    retryCount: 3,
    timeoutPerTest: 30,
  },
  visual: {
    enabled: false,
    baselineComparison: 'lenient',
    ignoreRegions: '[]',
    devicePixelRatioHandling: true,
  },
  browser: {
    enabled: false,
    browsers: ['chrome'],
    viewports: ['desktop'],
    parallelExecution: false,
  },
  performance: {
    enabled: false,
    performanceThreshold: 3000,
    memoryThreshold: 512,
    cpuThreshold: 80,
  },
  load: {
    enabled: false,
    concurrentUsers: 10,
    rampUpTime: 30,
    duration: 60,
    endpoints: '',
  },
  accessibility: {
    enabled: false,
    wcagLevel: 'AA',
    includeExcludeRules: '{}',
  },
  security: {
    enabled: false,
    scanningType: 'OWASP',
    severityFilter: ['critical', 'high'],
  },
  api: {
    enabled: false,
    apiBaseUrl: '',
    authMethod: 'none',
    requestTimeout: 30,
  },
};
