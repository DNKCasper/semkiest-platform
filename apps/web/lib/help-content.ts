// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: FaqCategory;
  tags: string[];
}

export interface VideoItem {
  id: string;
  title: string;
  description: string;
  durationLabel: string;
  thumbnailEmoji: string;
  category: string;
}

export interface TroubleshootingItem {
  id: string;
  symptom: string;
  causes: string[];
  solutions: string[];
  category: string;
}

export type FaqCategory =
  | 'getting-started'
  | 'projects'
  | 'test-profiles'
  | 'test-runs'
  | 'billing'
  | 'integrations'
  | 'troubleshooting';

export const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  'getting-started': 'Getting Started',
  projects: 'Projects',
  'test-profiles': 'Test Profiles',
  'test-runs': 'Test Runs',
  billing: 'Billing',
  integrations: 'Integrations',
  troubleshooting: 'Troubleshooting',
};

// ─── FAQ content ──────────────────────────────────────────────────────────────

export const FAQ_ITEMS: FaqItem[] = [
  // Getting Started
  {
    id: 'gs-1',
    question: 'What is SemkiEst?',
    answer:
      'SemkiEst is a collaborative web testing platform that lets your QA, development, and product teams run, schedule, and monitor automated browser tests — all without writing code. Simply point it at a URL, choose a test profile, and run.',
    category: 'getting-started',
    tags: ['intro', 'overview', 'what is'],
  },
  {
    id: 'gs-2',
    question: 'How do I get started?',
    answer:
      'Sign up for a free account, complete the onboarding wizard (it takes 5–10 minutes), and your first test will run automatically. The wizard walks you through creating an organization, adding a project, configuring a test profile, and running your first test.',
    category: 'getting-started',
    tags: ['start', 'sign up', 'onboarding', 'wizard'],
  },
  {
    id: 'gs-3',
    question: 'Do I need to write code to use SemkiEst?',
    answer:
      'No. SemkiEst comes with built-in smoke and accessibility tests that work out of the box. Advanced users can also write custom Playwright scripts and upload them via the API.',
    category: 'getting-started',
    tags: ['code', 'no-code', 'playwright'],
  },
  {
    id: 'gs-4',
    question: 'What browsers does SemkiEst support?',
    answer:
      'SemkiEst supports Chromium, Firefox, and WebKit (Safari engine) via Playwright. You can run tests on multiple browsers simultaneously using test profiles.',
    category: 'getting-started',
    tags: ['browsers', 'chromium', 'firefox', 'webkit', 'safari'],
  },
  // Projects
  {
    id: 'proj-1',
    question: 'How many projects can I create?',
    answer:
      'Free accounts include up to 3 projects. Pro and Enterprise plans have unlimited projects. Each project can target a different URL and have its own test profiles and schedules.',
    category: 'projects',
    tags: ['limits', 'projects', 'free plan'],
  },
  {
    id: 'proj-2',
    question: 'Can I invite teammates to a project?',
    answer:
      'Yes. From your project settings, click "Team Members" and enter your teammate\'s email. They\'ll receive an invitation link. Team management is available on all plans.',
    category: 'projects',
    tags: ['team', 'invite', 'collaboration'],
  },
  {
    id: 'proj-3',
    question: 'How do I delete a project?',
    answer:
      'Go to Project Settings → Danger Zone → Delete Project. This action is irreversible and will delete all test runs and results associated with the project. We recommend exporting your results first.',
    category: 'projects',
    tags: ['delete', 'remove', 'danger zone'],
  },
  // Test Profiles
  {
    id: 'tp-1',
    question: 'What is a test profile?',
    answer:
      'A test profile defines the runtime configuration for a test run: browser engine, viewport size, headless/headed mode, and network conditions. You can have multiple profiles per project — for example, one for desktop Chrome and another for mobile Safari.',
    category: 'test-profiles',
    tags: ['profile', 'browser', 'viewport', 'configuration'],
  },
  {
    id: 'tp-2',
    question: 'What viewport sizes are available?',
    answer:
      'SemkiEst ships with presets for 1280×720 (HD desktop), 1920×1080 (Full HD), and 375×812 (iPhone). Custom viewports are supported on Pro and Enterprise plans.',
    category: 'test-profiles',
    tags: ['viewport', 'mobile', 'desktop', 'resolution'],
  },
  {
    id: 'tp-3',
    question: 'What is headless mode?',
    answer:
      'Headless mode runs the browser without a graphical interface. It\'s faster and ideal for CI/CD pipelines. Headed (non-headless) mode opens a visible browser window, which is useful for debugging test failures.',
    category: 'test-profiles',
    tags: ['headless', 'headed', 'ci', 'debugging'],
  },
  // Test Runs
  {
    id: 'tr-1',
    question: 'How long do test runs take?',
    answer:
      'A standard smoke test completes in under 2 minutes. Full test suites depend on the number of test cases and network conditions. The dashboard shows estimated and actual durations for each run.',
    category: 'test-runs',
    tags: ['duration', 'speed', 'time'],
  },
  {
    id: 'tr-2',
    question: 'Can I schedule automatic test runs?',
    answer:
      'Yes. From your project dashboard, navigate to Schedules and add a cron expression or choose a simple interval (hourly, daily, etc.). Scheduled runs trigger notifications if tests fail.',
    category: 'test-runs',
    tags: ['schedule', 'cron', 'automation', 'recurring'],
  },
  {
    id: 'tr-3',
    question: 'How do I view test results and screenshots?',
    answer:
      'Click any test run in your project dashboard to see a full results breakdown. Each test case shows pass/fail status, duration, error messages, and — for visual tests — before/after screenshots.',
    category: 'test-runs',
    tags: ['results', 'screenshots', 'details'],
  },
  // Billing
  {
    id: 'billing-1',
    question: 'Is there a free plan?',
    answer:
      'Yes! The free plan includes up to 3 projects and 100 test runs per month. No credit card required to get started.',
    category: 'billing',
    tags: ['free', 'pricing', 'cost'],
  },
  {
    id: 'billing-2',
    question: 'Can I change my plan later?',
    answer:
      'Absolutely. You can upgrade or downgrade your plan at any time from Settings → Billing. Upgrades take effect immediately; downgrades take effect at the end of the current billing cycle.',
    category: 'billing',
    tags: ['upgrade', 'downgrade', 'plan change'],
  },
  // Integrations
  {
    id: 'int-1',
    question: 'Does SemkiEst integrate with CI/CD pipelines?',
    answer:
      'Yes. SemkiEst provides a REST API and CLI tool that integrate with GitHub Actions, GitLab CI, CircleCI, and any system that supports webhooks or HTTP requests.',
    category: 'integrations',
    tags: ['ci', 'cd', 'github actions', 'gitlab', 'api'],
  },
  {
    id: 'int-2',
    question: 'Can I receive Slack or email notifications?',
    answer:
      'Yes. Navigate to Project Settings → Notifications to configure Slack webhooks, email recipients, and alert conditions (e.g., only on failure, always, or on status change).',
    category: 'integrations',
    tags: ['slack', 'email', 'notifications', 'alerts', 'webhooks'],
  },
];

