import type { Page } from 'playwright';
import { validateAria } from './aria-validator';

function makePageWithEvaluate(responses: unknown[]): Page {
  let callIndex = 0;
  return {
    evaluate: jest.fn().mockImplementation(async () => {
      const response = responses[callIndex] ?? [];
      callIndex++;
      return response;
    }),
  } as unknown as Page;
}

describe('validateAria', () => {
  const goodLandmarks = {
    hasMain: true,
    hasNav: true,
    hasBanner: true,
    hasContentInfo: true,
    duplicateMain: false,
    duplicateBanner: false,
    duplicateContentInfo: false,
    regions: [{ role: 'main', selector: 'main', label: null }],
  };

  it('returns passed=true for a well-structured accessible page', async () => {
    const page = makePageWithEvaluate([
      goodLandmarks, // checkLandmarks
      [],             // checkAriaRoles
      [{ element: 'button', labelType: 'aria-label', labelText: 'Submit', hasAccessibleName: true }], // checkAriaLabels
      [],             // findDuplicateIds
      [],             // checkInvalidAriaAttributes
    ]);

    const result = await validateAria(page);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags missing main landmark', async () => {
    const page = makePageWithEvaluate([
      { ...goodLandmarks, hasMain: false },
      [], [], [], [],
    ]);

    const result = await validateAria(page);
    const missing = result.violations.filter((v) => v.type === 'missing-landmark');
    expect(missing.some((v) => v.message.includes('<main>'))).toBe(true);
  });

  it('flags duplicate main landmark', async () => {
    const page = makePageWithEvaluate([
      { ...goodLandmarks, duplicateMain: true },
      [], [], [], [],
    ]);

    const result = await validateAria(page);
    expect(result.violations.some((v) => v.message.includes('multiple <main>'))).toBe(true);
  });

  it('flags missing nav landmark', async () => {
    const page = makePageWithEvaluate([
      { ...goodLandmarks, hasNav: false },
      [], [], [], [],
    ]);

    const result = await validateAria(page);
    expect(result.violations.some((v) => v.message.includes('navigation landmark'))).toBe(true);
  });

  it('flags invalid ARIA roles', async () => {
    const page = makePageWithEvaluate([
      goodLandmarks,
      [{ element: 'div.card', role: 'fakeRole', isValid: false, issue: '"fakeRole" is not a valid WAI-ARIA role.' }],
      [], [], [],
    ]);

    const result = await validateAria(page);
    const roleViolations = result.violations.filter((v) => v.type === 'invalid-role');
    expect(roleViolations).toHaveLength(1);
    expect(roleViolations[0].element).toBe('div.card');
  });

  it('flags interactive elements with no accessible name', async () => {
    const page = makePageWithEvaluate([
      goodLandmarks,
      [],
      [
        {
          element: 'button.icon-btn',
          labelType: 'none',
          labelText: null,
          hasAccessibleName: false,
        },
      ],
      [], [],
    ]);

    const result = await validateAria(page);
    const labelViolations = result.violations.filter((v) => v.type === 'missing-label');
    expect(labelViolations).toHaveLength(1);
    expect(labelViolations[0].severity).toBe('critical');
  });

  it('flags duplicate IDs', async () => {
    const page = makePageWithEvaluate([
      goodLandmarks,
      [],
      [],
      ['submit-btn', 'main-nav'],
      [],
    ]);

    const result = await validateAria(page);
    const idViolations = result.violations.filter((v) => v.type === 'duplicate-id');
    expect(idViolations).toHaveLength(2);
    expect(idViolations[0].element).toBe('#submit-btn');
  });

  it('flags invalid ARIA attribute references', async () => {
    const page = makePageWithEvaluate([
      goodLandmarks,
      [], [],
      [],
      [{ element: 'input#email', message: 'aria-labelledby references non-existent id="email-label".' }],
    ]);

    const result = await validateAria(page);
    const attrViolations = result.violations.filter(
      (v) => v.type === 'invalid-aria-attribute'
    );
    expect(attrViolations).toHaveLength(1);
    expect(attrViolations[0].element).toBe('input#email');
  });
});
