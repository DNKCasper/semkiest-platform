import {
  DEFAULT_BROWSER_MATRIX,
  DEFAULT_VIEWPORTS,
  getEnabledBrowsers,
  createBrowserMatrix,
  BrowserMatrix,
} from './browser-matrix';

describe('DEFAULT_BROWSER_MATRIX', () => {
  it('includes chromium, firefox, and webkit', () => {
    const names = DEFAULT_BROWSER_MATRIX.browsers.map((b) => b.browser);
    expect(names).toContain('chromium');
    expect(names).toContain('firefox');
    expect(names).toContain('webkit');
  });

  it('enables all browsers by default', () => {
    expect(DEFAULT_BROWSER_MATRIX.browsers.every((b) => b.enabled)).toBe(true);
  });

  it('uses the three default viewports', () => {
    DEFAULT_BROWSER_MATRIX.browsers.forEach((b) => {
      expect(b.viewports).toHaveLength(DEFAULT_VIEWPORTS.length);
    });
  });
});

describe('DEFAULT_VIEWPORTS', () => {
  it('contains mobile, tablet, and desktop presets', () => {
    const names = DEFAULT_VIEWPORTS.map((v) => v.name);
    expect(names).toContain('mobile');
    expect(names).toContain('tablet');
    expect(names).toContain('desktop');
  });

  it('has positive width and height for every viewport', () => {
    DEFAULT_VIEWPORTS.forEach((v) => {
      expect(v.width).toBeGreaterThan(0);
      expect(v.height).toBeGreaterThan(0);
    });
  });
});

describe('getEnabledBrowsers', () => {
  it('returns only enabled browsers', () => {
    const matrix: BrowserMatrix = {
      browsers: [
        { browser: 'chromium', viewports: DEFAULT_VIEWPORTS, enabled: true },
        { browser: 'firefox', viewports: DEFAULT_VIEWPORTS, enabled: false },
        { browser: 'webkit', viewports: DEFAULT_VIEWPORTS, enabled: true },
      ],
    };
    const enabled = getEnabledBrowsers(matrix);
    expect(enabled).toHaveLength(2);
    expect(enabled.map((b) => b.browser)).toEqual(['chromium', 'webkit']);
  });

  it('returns empty array when all browsers are disabled', () => {
    const matrix: BrowserMatrix = {
      browsers: [
        { browser: 'chromium', viewports: [], enabled: false },
      ],
    };
    expect(getEnabledBrowsers(matrix)).toHaveLength(0);
  });
});

describe('createBrowserMatrix', () => {
  it('disables a browser via override', () => {
    const matrix = createBrowserMatrix({ firefox: { enabled: false } });
    const firefox = matrix.browsers.find((b) => b.browser === 'firefox');
    expect(firefox?.enabled).toBe(false);
  });

  it('preserves non-overridden browsers unchanged', () => {
    const matrix = createBrowserMatrix({ webkit: { enabled: false } });
    const chromium = matrix.browsers.find((b) => b.browser === 'chromium');
    expect(chromium?.enabled).toBe(true);
    expect(chromium?.viewports).toHaveLength(DEFAULT_VIEWPORTS.length);
  });

  it('overrides viewports for a specific browser', () => {
    const customViewports = [{ name: 'custom', width: 1280, height: 800 }];
    const matrix = createBrowserMatrix({ chromium: { viewports: customViewports } });
    const chromium = matrix.browsers.find((b) => b.browser === 'chromium');
    expect(chromium?.viewports).toEqual(customViewports);
  });

  it('returns all three browsers', () => {
    const matrix = createBrowserMatrix({});
    expect(matrix.browsers).toHaveLength(3);
  });
});