// ─── Video content ────────────────────────────────────────────────────────────

export const VIDEO_ITEMS: VideoItem[] = [
  {
    id: 'vid-1',
    title: 'Getting Started with SemkiEst',
    description:
      'A complete walkthrough of the onboarding wizard — from sign-up to your first successful test run in under 10 minutes.',
    durationLabel: '8 min',
    thumbnailEmoji: '🚀',
    category: 'Getting Started',
  },
  {
    id: 'vid-2',
    title: 'Creating and Managing Projects',
    description:
      'Learn how to create projects, configure settings, invite teammates, and organize your testing workspace.',
    durationLabel: '5 min',
    thumbnailEmoji: '📁',
    category: 'Projects',
  },
  {
    id: 'vid-3',
    title: 'Understanding Test Profiles',
    description:
      'Deep dive into test profiles: browser selection, viewport configuration, and best practices for cross-browser coverage.',
    durationLabel: '6 min',
    thumbnailEmoji: '🔧',
    category: 'Test Profiles',
  },
  {
    id: 'vid-4',
    title: 'Analyzing Test Results',
    description:
      'Navigate the results dashboard, interpret pass/fail breakdowns, and use screenshots to diagnose failures quickly.',
    durationLabel: '7 min',
    thumbnailEmoji: '📊',
    category: 'Test Runs',
  },
  {
    id: 'vid-5',
    title: 'CI/CD Integration with GitHub Actions',
    description:
      'Step-by-step guide to integrating SemkiEst into your GitHub Actions pipeline for automated testing on every push.',
    durationLabel: '10 min',
    thumbnailEmoji: '⚙️',
    category: 'Integrations',
  },
  {
    id: 'vid-6',
    title: 'Scheduling and Monitoring Tests',
    description:
      'Set up scheduled test runs, configure failure notifications, and use the monitoring dashboard to track trends over time.',
    durationLabel: '6 min',
    thumbnailEmoji: '🕐',
    category: 'Scheduling',
  },
];

