/**
 * Interaction Discovery
 *
 * Analyses crawled pages and identifies all testable user interactions,
 * categorising them by type and assigning a flow classification.
 *
 * Dependency: SEM-51 (Site Crawler & Sitemap Builder) — receives CrawledPage[].
 */

import { createHash } from 'crypto';
import type {
  ButtonElement,
  CrawledPage,
  DiscoveredInteraction,
  FlowType,
  FormElement,
  InputElement,
  InteractionComplexity,
  PageLink,
} from './types';

// ---------------------------------------------------------------------------
// URL and content heuristics used to classify interactions
// ---------------------------------------------------------------------------

const LOGIN_URL_PATTERNS = [/\/login/i, /\/sign-?in/i, /\/auth/i, /\/session/i];
const REGISTRATION_URL_PATTERNS = [/\/register/i, /\/sign-?up/i, /\/create[-_]?account/i, /\/join/i];
const CHECKOUT_URL_PATTERNS = [/\/checkout/i, /\/cart/i, /\/payment/i, /\/order/i, /\/purchase/i];
const SEARCH_URL_PATTERNS = [/\/search/i, /\/find/i, /\/filter/i, /\/browse/i, /\?q=/i, /\?s=/i];
const CRUD_CREATE_URL_PATTERNS = [/\/new\b/i, /\/create\b/i, /\/add\b/i];
const CRUD_UPDATE_URL_PATTERNS = [/\/edit\b/i, /\/update\b/i, /\/modify\b/i, /\/\d+\/edit/i];
const CRUD_DELETE_URL_PATTERNS = [/\/delete\b/i, /\/remove\b/i, /\/destroy\b/i];
const PASSWORD_RESET_URL_PATTERNS = [/\/forgot/i, /\/reset-?password/i, /\/recover/i];
const PROFILE_URL_PATTERNS = [/\/profile/i, /\/account/i, /\/settings/i, /\/preferences/i, /\/me\b/i];

const AUTH_REQUIRED_URL_PATTERNS = [
  /\/dashboard/i,
  /\/admin/i,
  /\/profile/i,
  /\/account/i,
  /\/settings/i,
  /\/orders/i,
  /\/checkout/i,
];

