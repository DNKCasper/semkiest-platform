import { FigmaTokenExtractor, flattenTokenCollection, filterByType } from './token-extractor';
import type { FigmaFileResponse, FigmaNode, ColorToken, TypographyToken } from './token-types';

// ---------------------------------------------------------------------------
// Minimal Figma file fixture builder
// ---------------------------------------------------------------------------

function buildDocument(children: FigmaNode[]): FigmaNode {
  return { id: '0:1', name: 'Document', type: 'DOCUMENT', children };
}

function buildPage(children: FigmaNode[]): FigmaNode {
  return { id: '1:1', name: 'Page 1', type: 'CANVAS', children };
}

function buildFrame(
  id: string,
  name: string,
  overrides: Partial<FigmaNode> = {},
): FigmaNode {
  return { id, name, type: 'FRAME', ...overrides };
}

function buildTextNode(
  id: string,
  name: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  lineHeightPx: number,
  letterSpacing = 0,
  lineHeightUnit: 'PIXELS' | 'AUTO' = 'PIXELS',
): FigmaNode {
  return {
    id,
    name,
    type: 'TEXT',
    style: {
      fontFamily,
      fontPostScriptName: fontFamily,
      fontWeight,
      fontSize,
      textAlignHorizontal: 'LEFT',
      textAlignVertical: 'TOP',
      letterSpacing,
      lineHeightPx,
      lineHeightPercent: 100,
      lineHeightUnit,
    },
  };
}

function buildSolidFillNode(
  id: string,
  name: string,
  r: number,
  g: number,
  b: number,
  a = 1,
): FigmaNode {
  return {
    id,
    name,
    type: 'RECTANGLE',
    fills: [{ type: 'SOLID', color: { r, g, b, a }, visible: true }],
  };
}

