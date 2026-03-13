import { DEFAULT_TOLERANCE } from './token-types';
import type {
  ColorToken,
  TypographyToken,
  SpacingToken,
  BorderRadiusToken,
  TokenCollection,
  ToleranceThresholds,
} from './token-types';

describe('DEFAULT_TOLERANCE', () => {
  it('provides sensible default values', () => {
    expect(DEFAULT_TOLERANCE.colorChannelDelta).toBe(2);
    expect(DEFAULT_TOLERANCE.fontSizePx).toBe(0.5);
    expect(DEFAULT_TOLERANCE.fontWeight).toBe(0);
    expect(DEFAULT_TOLERANCE.lineHeightPx).toBe(1);
    expect(DEFAULT_TOLERANCE.letterSpacingPx).toBe(0.1);
    expect(DEFAULT_TOLERANCE.spacingPx).toBe(1);
    expect(DEFAULT_TOLERANCE.borderRadiusPx).toBe(1);
  });

  it('has all required ToleranceThresholds keys', () => {
    const keys: (keyof ToleranceThresholds)[] = [
      'colorChannelDelta',
      'fontSizePx',
      'fontWeight',
      'lineHeightPx',
      'letterSpacingPx',
      'spacingPx',
      'borderRadiusPx',
    ];
    for (const key of keys) {
      expect(DEFAULT_TOLERANCE).toHaveProperty(key);
      expect(typeof DEFAULT_TOLERANCE[key]).toBe('number');
    }
  });
});

describe('Token type shapes', () => {
  it('ColorToken satisfies required fields', () => {
    const token: ColorToken = {
      type: 'color',
      name: 'Brand/Primary',
      value: '#FF5733',
      rgba: { r: 1, g: 0.341, b: 0.2, a: 1 },
    };
    expect(token.type).toBe('color');
    expect(token.value).toMatch(/^#[0-9a-fA-F]{6}/);
  });

  it('TypographyToken satisfies required fields', () => {
    const token: TypographyToken = {
      type: 'typography',
      name: 'Heading/H1',
      fontFamily: 'Inter',
      fontSize: 32,
      fontWeight: 700,
      lineHeight: 40,
      letterSpacing: 0,
    };
    expect(token.type).toBe('typography');
    expect(token.fontSize).toBeGreaterThan(0);
  });

  it('TypographyToken accepts "normal" lineHeight', () => {
    const token: TypographyToken = {
      type: 'typography',
      name: 'Body/Auto',
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 'normal',
      letterSpacing: 0,
    };
    expect(token.lineHeight).toBe('normal');
  });

  it('SpacingToken satisfies required fields', () => {
    const token: SpacingToken = {
      type: 'spacing',
      name: 'Card (gap)',
      value: 16,
      direction: 'gap',
    };
    expect(token.type).toBe('spacing');
    expect(token.value).toBe(16);
  });

  it('BorderRadiusToken satisfies required fields', () => {
    const token: BorderRadiusToken = {
      type: 'border-radius',
      name: 'Button',
      value: 8,
    };
    expect(token.type).toBe('border-radius');
  });

  it('BorderRadiusToken supports per-corner values', () => {
    const token: BorderRadiusToken = {
      type: 'border-radius',
      name: 'Card',
      value: 8,
      corners: { topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0 },
    };
    expect(token.corners?.bottomRight).toBe(0);
  });

  it('TokenCollection holds all categories', () => {
    const collection: TokenCollection = {
      colors: [],
      typography: [],
      spacing: [],
      borderRadius: [],
    };
    expect(Object.keys(collection)).toEqual(
      expect.arrayContaining(['colors', 'typography', 'spacing', 'borderRadius']),
    );
  });
});