const PASSWORD_FIELD_NAMES = ['password', 'passwd', 'pass', 'pwd', 'new_password', 'confirm_password'];
const EMAIL_FIELD_NAMES = ['email', 'e-mail', 'username', 'user_name', 'login'];
const SEARCH_FIELD_NAMES = ['q', 's', 'query', 'search', 'keyword', 'term'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a stable ID from a set of strings using SHA-256. */
function stableId(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/** Test a URL against an array of patterns; return true on first match. */
function matchesAny(url: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(url));
}

/** Return true when the field name or label suggests it is a password field. */
function isPasswordField(field: InputElement): boolean {
  if (field.type === 'password') return true;
  const name = (field.name ?? '').toLowerCase();
  const label = (field.label ?? '').toLowerCase();
  return PASSWORD_FIELD_NAMES.some((n) => name.includes(n) || label.includes(n));
}

/** Return true when the field name or label suggests it is an email / username field. */
function isEmailOrUsernameField(field: InputElement): boolean {
  if (field.type === 'email') return true;
  const name = (field.name ?? '').toLowerCase();
  const label = (field.label ?? '').toLowerCase();
  return EMAIL_FIELD_NAMES.some((n) => name.includes(n) || label.includes(n));
}

/** Return true when the field looks like a search input. */
function isSearchField(field: InputElement): boolean {
  if (field.type === 'search') return true;
  const name = (field.name ?? '').toLowerCase();
  const placeholder = (field.placeholder ?? '').toLowerCase();
  return (
    SEARCH_FIELD_NAMES.some((n) => name === n) ||
    placeholder.includes('search') ||
    placeholder.includes('find')
  );
}

// ---------------------------------------------------------------------------
// FlowType detection
// ---------------------------------------------------------------------------

/** Infer the FlowType from a form's fields and the page URL. */
function classifyFormFlowType(form: FormElement, pageUrl: string): FlowType {
  const fields = form.fields;
  const hasPassword = fields.some(isPasswordField);
  const hasEmail = fields.some(isEmailOrUsernameField);
  const hasSearch = fields.some(isSearchField);

  if (matchesAny(pageUrl, PASSWORD_RESET_URL_PATTERNS)) return 'password_reset';
  if (matchesAny(pageUrl, LOGIN_URL_PATTERNS) && hasPassword) return 'login';
  if (matchesAny(pageUrl, REGISTRATION_URL_PATTERNS)) return 'registration';
  if (matchesAny(pageUrl, CHECKOUT_URL_PATTERNS)) return 'checkout';
  if (matchesAny(pageUrl, SEARCH_URL_PATTERNS) || hasSearch) return 'search_filter';
  if (matchesAny(pageUrl, CRUD_CREATE_URL_PATTERNS)) return 'crud_create';
  if (matchesAny(pageUrl, CRUD_UPDATE_URL_PATTERNS)) return 'crud_update';
  if (matchesAny(pageUrl, CRUD_DELETE_URL_PATTERNS)) return 'crud_delete';
  if (matchesAny(pageUrl, PROFILE_URL_PATTERNS)) return 'profile_management';

  // Heuristic: small form with email + password ⟹ login
  if (hasPassword && hasEmail && fields.length <= 4) return 'login';
  // Heuristic: form with password + more than 4 fields ⟹ registration
  if (hasPassword && fields.length > 4) return 'registration';

  return 'unknown';
}

/** Infer the FlowType for a standalone button click. */
function classifyButtonFlowType(button: ButtonElement, pageUrl: string): FlowType {
  const text = button.text.toLowerCase();

  if (matchesAny(pageUrl, CRUD_DELETE_URL_PATTERNS) || text.includes('delete') || text.includes('remove')) {
    return 'crud_delete';
  }
  if (matchesAny(pageUrl, CRUD_UPDATE_URL_PATTERNS) || text.includes('save') || text.includes('update')) {
    return 'crud_update';
  }
  if (matchesAny(pageUrl, CRUD_CREATE_URL_PATTERNS) || text.includes('create') || text.includes('add new')) {
    return 'crud_create';
  }
  if (matchesAny(pageUrl, CHECKOUT_URL_PATTERNS) || text.includes('checkout') || text.includes('buy')) {
    return 'checkout';
  }
  if (text.includes('search') || text.includes('find')) return 'search_filter';

  return 'navigation';
}

// ---------------------------------------------------------------------------
// Complexity calculation
// ---------------------------------------------------------------------------

/** Estimate interaction complexity based on field count and step count. */
function calculateFormComplexity(form: FormElement): InteractionComplexity {
  const fieldCount = form.fields.length;
  if (fieldCount <= 2) return 'simple';
  if (fieldCount <= 6) return 'moderate';
  return 'complex';
}

/** Estimate whether a page is likely to require authentication. */
function requiresAuthentication(page: CrawledPage): boolean {
  return matchesAny(page.url, AUTH_REQUIRED_URL_PATTERNS);
}

// ---------------------------------------------------------------------------
// InteractionDiscovery class
// ---------------------------------------------------------------------------

/**
 * Analyses an array of crawled pages and produces a flat list of
 * DiscoveredInteraction objects, one per distinct testable action.
 */
export class InteractionDiscovery {
  /**
   * Discover all testable interactions across the provided pages.
   *
   * The method is deterministic: given the same input pages it always
   * returns the same interactions in the same order.
   *
   * @param pages - Pages returned by the site crawler (SEM-51).
   * @returns Flat list of discovered interactions, sorted by page URL.
   */
  discoverInteractions(pages: CrawledPage[]): DiscoveredInteraction[] {
    const interactions: DiscoveredInteraction[] = [];

    for (const page of pages) {
      // 1. Analyse every form on the page
      for (const form of page.forms) {
        const interaction = this.analyseForm(page, form);
        if (interaction !== null) {
          interactions.push(interaction);
        }
      }

      // 2. Analyse standalone (non-submit) buttons
      const standaloneButtons = this.filterStandaloneButtons(page);
      for (const button of standaloneButtons) {
        interactions.push(this.analyseButton(page, button));
      }

      // 3. Analyse the navigation structure
      const navInteraction = this.analyseNavigation(page);
      if (navInteraction !== null) {
        interactions.push(navInteraction);
      }

      // 4. Detect search interactions not already covered by forms
      if (!page.forms.some((f) => f.fields.some(isSearchField))) {
        const searchInteraction = this.analyseSearchInputs(page);
        if (searchInteraction !== null) {
          interactions.push(searchInteraction);
        }
      }
    }

    // Stable sort by page URL then by interaction description
    return interactions.sort((a, b) =>
      a.pageUrl.localeCompare(b.pageUrl) || a.description.localeCompare(b.description),
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private analyseForm(page: CrawledPage, form: FormElement): DiscoveredInteraction | null {
    if (form.fields.length === 0) return null;

    const flowType = classifyFormFlowType(form, page.url);
    const complexity = calculateFormComplexity(form);

    const description = this.describeForm(form, flowType);

    return {
      id: stableId(page.url, 'form', form.selector, description),
      pageUrl: page.url,
      pageTitle: page.title,
      type: flowType === 'login' || flowType === 'registration' ? 'authentication' : 'form_submission',
      description,
      elements: [form, ...form.fields],
      flowType,
      complexity,
      requiresAuth: requiresAuthentication(page),
    };
  }

  private analyseButton(page: CrawledPage, button: ButtonElement): DiscoveredInteraction {
    const flowType = classifyButtonFlowType(button, page.url);
    const description = `Click "${button.text}" button`;

    return {
      id: stableId(page.url, 'button', button.selector),
      pageUrl: page.url,
      pageTitle: page.title,
      type: 'button_click',
      description,
      elements: [button],
      flowType,
      complexity: 'simple',
      requiresAuth: requiresAuthentication(page),
    };
  }

  private analyseNavigation(page: CrawledPage): DiscoveredInteraction | null {
    const navLinks = page.links.filter((l) => l.isNavigation && !l.isExternal);
    if (navLinks.length === 0) return null;

    const description = `Navigate via site navigation (${navLinks.length} links)`;

    return {
      id: stableId(page.url, 'navigation'),
      pageUrl: page.url,
      pageTitle: page.title,
      type: 'navigation',
      description,
      elements: navLinks as Array<InputElement | ButtonElement | PageLink | FormElement>,
      flowType: 'navigation',
      complexity: navLinks.length > 10 ? 'moderate' : 'simple',
      requiresAuth: false,
    };
  }

  private analyseSearchInputs(page: CrawledPage): DiscoveredInteraction | null {
    const searchInputs = page.inputs.filter(isSearchField);
    if (searchInputs.length === 0) return null;

    return {
      id: stableId(page.url, 'search'),
      pageUrl: page.url,
      pageTitle: page.title,
      type: 'search',
      description: 'Enter a search query and submit',
      elements: searchInputs,
      flowType: 'search_filter',
      complexity: 'simple',
      requiresAuth: false,
    };
  }

  /**
   * Return buttons that are not inside a form and not hidden/invisible.
   * Filters out obvious utility buttons (back, close, cancel).
   */
  private filterStandaloneButtons(page: CrawledPage): ButtonElement[] {
    const formSelectors = new Set(page.forms.flatMap((f) => f.fields.map((fi) => fi.selector)));
    const skipTexts = ['cancel', 'close', 'back', 'dismiss', 'x'];

    return page.buttons.filter((b) => {
      const inForm = formSelectors.has(b.selector) || b.isSubmit === true;
      const isUtility = skipTexts.some((t) => b.text.toLowerCase().trim() === t);
      return !inForm && !isUtility;
    });
  }

  private describeForm(form: FormElement, flowType: FlowType): string {
    const submitText = form.submitButton?.text ?? 'Submit';
    switch (flowType) {
      case 'login':
        return 'Submit login credentials';
      case 'registration':
        return 'Complete user registration form';
      case 'checkout':
        return 'Complete checkout / payment form';
      case 'search_filter':
        return 'Submit search / filter query';
      case 'crud_create':
        return `Create a new record via form (${submitText})`;
      case 'crud_update':
        return `Update an existing record via form (${submitText})`;
      case 'password_reset':
        return 'Request password reset';
      case 'profile_management':
        return 'Update profile / account settings';
      default:
        return `Submit form (${submitText})`;
    }
  }
}
