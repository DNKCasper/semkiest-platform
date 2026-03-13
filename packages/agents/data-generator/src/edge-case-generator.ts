// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Categories of edge cases that can be generated. */
export type EdgeCaseCategory =
  | 'boundary'
  | 'unicode'
  | 'sqlInjection'
  | 'xssInjection'
  | 'commandInjection'
  | 'extremeLength'
  | 'empty'
  | 'whitespace'
  | 'specialChars'
  | 'numeric'
  | 'all';

/** A single labelled edge-case value. */
export interface EdgeCase {
  /** Human-readable label describing why this is an edge case. */
  label: string;
  /** Category the edge case belongs to. */
  category: EdgeCaseCategory;
  /** The actual test value. */
  value: string;
}

/** Options controlling edge-case generation. */
export interface EdgeCaseOptions {
  /** Which categories to include. Defaults to `['all']`. */
  categories?: EdgeCaseCategory[];
  /**
   * Maximum string length for the "extreme length" category.
   * Defaults to 10 000.
   */
  maxLength?: number;
  /**
   * Minimum string length for the "boundary" minimum category.
   * Defaults to 1.
   */
  minLength?: number;
}

// ---------------------------------------------------------------------------
// Static edge-case datasets
// ---------------------------------------------------------------------------

const EMPTY_VALUES: EdgeCase[] = [
  { label: 'Empty string', category: 'empty', value: '' },
  { label: 'Single space', category: 'whitespace', value: ' ' },
  { label: 'Multiple spaces', category: 'whitespace', value: '   ' },
  { label: 'Tab character', category: 'whitespace', value: '\t' },
  { label: 'Newline character', category: 'whitespace', value: '\n' },
  { label: 'Carriage return + newline', category: 'whitespace', value: '\r\n' },
  { label: 'Null byte', category: 'empty', value: '\0' },
];

const UNICODE_VALUES: EdgeCase[] = [
  { label: 'CJK characters', category: 'unicode', value: '你好世界' },
  { label: 'Arabic (RTL)', category: 'unicode', value: 'مرحبا بالعالم' },
  { label: 'Emoji', category: 'unicode', value: '😀🎉🚀💡🔥' },
  { label: 'Emoji in text', category: 'unicode', value: 'Hello 🌍 World' },
  { label: 'Cyrillic', category: 'unicode', value: 'Привет мир' },
  { label: 'Greek', category: 'unicode', value: 'Γεια σου κόσμε' },
  { label: 'Zero-width joiner', category: 'unicode', value: '\u200D' },
  { label: 'Non-breaking space', category: 'unicode', value: '\u00A0' },
  { label: 'BOM character', category: 'unicode', value: '\uFEFF' },
  { label: 'Surrogate pair emoji (flag)', category: 'unicode', value: '🏳️‍🌈' },
  { label: 'Combining diacritical marks', category: 'unicode', value: 'a\u0301' },
  { label: 'Mixed scripts', category: 'unicode', value: 'Héllo Wörld テスト' },
];

const SQL_INJECTION_VALUES: EdgeCase[] = [
  { label: "SQL: classic OR 1=1", category: 'sqlInjection', value: "' OR '1'='1" },
  { label: "SQL: DROP TABLE", category: 'sqlInjection', value: "'; DROP TABLE users;--" },
  { label: "SQL: comment terminator", category: 'sqlInjection', value: "admin'--" },
  { label: "SQL: UNION SELECT", category: 'sqlInjection', value: "' UNION SELECT * FROM users--" },
  { label: "SQL: tautology with AND", category: 'sqlInjection', value: "' AND '1'='1" },
  { label: "SQL: batched statement", category: 'sqlInjection', value: "1; SELECT * FROM information_schema.tables" },
  {
    label: "SQL: sleep/benchmark",
    category: 'sqlInjection',
    value: "' OR SLEEP(5)--",
  },
  { label: "SQL: NULL byte", category: 'sqlInjection', value: "admin\0" },
];

