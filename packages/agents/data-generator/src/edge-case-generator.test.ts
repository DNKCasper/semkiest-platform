import { EdgeCaseGenerator } from './edge-case-generator';
import type { EdgeCaseCategory } from './edge-case-generator';

describe('EdgeCaseGenerator', () => {
  let gen: EdgeCaseGenerator;

  beforeEach(() => {
    gen = new EdgeCaseGenerator({ maxLength: 1000, minLength: 1 });
  });

  // ---- generateAll ---------------------------------------------------------

  describe('generateAll()', () => {
    it('returns a non-empty array', () => {
      const cases = gen.generateAll();
      expect(cases.length).toBeGreaterThan(0);
    });

    it('every entry has label, category, and value fields', () => {
      for (const ec of gen.generateAll()) {
        expect(typeof ec.label).toBe('string');
        expect(typeof ec.category).toBe('string');
        expect(typeof ec.value).toBe('string');
      }
    });

    it('includes at least one empty-string value', () => {
      const hasEmpty = gen.generateAll().some((ec) => ec.value === '');
      expect(hasEmpty).toBe(true);
    });

    it('includes at least one SQL injection pattern', () => {
      const hasSql = gen.generateAll().some((ec) => ec.category === 'sqlInjection');
      expect(hasSql).toBe(true);
    });

    it('includes at least one XSS pattern', () => {
      const hasXss = gen.generateAll().some((ec) => ec.category === 'xssInjection');
      expect(hasXss).toBe(true);
    });

    it('includes at least one Unicode value', () => {
      const hasUnicode = gen.generateAll().some((ec) => ec.category === 'unicode');
      expect(hasUnicode).toBe(true);
    });

    it('includes at least one command injection pattern', () => {
      const hasCmdInj = gen.generateAll().some((ec) => ec.category === 'commandInjection');
      expect(hasCmdInj).toBe(true);
    });

    it('includes at least one special-chars pattern', () => {
      const hasSpecial = gen.generateAll().some((ec) => ec.category === 'specialChars');
      expect(hasSpecial).toBe(true);
    });

    it('includes at least one numeric edge case', () => {
      const hasNumeric = gen.generateAll().some((ec) => ec.category === 'numeric');
      expect(hasNumeric).toBe(true);
    });
  });

  // ---- generateBoundaryValues ----------------------------------------------

  describe('generateBoundaryValues()', () => {
    it('returns boundary cases that respect overrides', () => {
      const cases = gen.generateBoundaryValues({ minLength: 5, maxLength: 100 });
      const maxCase = cases.find((ec) => ec.label.includes('Maximum length string'));
      expect(maxCase?.value).toHaveLength(100);
    });

    it('includes a minimum-length case', () => {
      const cases = gen.generateBoundaryValues({ minLength: 3, maxLength: 50 });
      const minCase = cases.find((ec) => ec.label.includes('Minimum length'));
      expect(minCase?.value).toHaveLength(3);
    });

    it('includes a max+1 boundary case', () => {
      const cases = gen.generateBoundaryValues({ maxLength: 10 });
      const over = cases.find((ec) => ec.label.includes('Maximum length + 1'));
      expect(over?.value).toHaveLength(11);
    });
  });

  // ---- generateExtremeLengths ----------------------------------------------

  describe('generateExtremeLengths()', () => {
    it('returns multiple extreme-length strings', () => {
      const cases = gen.generateExtremeLengths();
      expect(cases.length).toBeGreaterThan(3);
    });

    it('includes a 10000-char string', () => {
      const tenK = gen.generateExtremeLengths().find((ec) => ec.label.includes('10000'));
      expect(tenK?.value).toHaveLength(10_000);
    });

    it('all values have category "extremeLength"', () => {
      for (const ec of gen.generateExtremeLengths()) {
        expect(ec.category).toBe('extremeLength');
      }
    });
  });

  // ---- generateByCategory --------------------------------------------------

  describe('generateByCategory()', () => {
    const categories: Exclude<EdgeCaseCategory, 'all'>[] = [
      'empty', 'whitespace', 'unicode', 'sqlInjection', 'xssInjection',
      'commandInjection', 'specialChars', 'numeric', 'boundary', 'extremeLength',
    ];

    it.each(categories)('returns only "%s" cases when that category is requested', (cat) => {
      const cases = gen.generateByCategory(cat);
      for (const ec of cases) {
        expect(ec.category).toBe(cat);
      }
    });

    it('returns all cases when category is "all"', () => {
      const all = gen.generateByCategory('all');
      const allDirect = gen.generateAll();
      expect(all).toHaveLength(allDirect.length);
    });
  });

  // ---- generateForCategories -----------------------------------------------

  describe('generateForCategories()', () => {
    it('returns values from all requested categories', () => {
      const cases = gen.generateForCategories(['sqlInjection', 'xssInjection']);
      const categories = new Set(cases.map((ec) => ec.category));
      expect(categories.has('sqlInjection')).toBe(true);
      expect(categories.has('xssInjection')).toBe(true);
    });

    it('returns all when ["all"] is passed', () => {
      const cases = gen.generateForCategories(['all']);
      expect(cases.length).toBe(gen.generateAll().length);
    });

    it('deduplicates entries when categories overlap', () => {
      const cases = gen.generateForCategories(['empty', 'empty']);
      const labels = cases.map((ec) => ec.label);
      const unique = new Set(labels);
      expect(unique.size).toBe(labels.length);
    });
  });

  // ---- getValues -----------------------------------------------------------

  describe('getValues()', () => {
    it('returns an array of strings', () => {
      const values = gen.getValues('unicode');
      for (const v of values) {
        expect(typeof v).toBe('string');
      }
    });

    it('defaults to all categories', () => {
      const values = gen.getValues();
      expect(values.length).toBe(gen.generateAll().length);
    });
  });

  // ---- Static content verification ----------------------------------------

  describe('SQL injection patterns', () => {
    it('includes classic OR 1=1 pattern', () => {
      const values = gen.getValues('sqlInjection');
      const hasOr = values.some((v) => v.includes("OR '1'='1"));
      expect(hasOr).toBe(true);
    });

    it('includes DROP TABLE pattern', () => {
      const values = gen.getValues('sqlInjection');
      const hasDrop = values.some((v) => v.toUpperCase().includes('DROP TABLE'));
      expect(hasDrop).toBe(true);
    });
  });

  describe('XSS patterns', () => {
    it('includes script tag pattern', () => {
      const values = gen.getValues('xssInjection');
      const hasScript = values.some((v) => v.toLowerCase().includes('<script'));
      expect(hasScript).toBe(true);
    });
  });
});
