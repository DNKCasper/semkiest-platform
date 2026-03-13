import type { Page } from 'playwright';

export interface AriaValidationResult {
  passed: boolean;
  violations: AriaViolation[];
  landmarks: LandmarkResult;
  roles: RoleCheckResult[];
  labels: AriaLabelResult[];
}

export interface AriaViolation {
  type:
    | 'missing-landmark'
    | 'invalid-role'
    | 'missing-label'
    | 'duplicate-id'
    | 'invalid-aria-attribute'
    | 'orphaned-aria';
  element: string;
  message: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
}

export interface LandmarkResult {
  hasMain: boolean;
  hasNav: boolean;
  hasBanner: boolean;
  hasContentInfo: boolean;
  duplicateMain: boolean;
  duplicateBanner: boolean;
  duplicateContentInfo: boolean;
  regions: LandmarkEntry[];
}

export interface LandmarkEntry {
  role: string;
  selector: string;
  label: string | null;
}

export interface RoleCheckResult {
  element: string;
  role: string;
  isValid: boolean;
  issue?: string;
}

export interface AriaLabelResult {
  element: string;
  labelType: 'aria-label' | 'aria-labelledby' | 'title' | 'none';
  labelText: string | null;
  hasAccessibleName: boolean;
}

/** WAI-ARIA 1.2 valid role names. */
const VALID_ARIA_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'button',
  'cell', 'checkbox', 'columnheader', 'combobox', 'complementary',
  'contentinfo', 'definition', 'dialog', 'directory', 'document',
  'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading',
  'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main',
  'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'navigation', 'none', 'note', 'option', 'presentation',
  'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
  'rowheader', 'scrollbar', 'search', 'searchbox', 'separator',
  'slider', 'spinbutton', 'status', 'switch', 'tab', 'table',
  'tablist', 'tabpanel', 'term', 'textbox', 'timer', 'toolbar',
  'tooltip', 'tree', 'treegrid', 'treeitem',
]);

/**
 * Validates ARIA attributes, landmark regions, roles, and accessible names
 * across the full page.
 */
export async function validateAria(page: Page): Promise<AriaValidationResult> {
  const violations: AriaViolation[] = [];

  const [landmarks, roles, labels, duplicateIds, invalidAttributes] =
    await Promise.all([
      checkLandmarks(page),
      checkAriaRoles(page),
      checkAriaLabels(page),
      findDuplicateIds(page),
      checkInvalidAriaAttributes(page),
    ]);

  // Landmark violations
  if (!landmarks.hasMain) {
    violations.push({
      type: 'missing-landmark',
      element: 'document',
      message: 'Page is missing a <main> landmark region.',
      severity: 'serious',
    });
  }
  if (landmarks.duplicateMain) {
    violations.push({
      type: 'missing-landmark',
      element: '[role="main"], main',
      message: 'Page contains multiple <main> landmark regions; only one is allowed.',
      severity: 'moderate',
    });
  }
  if (!landmarks.hasNav) {
    violations.push({
      type: 'missing-landmark',
      element: 'document',
      message: 'Page is missing a navigation landmark (nav or role="navigation").',
      severity: 'moderate',
    });
  }
  if (landmarks.duplicateBanner) {
    violations.push({
      type: 'missing-landmark',
      element: '[role="banner"], header',
      message: 'Page contains multiple banner landmark regions.',
      severity: 'moderate',
    });
  }
  if (landmarks.duplicateContentInfo) {
    violations.push({
      type: 'missing-landmark',
      element: '[role="contentinfo"], footer',
      message: 'Page contains multiple contentinfo landmark regions.',
      severity: 'moderate',
    });
  }

  // Role violations
  for (const role of roles) {
    if (!role.isValid) {
      violations.push({
        type: 'invalid-role',
        element: role.element,
        message: role.issue ?? `Element has invalid ARIA role: "${role.role}".`,
        severity: 'serious',
      });
    }
  }

  // Label violations — interactive elements must have accessible names
  for (const label of labels) {
    if (!label.hasAccessibleName) {
      violations.push({
        type: 'missing-label',
        element: label.element,
        message: `Interactive element is missing an accessible name (no aria-label, aria-labelledby, or title).`,
        severity: 'critical',
      });
    }
  }

  // Duplicate ID violations
  for (const id of duplicateIds) {
    violations.push({
      type: 'duplicate-id',
      element: `#${id}`,
      message: `Duplicate id="${id}" found in the document. IDs must be unique.`,
      severity: 'serious',
    });
  }

  // Invalid ARIA attribute violations
  for (const attr of invalidAttributes) {
    violations.push({
      type: 'invalid-aria-attribute',
      element: attr.element,
      message: attr.message,
      severity: 'serious',
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    landmarks,
    roles,
    labels,
  };
}

async function checkLandmarks(page: Page): Promise<LandmarkResult> {
  return page.evaluate((validRoles) => {
    const query = (sel: string) => Array.from(document.querySelectorAll(sel));

    const mains = [
      ...query('main'),
      ...query('[role="main"]'),
    ];
    const navs = [
      ...query('nav'),
      ...query('[role="navigation"]'),
    ];
    const banners = [
      ...query('header:not(article header):not(section header)'),
      ...query('[role="banner"]'),
    ];
    const contentInfos = [
      ...query('footer:not(article footer):not(section footer)'),
      ...query('[role="contentinfo"]'),
    ];

    const allLandmarkSelectors = [
      'main', 'nav', 'header', 'footer', 'aside', 'section[aria-label]',
      '[role="main"]', '[role="navigation"]', '[role="banner"]',
      '[role="contentinfo"]', '[role="complementary"]', '[role="region"]',
      '[role="search"]', '[role="form"]',
    ].join(', ');

    const regions: { role: string; selector: string; label: string | null }[] =
      Array.from(document.querySelectorAll(allLandmarkSelectors)).map((el) => {
        const explicitRole = el.getAttribute('role');
        const tag = el.tagName.toLowerCase();
        const roleMap: Record<string, string> = {
          main: 'main', nav: 'navigation', header: 'banner',
          footer: 'contentinfo', aside: 'complementary',
        };
        const role = explicitRole ?? roleMap[tag] ?? tag;
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          null;
        const selector = el.id
          ? `#${el.id}`
          : `${tag}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`;
        return { role, selector, label };
      });

    return {
      hasMain: mains.length > 0,
      hasNav: navs.length > 0,
      hasBanner: banners.length > 0,
      hasContentInfo: contentInfos.length > 0,
      duplicateMain: mains.length > 1,
      duplicateBanner: banners.length > 1,
      duplicateContentInfo: contentInfos.length > 1,
      regions,
    };
  }, Array.from(VALID_ARIA_ROLES));
}

async function checkAriaRoles(page: Page): Promise<RoleCheckResult[]> {
  const validRoles = Array.from(VALID_ARIA_ROLES);
  return page.evaluate((roles) => {
    const validSet = new Set(roles);
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('[role]')
    );

    return elements.map((el) => {
      const role = el.getAttribute('role') || '';
      const selector = el.id
        ? `#${el.id}`
        : `${el.tagName.toLowerCase()}[role="${role}"]`;
      const isValid = validSet.has(role);
      return {
        element: selector,
        role,
        isValid,
        issue: isValid
          ? undefined
          : `"${role}" is not a valid WAI-ARIA role.`,
      };
    });
  }, validRoles);
}

async function checkAriaLabels(page: Page): Promise<AriaLabelResult[]> {
  return page.evaluate(() => {
    const interactiveSelectors = [
      'button', 'a[href]', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="textbox"]',
      '[role="checkbox"]', '[role="radio"]', '[role="combobox"]',
      '[role="listbox"]', '[role="spinbutton"]', '[role="slider"]',
    ].join(', ');

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(interactiveSelectors)
    );

    return elements.map((el) => {
      const tag = el.tagName.toLowerCase();
      const selector = el.id
        ? `#${el.id}`
        : `${tag}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`;

      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      const title = el.getAttribute('title');
      const text = el.textContent?.trim();

      let labelType: 'aria-label' | 'aria-labelledby' | 'title' | 'none' = 'none';
      let labelText: string | null = null;

      if (ariaLabel) {
        labelType = 'aria-label';
        labelText = ariaLabel;
      } else if (ariaLabelledBy) {
        labelType = 'aria-labelledby';
        const labelEl = document.getElementById(ariaLabelledBy);
        labelText = labelEl?.textContent?.trim() ?? null;
      } else if (title) {
        labelType = 'title';
        labelText = title;
      }

      const hasAccessibleName =
        !!ariaLabel || !!ariaLabelledBy || !!title || !!text;

      return { element: selector, labelType, labelText, hasAccessibleName };
    });
  });
}

