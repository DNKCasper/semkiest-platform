import type { Page } from 'playwright';
import { testKeyboardNavigation } from './keyboard-tester';

function makePage(overrides: Partial<Page> = {}): Page {
  return overrides as unknown as Page;
}

describe('testKeyboardNavigation', () => {
  it('returns passed=true when no violations are found', async () => {
    const page = makePage({
      evaluate: jest.fn().mockImplementation(async (fn: unknown) => {
        // Return empty arrays for all three parallel evaluate calls
        if (typeof fn === 'function') {
          return [];
        }
        return [];
      }),
    });

    const result = await testKeyboardNavigation(page);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags elements with positive tabindex as violations', async () => {
    let callCount = 0;
    const page = makePage({
      evaluate: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // captureTabOrder result — element with positive tabIndex
          return [
            {
              index: 0,
              element: '#bad-button',
              tagName: 'button',
              text: 'Click me',
              isFocusable: true,
              tabIndex: 3,
            },
          ];
        }
        return []; // checkSkipLinks and checkFocusIndicators return empty
      }),
    });

    const result = await testKeyboardNavigation(page);
    expect(result.passed).toBe(false);
    const tabViolations = result.violations.filter((v) => v.type === 'tab-order');
    expect(tabViolations.length).toBeGreaterThan(0);
    expect(tabViolations[0].element).toBe('#bad-button');
  });

  it('flags skip links whose targets do not exist', async () => {
    let callCount = 0;
    const page = makePage({
      evaluate: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return []; // tabOrder
        if (callCount === 2) {
          // skipLinks — broken skip link
          return [
            {
              href: '#missing-section',
              text: 'Skip to main content',
              isVisible: true,
              targetExists: false,
              passed: false,
            },
          ];
        }
        return []; // focusIndicators
      }),
    });

    const result = await testKeyboardNavigation(page);
    expect(result.passed).toBe(false);
    const skipViolations = result.violations.filter((v) => v.type === 'skip-link');
    expect(skipViolations).toHaveLength(1);
    expect(skipViolations[0].message).toContain('missing target');
  });

  it('flags elements without visible focus indicators', async () => {
    let callCount = 0;
    const page = makePage({
      evaluate: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return []; // tabOrder
        if (callCount === 2) return []; // skipLinks
        // focusIndicators — element without outline
        return [
          {
            element: 'button.cta',
            hasVisibleOutline: false,
            outlineStyle: 'none',
            passed: false,
          },
        ];
      }),
    });

    const result = await testKeyboardNavigation(page);
    expect(result.passed).toBe(false);
    const indicatorViolations = result.violations.filter(
      (v) => v.type === 'focus-indicator'
    );
    expect(indicatorViolations).toHaveLength(1);
    expect(indicatorViolations[0].element).toBe('button.cta');
  });
});