function buildFigmaFile(children: FigmaNode[]): FigmaFileResponse {
  return {
    name: 'Test File',
    lastModified: '2024-01-01T00:00:00Z',
    thumbnailUrl: '',
    version: '1',
    document: buildDocument([buildPage(children)]),
    components: {},
    schemaVersion: 0,
    styles: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FigmaTokenExtractor.extractFromFile', () => {
  let extractor: FigmaTokenExtractor;

  beforeEach(() => {
    extractor = new FigmaTokenExtractor({ accessToken: 'test-token' });
  });

  describe('color extraction', () => {
    it('extracts a color from a SOLID fill node', () => {
      const node = buildSolidFillNode('10:1', 'Brand/Primary', 1, 0, 0);
      const file = buildFigmaFile([node]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.colors).toHaveLength(1);
      expect(tokens.colors[0].name).toBe('Brand/Primary');
      expect(tokens.colors[0].value).toBe('#ff0000');
      expect(tokens.colors[0].rgba).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    });

    it('converts RGBA to hex with alpha byte for semi-transparent fills', () => {
      // 50% opacity → alpha = 0.5
      const node = buildSolidFillNode('10:2', 'Overlay', 0, 0, 0, 0.5);
      const file = buildFigmaFile([node]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.colors[0].value).toMatch(/^#000000[0-9a-f]{2}$/);
    });

    it('deduplicates tokens with the same name', () => {
      const n1 = buildSolidFillNode('10:3', 'Brand/Primary', 1, 0, 0);
      const n2 = buildSolidFillNode('10:4', 'Brand/Primary', 0, 1, 0); // same name, different colour
      const file = buildFigmaFile([n1, n2]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.colors).toHaveLength(1);
      expect(tokens.colors[0].rgba.r).toBe(1); // first wins
    });

    it('skips invisible fills', () => {
      const node: FigmaNode = {
        id: '10:5',
        name: 'Hidden',
        type: 'RECTANGLE',
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, visible: false }],
      };
      const file = buildFigmaFile([node]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.colors).toHaveLength(0);
    });

    it('respects extractColors: false option', () => {
      const node = buildSolidFillNode('10:6', 'Color', 0, 1, 0);
      const file = buildFigmaFile([node]);

      const tokens = extractor.extractFromFile(file, { extractColors: false });

      expect(tokens.colors).toHaveLength(0);
    });

    it('uses Figma style name when available', () => {
      const node: FigmaNode = {
        id: '10:7',
        name: 'Rectangle',
        type: 'RECTANGLE',
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, visible: true }],
        styles: { fills: 'S:abc' },
      };
      const file: FigmaFileResponse = {
        ...buildFigmaFile([node]),
        styles: { 'S:abc': { key: 'abc', name: 'Color/Blue', description: '', styleType: 'FILL', remote: false } },
      };

      const tokens = extractor.extractFromFile(file);

      expect(tokens.colors[0].name).toBe('Color/Blue');
      expect(tokens.colors[0].styleId).toBe('S:abc');
    });
  });

  describe('typography extraction', () => {
    it('extracts a typography token from a TEXT node', () => {
      const node = buildTextNode('20:1', 'Heading/H1', 'Inter', 32, 700, 40);
      const file = buildFigmaFile([node]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.typography).toHaveLength(1);
      const t = tokens.typography[0];
      expect(t.fontFamily).toBe('Inter');
      expect(t.fontSize).toBe(32);
      expect(t.fontWeight).toBe(700);
      expect(t.lineHeight).toBe(40);
    });

    it('maps AUTO lineHeight unit to "normal"', () => {
      const node = buildTextNode('20:2', 'Body/Auto', 'Inter', 16, 400, 0, 0, 'AUTO');
      const file = buildFigmaFile([node]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.typography[0].lineHeight).toBe('normal');
    });

    it('marks italic text nodes with fontStyle: italic', () => {
      const node: FigmaNode = {
        id: '20:3',
        name: 'Body/Italic',
        type: 'TEXT',
        style: {
          fontFamily: 'Inter',
          fontPostScriptName: 'Inter-Italic',
          fontWeight: 400,
          fontSize: 16,
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          letterSpacing: 0,
          lineHeightPx: 24,
          lineHeightPercent: 150,
          lineHeightUnit: 'PIXELS',
          italic: true,
        },
      };
      const file = buildFigmaFile([node]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.typography[0].fontStyle).toBe('italic');
    });

    it('skips non-TEXT nodes for typography', () => {
      const node = buildSolidFillNode('30:1', 'NotText', 0, 1, 0);
      const file = buildFigmaFile([node]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.typography).toHaveLength(0);
    });
  });

  describe('spacing extraction', () => {
    it('extracts gap from auto-layout FRAME', () => {
      const frame = buildFrame('40:1', 'Card', { itemSpacing: 16, type: 'FRAME' });
      const file = buildFigmaFile([frame]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.spacing.some((s) => s.direction === 'gap' && s.value === 16)).toBe(true);
    });

    it('extracts padding values from a FRAME', () => {
      const frame = buildFrame('40:2', 'Section', {
        paddingTop: 24,
        paddingBottom: 24,
        paddingLeft: 16,
        paddingRight: 16,
      });
      const file = buildFigmaFile([frame]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.spacing.some((s) => s.direction === 'padding-top' && s.value === 24)).toBe(true);
      expect(tokens.spacing.some((s) => s.direction === 'padding-left' && s.value === 16)).toBe(true);
    });

    it('skips zero spacing values', () => {
      const frame = buildFrame('40:3', 'Empty', { itemSpacing: 0 });
      const file = buildFigmaFile([frame]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.spacing).toHaveLength(0);
    });

    it('respects extractSpacing: false option', () => {
      const frame = buildFrame('40:4', 'Padded', { itemSpacing: 8 });
      const file = buildFigmaFile([frame]);

      const tokens = extractor.extractFromFile(file, { extractSpacing: false });

      expect(tokens.spacing).toHaveLength(0);
    });
  });

  describe('border-radius extraction', () => {
    it('extracts uniform corner radius', () => {
      const frame = buildFrame('50:1', 'Button', { cornerRadius: 8 });
      const file = buildFigmaFile([frame]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.borderRadius).toHaveLength(1);
      expect(tokens.borderRadius[0].value).toBe(8);
    });

    it('extracts per-corner radii', () => {
      const frame = buildFrame('50:2', 'Card', {
        rectangleCornerRadii: [8, 8, 0, 0],
      });
      const file = buildFigmaFile([frame]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.borderRadius[0].corners).toEqual({
        topLeft: 8,
        topRight: 8,
        bottomRight: 0,
        bottomLeft: 0,
      });
    });

    it('skips nodes with zero corner radius', () => {
      const frame = buildFrame('50:3', 'Sharp', { cornerRadius: 0 });
      const file = buildFigmaFile([frame]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.borderRadius).toHaveLength(0);
    });

    it('respects extractBorderRadius: false option', () => {
      const frame = buildFrame('50:4', 'Rounded', { cornerRadius: 4 });
      const file = buildFigmaFile([frame]);

      const tokens = extractor.extractFromFile(file, { extractBorderRadius: false });

      expect(tokens.borderRadius).toHaveLength(0);
    });
  });

  describe('nested node traversal', () => {
    it('traverses children and extracts tokens recursively', () => {
      const child = buildSolidFillNode('60:2', 'Nested/Color', 0, 0, 1);
      const parent = buildFrame('60:1', 'Parent', { children: [child] });
      const file = buildFigmaFile([parent]);

      const tokens = extractor.extractFromFile(file);

      expect(tokens.colors).toHaveLength(1);
      expect(tokens.colors[0].name).toBe('Nested/Color');
    });
  });
});

describe('flattenTokenCollection', () => {
  it('returns all tokens in a flat array', () => {
    const extractor = new FigmaTokenExtractor({ accessToken: 'tok' });
    const colorNode = buildSolidFillNode('1:1', 'C', 1, 0, 0);
    const textNode = buildTextNode('1:2', 'T', 'Arial', 16, 400, 24);
    const file = buildFigmaFile([colorNode, textNode]);

    const collection = extractor.extractFromFile(file);
    const flat = flattenTokenCollection(collection);

    expect(flat.length).toBe(collection.colors.length + collection.typography.length);
    expect(flat.some((t) => t.type === 'color')).toBe(true);
    expect(flat.some((t) => t.type === 'typography')).toBe(true);
  });
});

describe('filterByType', () => {
  it('filters tokens to only the specified type', () => {
    const extractor = new FigmaTokenExtractor({ accessToken: 'tok' });
    const colorNode = buildSolidFillNode('2:1', 'C', 0, 1, 0);
    const textNode = buildTextNode('2:2', 'T', 'Arial', 14, 400, 20);
    const file = buildFigmaFile([colorNode, textNode]);

    const collection = extractor.extractFromFile(file);
    const flat = flattenTokenCollection(collection);

    const colors = filterByType<ColorToken>(flat, 'color');
    const typo = filterByType<TypographyToken>(flat, 'typography');

    expect(colors.every((t) => t.type === 'color')).toBe(true);
    expect(typo.every((t) => t.type === 'typography')).toBe(true);
  });
});