const XSS_INJECTION_VALUES: EdgeCase[] = [
  { label: 'XSS: basic script tag', category: 'xssInjection', value: '<script>alert("XSS")</script>' },
  {
    label: 'XSS: img onerror',
    category: 'xssInjection',
    value: '<img src=x onerror=alert("XSS")>',
  },
  { label: 'XSS: inline event handler', category: 'xssInjection', value: '" onmouseover="alert(1)"' },
  {
    label: 'XSS: javascript: URL',
    category: 'xssInjection',
    value: 'javascript:alert("XSS")',
  },
  { label: 'XSS: SVG payload', category: 'xssInjection', value: '<svg onload=alert("XSS")>' },
  {
    label: 'XSS: HTML entity encoded',
    category: 'xssInjection',
    value: '&lt;script&gt;alert("XSS")&lt;/script&gt;',
  },
  {
    label: 'XSS: Base64 data URI',
    category: 'xssInjection',
    value: '<iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
  },
];

const COMMAND_INJECTION_VALUES: EdgeCase[] = [
  { label: 'Command injection: semicolon', category: 'commandInjection', value: '; ls -la' },
  { label: 'Command injection: pipe', category: 'commandInjection', value: '| cat /etc/passwd' },
  { label: 'Command injection: backtick', category: 'commandInjection', value: '`id`' },
  { label: 'Command injection: $() substitution', category: 'commandInjection', value: '$(whoami)' },
  { label: 'Command injection: && operator', category: 'commandInjection', value: '&& echo pwned' },
  { label: 'Command injection: Windows cmd', category: 'commandInjection', value: '& dir' },
];

const SPECIAL_CHARS_VALUES: EdgeCase[] = [
  { label: 'All common special chars', category: 'specialChars', value: '!@#$%^&*()_+-=[]{}|;\':",.<>?/`~\\' },
  { label: 'Angle brackets', category: 'specialChars', value: '<>' },
  { label: 'Quotes mixed', category: 'specialChars', value: '"\'`' },
  { label: 'Backslash sequences', category: 'specialChars', value: '\\n\\t\\r\\0' },
  { label: 'Control characters', category: 'specialChars', value: '\x01\x02\x03\x1f' },
  { label: 'Format characters', category: 'specialChars', value: '%s %d %n %x' },
  { label: 'Path traversal', category: 'specialChars', value: '../../../etc/passwd' },
  { label: 'Windows path traversal', category: 'specialChars', value: '..\\..\\..\\windows\\system32' },
];

const NUMERIC_EDGE_CASES: EdgeCase[] = [
  { label: 'Zero', category: 'numeric', value: '0' },
  { label: 'Negative zero', category: 'numeric', value: '-0' },
  { label: 'Negative integer', category: 'numeric', value: '-1' },
  { label: 'Very large integer', category: 'numeric', value: '9999999999999999' },
  { label: 'Very small float', category: 'numeric', value: '0.0000000001' },
  { label: 'NaN string', category: 'numeric', value: 'NaN' },
  { label: 'Infinity', category: 'numeric', value: 'Infinity' },
  { label: 'Negative infinity', category: 'numeric', value: '-Infinity' },
  { label: 'Hexadecimal', category: 'numeric', value: '0xFF' },
  { label: 'Scientific notation', category: 'numeric', value: '1e308' },
  { label: 'Negative scientific notation', category: 'numeric', value: '-1e308' },
];

// ---------------------------------------------------------------------------
// EdgeCaseGenerator
// ---------------------------------------------------------------------------

/**
 * Generates edge-case test values covering boundary conditions, Unicode,
 * injection attacks, extreme lengths, and empty / whitespace inputs.
 *
 * Usage:
 * ```ts
 * const gen = new EdgeCaseGenerator();
 * const all = gen.generateAll();
 * const injections = gen.generateByCategory('sqlInjection');
 * const boundary = gen.generateBoundaryValues({ minLength: 1, maxLength: 255 });
 * ```
 */
export class EdgeCaseGenerator {
  private readonly maxLength: number;
  private readonly minLength: number;

  constructor(options: EdgeCaseOptions = {}) {
    this.maxLength = options.maxLength ?? 10_000;
    this.minLength = options.minLength ?? 1;
  }

  // ---- Boundary values -----------------------------------------------------

  /**
   * Generate boundary-length strings.
   *
   * @param overrides - Override the min/max length configured at construction.
   */
  generateBoundaryValues(overrides: { minLength?: number; maxLength?: number } = {}): EdgeCase[] {
    const min = overrides.minLength ?? this.minLength;
    const max = overrides.maxLength ?? this.maxLength;

    return [
      { label: `Minimum length string (${min} char)`, category: 'boundary', value: 'a'.repeat(min) },
      { label: `Maximum length string (${max} chars)`, category: 'boundary', value: 'a'.repeat(max) },
      { label: 'Maximum length - 1', category: 'boundary', value: 'a'.repeat(Math.max(0, max - 1)) },
      { label: 'Maximum length + 1', category: 'boundary', value: 'a'.repeat(max + 1) },
      { label: 'Single character', category: 'boundary', value: 'a' },
      { label: 'Two characters', category: 'boundary', value: 'ab' },
    ];
  }

