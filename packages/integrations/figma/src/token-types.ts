/**
 * Comprehensive type definitions for Figma design token extraction and style comparison.
 * Covers colors, typography, spacing, and border-radius tokens.
 */

// ---------------------------------------------------------------------------
// Core token types
// ---------------------------------------------------------------------------

/** Discriminant union of all supported token categories */
export type TokenType = 'color' | 'typography' | 'spacing' | 'border-radius';

/** RGBA color with normalized channels (0–1) matching Figma's internal format */
export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A color extracted from a Figma fill or style */
export interface ColorToken {
  type: 'color';
  /** Token name as it appears in Figma (e.g. "Brand/Primary") */
  name: string;
  /** Hex representation, e.g. "#FF5733" or "#FF5733CC" for semi-transparent */
  value: string;
  /** Raw RGBA with channels normalized to 0–1 */
  rgba: RgbaColor;
  /** Figma node ID, if available */
  nodeId?: string;
  /** Figma style ID, if available */
  styleId?: string;
}

/** A typography style extracted from a Figma text node or style */
export interface TypographyToken {
  type: 'typography';
  /** Token name as it appears in Figma (e.g. "Heading/H1") */
  name: string;
  fontFamily: string;
  /** Font size in pixels */
  fontSize: number;
  /** Numeric font weight (100–900) */
  fontWeight: number;
  /** Line height in pixels; "normal" when using the Figma AUTO mode */
  lineHeight: number | 'normal';
  /** Letter spacing in pixels */
  letterSpacing: number;
  /** CSS text-transform value, if set */
  textTransform?: string;
  /** CSS font-style value, e.g. "italic" */
  fontStyle?: string;
  nodeId?: string;
  styleId?: string;
}

/** A spacing value extracted from a Figma auto-layout node */
export interface SpacingToken {
  type: 'spacing';
  /** Token name (e.g. "Spacing/Small") */
  name: string;
  /** Value in pixels */
  value: number;
  /** Direction of the spacing (gap, padding side, etc.) */
  direction?: 'gap' | 'padding-top' | 'padding-right' | 'padding-bottom' | 'padding-left';
  nodeId?: string;
}

/** A border-radius value extracted from a Figma frame or shape node */
export interface BorderRadiusToken {
  type: 'border-radius';
  /** Token name (e.g. "Radius/Medium") */
  name: string;
  /** Uniform radius value in pixels */
  value: number;
  /** Per-corner values when corners differ */
  corners?: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  nodeId?: string;
}

/** Union type covering every supported design token */
export type DesignToken = ColorToken | TypographyToken | SpacingToken | BorderRadiusToken;

/** All extracted tokens grouped by category */
export interface TokenCollection {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  borderRadius: BorderRadiusToken[];
}

// ---------------------------------------------------------------------------
// Comparison types
// ---------------------------------------------------------------------------

/** How severe a detected mismatch is relative to configured tolerances */
export type MismatchSeverity =
  | 'exact-match'
  | 'within-tolerance'
  | 'out-of-tolerance';

/** Details about a single property that differs between Figma and the live site */
export interface TokenMismatch {
  tokenType: TokenType;
  tokenName: string;
  /** CSS property or logical name that mismatches (e.g. "background-color", "font-size") */
  property: string;
  figmaValue: string | number;
  liveValue: string | number;
  /**
   * Absolute numeric difference where applicable (pixel delta, channel delta, etc.).
   * `null` when values are non-numeric and cannot be compared quantitatively.
   */
  difference: number | null;
  severity: MismatchSeverity;
}

/** Result of comparing a single token against a captured live-site style */
export interface TokenComparisonResult {
  token: DesignToken;
  /** True when all properties are within tolerance */
  matches: boolean;
  mismatches: TokenMismatch[];
}

/** Aggregate report produced by StyleComparator */
export interface ComparisonReport {
  /** ISO 8601 timestamp of when the comparison was run */
  timestamp: string;
  /** URL that was compared */
  url: string;
  totalTokens: number;
  matchingTokens: number;
  mismatchingTokens: number;
  results: TokenComparisonResult[];
  summary: {
    colors: { total: number; matching: number; mismatching: number };
    typography: { total: number; matching: number; mismatching: number };
    spacing: { total: number; matching: number; mismatching: number };
    borderRadius: { total: number; matching: number; mismatching: number };
  };
}

// ---------------------------------------------------------------------------
// Tolerance configuration
// ---------------------------------------------------------------------------

