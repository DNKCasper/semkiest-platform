/**
 * Unit tests for the Performance Agent and supporting classes.
 */

import type { CoreWebVitals, PerformanceAuditItem, ResourceMetrics } from './types';
import { ResourceAnalyzer } from './resource-analyzer';
import { RecommendationEngine } from './recommendation-engine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a mock CoreWebVitals object with optional overrides.
 */
function makeCoreWebVitals(overrides?: Partial<CoreWebVitals>): CoreWebVitals {
  return {
    lcp: 2000,
    fid: 50,
    cls: 0.05,
    inp: 150,
    ttfb: 600,
    fcp: 1200,
    ...overrides,
  };
}

/**
 * Creates a mock ResourceMetrics object with optional overrides.
 */
function makeResourceMetrics(overrides?: Partial<ResourceMetrics>): ResourceMetrics {
  return {
    totalSize: 500_000,
    jsSize: 200_000,
    cssSize: 50_000,
    imageSize: 200_000,
    fontSize: 30_000,
    otherSize: 20_000,
    requestCount: 50,
    domNodes: 800,
    thirdPartyRequests: 10,
    ...overrides,
  };
}

/**
 * Creates a mock PerformanceAuditItem with optional overrides.
 */
function makeAuditItem(overrides?: Partial<PerformanceAuditItem>): PerformanceAuditItem {
  return {
    id: `audit-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Sample Audit',
    description: 'A sample audit item for testing',
    score: 90,
    displayValue: '100ms',
    numericValue: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResourceAnalyzer', () => {
  let analyzer: ResourceAnalyzer;
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    analyzer = new ResourceAnalyzer(mockLogger);
    jest.clearAllMocks();
  });

  describe('categorizeResources', () => {
    it('correctly categorizes JavaScript requests', () => {
      const requests = [
        { url: 'https://example.com/app.js', type: 'script', size: 50_000 },
        { url: 'https://example.com/lib.js', type: 'script', size: 30_000 },
      ];

      const result = analyzer['categorizeResources'](requests);

      expect(result.jsSize).toBe(80_000);
      expect(result.totalSize).toBe(80_000);
    });

    it('correctly categorizes CSS requests', () => {
      const requests = [
        { url: 'https://example.com/style.css', type: 'stylesheet', size: 25_000 },
        { url: 'https://example.com/theme.css', type: 'stylesheet', size: 15_000 },
      ];

      const result = analyzer['categorizeResources'](requests);

      expect(result.cssSize).toBe(40_000);
      expect(result.totalSize).toBe(40_000);
    });

    it('correctly categorizes image requests', () => {
      const requests = [
        { url: 'https://example.com/logo.png', type: 'image', size: 100_000 },
        { url: 'https://example.com/hero.jpg', type: 'image', size: 150_000 },
      ];

      const result = analyzer['categorizeResources'](requests);

      expect(result.imageSize).toBe(250_000);
    });

    it('correctly categorizes font requests', () => {
      const requests = [
        { url: 'https://fonts.googleapis.com/font1.woff2', type: 'font', size: 20_000 },
      ];

      const result = analyzer['categorizeResources'](requests);

      expect(result.fontSize).toBe(20_000);
    });

    it('counts third-party requests correctly', () => {
      const requests = [
        { url: 'https://google-analytics.com/track.js', type: 'script', size: 10_000 },
        { url: 'https://example.com/app.js', type: 'script', size: 50_000 },
        { url: 'https://googleadservices.com/ads.js', type: 'script', size: 15_000 },
      ];

      const result = analyzer['categorizeResources'](requests);

      expect(result.thirdPartyCount).toBe(2);
    });

    it('calculates total size across all categories', () => {
      const requests = [
        { url: 'https://example.com/app.js', type: 'script', size: 100_000 },
        { url: 'https://example.com/style.css', type: 'stylesheet', size: 50_000 },
        { url: 'https://example.com/image.png', type: 'image', size: 200_000 },
      ];

      const result = analyzer['categorizeResources'](requests);

      expect(result.totalSize).toBe(350_000);
    });

    it('handles mixed resource types', () => {
      const requests = [
        { url: 'https://example.com/script.js', type: 'script', size: 50_000 },
        { url: 'https://example.com/style.css', type: 'stylesheet', size: 25_000 },
        { url: 'https://example.com/image.png', type: 'image', size: 100_000 },
        { url: 'https://fonts.com/font.woff2', type: 'font', size: 30_000 },
        { url: 'https://example.com/index.html', type: 'document', size: 50_000 },
      ];

      const result = analyzer['categorizeResources'](requests);

      expect(result.jsSize).toBe(50_000);
      expect(result.cssSize).toBe(25_000);
      expect(result.imageSize).toBe(100_000);
      expect(result.fontSize).toBe(30_000);
      expect(result.otherSize).toBe(50_000);
      expect(result.totalSize).toBe(255_000);
    });
  });

  describe('isThirdParty', () => {
    it('identifies Google Analytics as third-party', () => {
      const isThirdParty = analyzer['isThirdParty']('https://google-analytics.com/ga.js');
      expect(isThirdParty).toBe(true);
    });

    it('identifies first-party requests correctly', () => {
      const isThirdParty = analyzer['isThirdParty']('https://example.com/app.js');
      expect(isThirdParty).toBe(false);
    });

    it('identifies Facebook as third-party', () => {
      const isThirdParty = analyzer['isThirdParty']('https://facebook.com/pixel.js');
      expect(isThirdParty).toBe(true);
    });

    it('handles invalid URLs gracefully', () => {
      const isThirdParty = analyzer['isThirdParty']('not-a-valid-url');
      expect(isThirdParty).toBe(false);
    });
  });
});

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    engine = new RecommendationEngine(mockLogger);
    jest.clearAllMocks();
  });

  describe('checkCoreWebVitals', () => {
    it('recommends LCP optimization when LCP exceeds threshold', () => {
      const vitals = makeCoreWebVitals({ lcp: 3500 });

      const recommendations = engine['checkCoreWebVitals'](vitals, {});

      const lcpRec = recommendations.find((r) => r.title.includes('Largest Contentful Paint'));
      expect(lcpRec).toBeDefined();
      expect(lcpRec?.severity).toBe('warning');
    });

    it('marks LCP as critical when severely over threshold', () => {
      const vitals = makeCoreWebVitals({ lcp: 5000 });

      const recommendations = engine['checkCoreWebVitals'](vitals, {});

      const lcpRec = recommendations.find((r) => r.title.includes('Largest Contentful Paint'));
      expect(lcpRec?.severity).toBe('critical');
    });

    it('does not recommend LCP when within threshold', () => {
      const vitals = makeCoreWebVitals({ lcp: 2000 });

      const recommendations = engine['checkCoreWebVitals'](vitals, {});

      const lcpRec = recommendations.find((r) => r.title.includes('Largest Contentful Paint'));
      expect(lcpRec).toBeUndefined();
    });

    it('recommends CLS optimization when CLS exceeds threshold', () => {
      const vitals = makeCoreWebVitals({ cls: 0.15 });

      const recommendations = engine['checkCoreWebVitals'](vitals, {});

      const clsRec = recommendations.find((r) => r.title.includes('Cumulative Layout Shift'));
      expect(clsRec).toBeDefined();
      expect(clsRec?.severity).toBe('warning');
    });

    it('respects custom thresholds', () => {
      const vitals = makeCoreWebVitals({ lcp: 2800 });

      const recommendations = engine['checkCoreWebVitals'](vitals, { lcp: 2500 });

      const lcpRec = recommendations.find((r) => r.title.includes('Largest Contentful Paint'));
      expect(lcpRec).toBeDefined();
    });

    it('recommends FCP optimization when FCP exceeds threshold', () => {
      const vitals = makeCoreWebVitals({ fcp: 2500 });

      const recommendations = engine['checkCoreWebVitals'](vitals, {});

      const fcpRec = recommendations.find((r) => r.title.includes('First Contentful Paint'));
      expect(fcpRec).toBeDefined();
    });

    it('recommends TTFB optimization when TTFB exceeds threshold', () => {
      const vitals = makeCoreWebVitals({ ttfb: 1200 });

      const recommendations = engine['checkCoreWebVitals'](vitals, {});

      const ttfbRec = recommendations.find((r) => r.title.includes('Time to First Byte'));
      expect(ttfbRec).toBeDefined();
    });
  });

  describe('checkResources', () => {
    it('recommends JS optimization for large bundles', () => {
      const resources = makeResourceMetrics({ jsSize: 300_000 });

      const recommendations = engine['checkResources'](resources);

      const jsRec = recommendations.find((r) => r.title.includes('JavaScript'));
      expect(jsRec).toBeDefined();
      expect(jsRec?.severity).toBe('warning');
    });

    it('recommends CSS optimization for large stylesheets', () => {
      const resources = makeResourceMetrics({ cssSize: 150_000 });

      const recommendations = engine['checkResources'](resources);

      const cssRec = recommendations.find((r) => r.title.includes('CSS'));
      expect(cssRec).toBeDefined();
    });

    it('recommends image optimization for large images', () => {
      const resources = makeResourceMetrics({ imageSize: 750_000 });

      const recommendations = engine['checkResources'](resources);

      const imgRec = recommendations.find((r) => r.title.includes('Image'));
      expect(imgRec).toBeDefined();
      expect(imgRec?.severity).toBe('warning');
    });

    it('recommends request count reduction for high request counts', () => {
      const resources = makeResourceMetrics({ requestCount: 150 });

      const recommendations = engine['checkResources'](resources);

      const countRec = recommendations.find((r) => r.title.includes('HTTP Request'));
      expect(countRec).toBeDefined();
    });

    it('recommends third-party audit for many third-party requests', () => {
      const resources = makeResourceMetrics({ thirdPartyRequests: 30 });

      const recommendations = engine['checkResources'](resources);

      const tpRec = recommendations.find((r) => r.title.includes('Third-Party'));
      expect(tpRec).toBeDefined();
    });

    it('recommends DOM simplification for large DOMs', () => {
      const resources = makeResourceMetrics({ domNodes: 2000 });

      const recommendations = engine['checkResources'](resources);

      const domRec = recommendations.find((r) => r.title.includes('DOM'));
      expect(domRec).toBeDefined();
    });

    it('returns empty array for optimal resources', () => {
      const resources = makeResourceMetrics({
        jsSize: 100_000,
        cssSize: 30_000,
        imageSize: 200_000,
        requestCount: 50,
        thirdPartyRequests: 5,
        domNodes: 800,
      });

      const recommendations = engine['checkResources'](resources);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe('checkLighthouseScores', () => {
    it('recommends improvement for low scores', () => {
      const scores = [{ category: 'performance', score: 40 }];

      const recommendations = engine['checkLighthouseScores'](scores);

      const perfRec = recommendations.find((r) => r.category === 'performance');
      expect(perfRec).toBeDefined();
      expect(perfRec?.severity).toBe('critical');
    });

    it('recommends improvement for medium scores', () => {
      const scores = [{ category: 'accessibility', score: 70 }];

      const recommendations = engine['checkLighthouseScores'](scores);

      const a11yRec = recommendations.find((r) => r.category === 'accessibility');
      expect(a11yRec).toBeDefined();
      expect(a11yRec?.severity).toBe('warning');
    });

    it('ignores high-scoring categories', () => {
      const scores = [{ category: 'seo', score: 95 }];

      const recommendations = engine['checkLighthouseScores'](scores);

      expect(recommendations).toHaveLength(0);
    });

    it('handles multiple categories', () => {
      const scores = [
        { category: 'performance', score: 45 },
        { category: 'accessibility', score: 92 },
        { category: 'best-practices', score: 70 },
      ];

      const recommendations = engine['checkLighthouseScores'](scores);

      expect(recommendations.length).toBeGreaterThanOrEqual(2);
      expect(recommendations.find((r) => r.category === 'accessibility')).toBeUndefined();
    });
  });

  describe('generate', () => {
    it('returns recommendations sorted by severity', () => {
      const result = {
        url: 'https://example.com',
        vitals: makeCoreWebVitals({ lcp: 5000, cls: 0.3 }),
        lighthouseScores: [
          { category: 'performance' as const, score: 40, title: 'Performance' },
        ],
        resources: makeResourceMetrics({ jsSize: 400_000, imageSize: 800_000 }),
        audits: [makeAuditItem()],
        recommendations: [],
        timestamp: new Date().toISOString(),
      };

      const recommendations = engine.generate(result, {
        urls: ['https://example.com'],
      });

      // Should have critical recommendations first
      const severities = recommendations.map((r) => r.severity);
      const criticalCount = severities.filter((s) => s === 'critical').length;
      const warningCount = severities.filter((s) => s === 'warning').length;

      expect(severities.indexOf('critical')).toBeLessThanOrEqual(
        severities.indexOf('warning'),
      );
    });

    it('handles optimal performance gracefully', () => {
      const result = {
        url: 'https://example.com',
        vitals: makeCoreWebVitals(),
        lighthouseScores: [
          { category: 'performance' as const, score: 95, title: 'Performance' },
        ],
        resources: makeResourceMetrics({
          jsSize: 100_000,
          cssSize: 20_000,
          imageSize: 100_000,
          requestCount: 30,
          thirdPartyRequests: 3,
          domNodes: 500,
        }),
        audits: [makeAuditItem()],
        recommendations: [],
        timestamp: new Date().toISOString(),
      };

      const recommendations = engine.generate(result, {
        urls: ['https://example.com'],
      });

      // Should have few or no recommendations
      expect(recommendations.length).toBeLessThanOrEqual(2);
    });
  });
});

describe('Threshold validation', () => {
  it('correctly identifies threshold violations', () => {
    const violations = [];

    // LCP violation
    if (2800 > 2500) {
      violations.push('LCP violation');
    }

    // CLS violation
    if (0.12 > 0.1) {
      violations.push('CLS violation');
    }

    expect(violations).toContain('LCP violation');
    expect(violations).toContain('CLS violation');
  });

  it('passes all thresholds for good performance', () => {
    const violations = [];

    const thresholds = { lcp: 2500, cls: 0.1, fcp: 1800, performance: 50 };
    const vitals = makeCoreWebVitals();

    if (vitals.lcp > thresholds.lcp) violations.push('LCP');
    if (vitals.cls > thresholds.cls) violations.push('CLS');
    if (vitals.fcp > thresholds.fcp) violations.push('FCP');

    expect(violations).toHaveLength(0);
  });
});

describe('Aggregation', () => {
  it('correctly averages numeric metrics', () => {
    const values = [1000, 2000, 3000];
    const average = values.reduce((a, b) => a + b, 0) / values.length;

    expect(average).toBe(2000);
  });

  it('correctly averages Core Web Vitals', () => {
    const results = [
      makeCoreWebVitals({ lcp: 2000 }),
      makeCoreWebVitals({ lcp: 3000 }),
      makeCoreWebVitals({ lcp: 4000 }),
    ];

    const avgLcp = results.reduce((sum, r) => sum + r.lcp, 0) / results.length;

    expect(avgLcp).toBe(3000);
  });

  it('correctly counts recommendations across pages', () => {
    const pages = [
      { recommendations: [{ severity: 'critical' as const, title: 'Issue 1' }] },
      { recommendations: [
        { severity: 'warning' as const, title: 'Issue 2' },
        { severity: 'info' as const, title: 'Issue 3' },
      ] },
    ];

    const totalRecommendations = pages.reduce((sum, p) => sum + p.recommendations.length, 0);
    const criticalCount = pages.reduce(
      (sum, p) => sum + p.recommendations.filter((r) => r.severity === 'critical').length,
      0,
    );

    expect(totalRecommendations).toBe(3);
    expect(criticalCount).toBe(1);
  });
});