async function findDuplicateIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const allIds = Array.from(document.querySelectorAll('[id]')).map(
      (el) => el.id
    );
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const id of allIds) {
      if (seen.has(id)) duplicates.add(id);
      else seen.add(id);
    }
    return Array.from(duplicates);
  });
}

interface InvalidAriaAttr {
  element: string;
  message: string;
}

async function checkInvalidAriaAttributes(page: Page): Promise<InvalidAriaAttr[]> {
  return page.evaluate(() => {
    const results: { element: string; message: string }[] = [];

    // Check aria-hidden on focusable elements
    const hiddenFocusable = Array.from(
      document.querySelectorAll<HTMLElement>('[aria-hidden="true"]')
    ).filter((el) => {
      const tag = el.tagName.toLowerCase();
      return ['a', 'button', 'input', 'select', 'textarea'].includes(tag);
    });

    for (const el of hiddenFocusable) {
      const selector = el.id
        ? `#${el.id}`
        : el.tagName.toLowerCase();
      results.push({
        element: selector,
        message: `Focusable element has aria-hidden="true", which hides it from assistive technology while keeping it keyboard-reachable.`,
      });
    }

    // Check aria-labelledby references point to existing elements
    const labelledElements = Array.from(
      document.querySelectorAll('[aria-labelledby]')
    );
    for (const el of labelledElements) {
      const ref = el.getAttribute('aria-labelledby') || '';
      if (ref && !document.getElementById(ref)) {
        const selector = el.id
          ? `#${el.id}`
          : el.tagName.toLowerCase();
        results.push({
          element: selector,
          message: `aria-labelledby references non-existent id="${ref}".`,
        });
      }
    }

    // Check aria-describedby references
    const describedElements = Array.from(
      document.querySelectorAll('[aria-describedby]')
    );
    for (const el of describedElements) {
      const ref = el.getAttribute('aria-describedby') || '';
      if (ref && !document.getElementById(ref)) {
        const selector = el.id
          ? `#${el.id}`
          : el.tagName.toLowerCase();
        results.push({
          element: selector,
          message: `aria-describedby references non-existent id="${ref}".`,
        });
      }
    }

    return results;
  });
}