  // ---- Extreme lengths -----------------------------------------------------

  /**
   * Generate very long strings designed to trigger buffer overflows or
   * truncation bugs.
   */
  generateExtremeLengths(): EdgeCase[] {
    return [
      { label: '100-char string', category: 'extremeLength', value: 'x'.repeat(100) },
      { label: '255-char string', category: 'extremeLength', value: 'x'.repeat(255) },
      { label: '256-char string', category: 'extremeLength', value: 'x'.repeat(256) },
      { label: '1000-char string', category: 'extremeLength', value: 'x'.repeat(1_000) },
      { label: '4096-char string', category: 'extremeLength', value: 'x'.repeat(4_096) },
      { label: '10000-char string', category: 'extremeLength', value: 'x'.repeat(10_000) },
      {
        label: 'Long email-like string',
        category: 'extremeLength',
        value: `${'a'.repeat(250)}@${'b'.repeat(250)}.com`,
      },
      {
        label: 'Long string with spaces',
        category: 'extremeLength',
        value: ('hello world '.repeat(100)).trimEnd(),
      },
    ];
  }

  // ---- Category helpers ----------------------------------------------------

  /** All empty / whitespace edge cases. */
  generateEmptyValues(): EdgeCase[] {
    return [...EMPTY_VALUES];
  }

  /** All Unicode edge cases. */
  generateUnicodeValues(): EdgeCase[] {
    return [...UNICODE_VALUES];
  }

  /** SQL injection patterns. */
  generateSqlInjectionValues(): EdgeCase[] {
    return [...SQL_INJECTION_VALUES];
  }

  /** XSS injection patterns. */
  generateXssInjectionValues(): EdgeCase[] {
    return [...XSS_INJECTION_VALUES];
  }

  /** Command injection patterns. */
  generateCommandInjectionValues(): EdgeCase[] {
    return [...COMMAND_INJECTION_VALUES];
  }

  /** Special character strings. */
  generateSpecialCharValues(): EdgeCase[] {
    return [...SPECIAL_CHARS_VALUES];
  }

  /** Numeric edge cases as strings. */
  generateNumericEdgeCases(): EdgeCase[] {
    return [...NUMERIC_EDGE_CASES];
  }

  // ---- Combined generation -------------------------------------------------

  /**
   * Return all edge cases from one or more specific categories.
   *
   * @param category - A single category or `'all'` for everything.
   */
  generateByCategory(category: EdgeCaseCategory): EdgeCase[] {
    if (category === 'all') return this.generateAll();

    return this.generateAll().filter((ec) => ec.category === category);
  }

  /**
   * Generate every edge case across all categories.
   */
  generateAll(): EdgeCase[] {
    return [
      ...this.generateEmptyValues(),
      ...this.generateBoundaryValues(),
      ...this.generateExtremeLengths(),
      ...this.generateUnicodeValues(),
      ...this.generateSqlInjectionValues(),
      ...this.generateXssInjectionValues(),
      ...this.generateCommandInjectionValues(),
      ...this.generateSpecialCharValues(),
      ...this.generateNumericEdgeCases(),
    ];
  }

  /**
   * Generate edge cases for the requested categories.
   *
   * @param categories - Array of categories to include. Use `['all']` for everything.
   */
  generateForCategories(categories: EdgeCaseCategory[]): EdgeCase[] {
    if (categories.includes('all')) return this.generateAll();

    const seen = new Set<string>();
    const results: EdgeCase[] = [];

    for (const cat of categories) {
      for (const ec of this.generateByCategory(cat)) {
        if (!seen.has(ec.label)) {
          seen.add(ec.label);
          results.push(ec);
        }
      }
    }

    return results;
  }

  /**
   * Return just the string values (without labels / category metadata) for a
   * given category. Useful when feeding values directly into test runners.
   */
  getValues(category: EdgeCaseCategory = 'all'): string[] {
    return this.generateByCategory(category).map((ec) => ec.value);
  }
}