// ─── Troubleshooting content ──────────────────────────────────────────────────

export const TROUBLESHOOTING_ITEMS: TroubleshootingItem[] = [
  {
    id: 'ts-1',
    symptom: 'Test run fails immediately with "URL unreachable"',
    causes: [
      'The URL entered in the project is incorrect or uses HTTP instead of HTTPS.',
      'The target server is behind a firewall that blocks SemkiEst test runners.',
      'The server requires authentication (e.g. Basic Auth) not configured in the profile.',
    ],
    solutions: [
      'Double-check the project URL under Project Settings.',
      'Allowlist SemkiEst\'s IP ranges in your firewall (see Settings → IP Allowlist).',
      'Add HTTP Basic Auth credentials in Project Settings → Authentication.',
    ],
    category: 'Connectivity',
  },
  {
    id: 'ts-2',
    symptom: 'Screenshots look wrong or elements are misplaced',
    causes: [
      'The viewport size in the test profile does not match your application\'s responsive breakpoint.',
      'A third-party script (e.g. chat widget, cookie banner) is covering content.',
      'Animations are causing non-deterministic screenshots.',
    ],
    solutions: [
      'Try a different viewport in your test profile settings.',
      'Use the "Dismiss cookie banners" option in Profile → Accessibility.',
      'Enable "Reduce motion" in the profile to disable CSS animations.',
    ],
    category: 'Visual',
  },
  {
    id: 'ts-3',
    symptom: 'Tests pass locally but fail in SemkiEst',
    causes: [
      'Your local environment exposes different content than the URL in the project.',
      'The test depends on dynamic data (dates, user-specific content) that changes.',
      'A race condition caused by slower network conditions in the test runner.',
    ],
    solutions: [
      'Verify the project URL points to a stable environment (not localhost).',
      'Review your test assertions to avoid relying on dynamic values.',
      'Increase the element wait timeout in Profile → Advanced Settings.',
    ],
    category: 'Test Logic',
  },
  {
    id: 'ts-4',
    symptom: 'Scheduled runs are not triggering',
    causes: [
      'The schedule cron expression has a syntax error.',
      'The project\'s schedule is paused.',
      'The account has exceeded the monthly test run limit.',
    ],
    solutions: [
      'Validate your cron expression at crontab.guru before saving.',
      'Check Project Settings → Schedules and ensure the schedule is active.',
      'Review your usage on the Billing page and upgrade if necessary.',
    ],
    category: 'Scheduling',
  },
  {
    id: 'ts-5',
    symptom: 'API requests return 401 Unauthorized',
    causes: [
      'The API key is missing or has been revoked.',
      'The Authorization header is malformed.',
    ],
    solutions: [
      'Generate a new API key from Settings → API Keys.',
      'Ensure the header format is: Authorization: Bearer <your-api-key>',
    ],
    category: 'API',
  },
];

// ─── Search helper ────────────────────────────────────────────────────────────

/** Returns FAQ items matching the query (case-insensitive substring match). */
export function searchFaq(query: string): FaqItem[] {
  if (!query.trim()) return FAQ_ITEMS;
  const lower = query.toLowerCase();
  return FAQ_ITEMS.filter(
    (item) =>
      item.question.toLowerCase().includes(lower) ||
      item.answer.toLowerCase().includes(lower) ||
      item.tags.some((tag) => tag.toLowerCase().includes(lower)),
  );
}

/** Returns all content items matching the query. */
export function globalHelpSearch(query: string): {
  faq: FaqItem[];
  videos: VideoItem[];
  troubleshooting: TroubleshootingItem[];
} {
  if (!query.trim()) {
    return { faq: [], videos: [], troubleshooting: [] };
  }
  const lower = query.toLowerCase();

  const faq = FAQ_ITEMS.filter(
    (item) =>
      item.question.toLowerCase().includes(lower) ||
      item.answer.toLowerCase().includes(lower) ||
      item.tags.some((tag) => tag.toLowerCase().includes(lower)),
  );

  const videos = VIDEO_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower) ||
      item.category.toLowerCase().includes(lower),
  );

  const troubleshooting = TROUBLESHOOTING_ITEMS.filter(
    (item) =>
      item.symptom.toLowerCase().includes(lower) ||
      item.causes.some((c) => c.toLowerCase().includes(lower)) ||
      item.solutions.some((s) => s.toLowerCase().includes(lower)) ||
      item.category.toLowerCase().includes(lower),
  );

  return { faq, videos, troubleshooting };
}