/** Per-property tolerance thresholds used during comparison */
export interface ToleranceThresholds {
  /** Maximum allowed delta per RGB channel (0–255) */
  colorChannelDelta: number;
  /** Maximum allowed font-size difference in pixels */
  fontSizePx: number;
  /** Maximum allowed font-weight difference */
  fontWeight: number;
  /** Maximum allowed line-height difference in pixels */
  lineHeightPx: number;
  /** Maximum allowed letter-spacing difference in pixels */
  letterSpacingPx: number;
  /** Maximum allowed spacing difference in pixels */
  spacingPx: number;
  /** Maximum allowed border-radius difference in pixels */
  borderRadiusPx: number;
}

/** Sensible defaults that accept minor rendering differences */
export const DEFAULT_TOLERANCE: ToleranceThresholds = {
  colorChannelDelta: 2,
  fontSizePx: 0.5,
  fontWeight: 0,
  lineHeightPx: 1,
  letterSpacingPx: 0.1,
  spacingPx: 1,
  borderRadiusPx: 1,
};

// ---------------------------------------------------------------------------
// Figma REST API shapes
// ---------------------------------------------------------------------------

/** Metadata entry from a file's `styles` map */
export interface FigmaStyleNode {
  key: string;
  name: string;
  description: string;
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  remote: boolean;
}

/** A single paint layer within Figma's fills/strokes arrays */
export interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  /** Present on SOLID paints; channels are normalized to 0–1 */
  color?: RgbaColor;
}

/** Text-style properties returned on Figma text nodes */
export interface FigmaTypeStyle {
  fontFamily: string;
  fontPostScriptName: string;
  fontWeight: number;
  fontSize: number;
  textAlignHorizontal: string;
  textAlignVertical: string;
  letterSpacing: number;
  lineHeightPx: number;
  lineHeightPercent: number;
  lineHeightPercentFontSize?: number;
  lineHeightUnit: 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC_%' | 'AUTO';
  italic?: boolean;
  textTransform?: string;
}

/** Minimal representation of a Figma document node relevant to token extraction */
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  fills?: FigmaPaint[];
  style?: FigmaTypeStyle;
  /** Uniform corner radius */
  cornerRadius?: number;
  /** Per-corner radii: [topLeft, topRight, bottomRight, bottomLeft] */
  rectangleCornerRadii?: [number, number, number, number];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  /** Gap between children in auto-layout frames */
  itemSpacing?: number;
  /** Style ID map (keys: "fills", "text", etc.; values: Figma style IDs) */
  styles?: Record<string, string>;
  children?: FigmaNode[];
}

/** Top-level response shape from `GET /v1/files/:key` */
export interface FigmaFileResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, unknown>;
  schemaVersion: number;
  /** Map of style ID → style metadata */
  styles: Record<string, FigmaStyleNode>;
}

/** Response shape from `GET /v1/files/:key/nodes` */
export interface FigmaNodesResponse {
  name: string;
  nodes: Record<
    string,
    {
      document: FigmaNode;
      components: Record<string, unknown>;
      schemaVersion: number;
      styles: Record<string, FigmaStyleNode>;
    }
  >;
}

// ---------------------------------------------------------------------------
// Extraction options
// ---------------------------------------------------------------------------

/** Controls which token categories are extracted and which nodes are traversed */
export interface TokenExtractionOptions {
  /** Extract color tokens (default: true) */
  extractColors?: boolean;
  /** Extract typography tokens (default: true) */
  extractTypography?: boolean;
  /** Extract spacing tokens from auto-layout nodes (default: true) */
  extractSpacing?: boolean;
  /** Extract border-radius tokens (default: true) */
  extractBorderRadius?: boolean;
  /**
   * When provided, only traverse these specific node IDs instead of the full
   * document tree.
   */
  nodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Style mapping (for comparator)
// ---------------------------------------------------------------------------

/**
 * Maps CSS selectors and their properties to design token names.
 *
 * @example
 * ```ts
 * const map: SelectorMap = {
 *   '.btn-primary': {
 *     'background-color': 'Brand/Primary',
 *     'border-radius': 'Radius/Medium',
 *   },
 *   '.body-text': {
 *     'font-family': 'Body/Regular',
 *     'font-size': 'Body/Regular',
 *   },
 * };
 * ```
 */
export type SelectorMap = Record<string, Record<string, string>>;
