/**
 * Browser matrix configuration for cross-browser test execution.
 *
 * Defines the supported browser engines, viewport presets, and per-profile
 * browser matrix configuration used by the CrossBrowserAgent.
 */

/** Supported Playwright browser engines */
export type BrowserName = 'chromium' | 'firefox' | 'webkit';

/**
 * Viewport dimensions and a human-readable label.
 * Used to emulate different device form factors during test runs.
 */
export interface ViewportConfig {
  /** Human-readable label (e.g. "mobile", "tablet", "desktop") */
  name: string;
  /** Viewport width in CSS pixels */
  width: number;
  /** Viewport height in CSS pixels */
  height: number;
}

/** Per-browser configuration entry inside a {@link BrowserMatrix} */
export interface BrowserConfig {
  /** Playwright browser engine to use */
  browser: BrowserName;
  /** Viewports to exercise for this browser */
  viewports: ViewportConfig[];
  /** Whether this browser is active in the matrix */
  enabled: boolean;
}

/**
 * Full browser matrix configuration for a test profile.
 * Controls which browsers and viewports are exercised during a run.
 */
export interface BrowserMatrix {
  browsers: BrowserConfig[];
}

/** Standard viewport presets covering mobile, tablet, and desktop widths */
export const DEFAULT_VIEWPORTS: ViewportConfig[] = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1920, height: 1080 },
];

/** Default browser matrix enabling all three Playwright engines with standard viewports */
export const DEFAULT_BROWSER_MATRIX: BrowserMatrix = {
  browsers: [
    { browser: 'chromium', viewports: DEFAULT_VIEWPORTS, enabled: true },
    { browser: 'firefox', viewports: DEFAULT_VIEWPORTS, enabled: true },
    { browser: 'webkit', viewports: DEFAULT_VIEWPORTS, enabled: true },
  ],
};

/**
 * Returns only the enabled browser configurations from the given matrix.
 *
 * @param matrix - The browser matrix to filter
 * @returns Array of enabled {@link BrowserConfig} entries
 */
export function getEnabledBrowsers(matrix: BrowserMatrix): BrowserConfig[] {
  return matrix.browsers.filter((b) => b.enabled);
}

/**
 * Creates a custom browser matrix by merging overrides onto the default matrix.
 * Browsers not listed in `overrides` retain their default settings.
 *
 * @param overrides - Partial per-browser configuration to apply
 * @returns Merged {@link BrowserMatrix}
 */
export function createBrowserMatrix(
  overrides: Partial<Record<BrowserName, Partial<BrowserConfig>>>,
): BrowserMatrix {
  const browsers = DEFAULT_BROWSER_MATRIX.browsers.map((config) => {
    const override = overrides[config.browser];
    if (!override) return config;
    return { ...config, ...override, browser: config.browser };
  });
  return { browsers };
}
