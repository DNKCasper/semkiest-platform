/**
 * FigmaTokenExtractor — parses Figma REST API responses into typed design tokens.
 *
 * Supports:
 *  - Colors extracted from SOLID fills on styled nodes
 *  - Typography extracted from TEXT node styles
 *  - Spacing extracted from auto-layout (itemSpacing, padding) nodes
 *  - Border-radius extracted from frame/shape nodes
 *
 * Can be used in two modes:
 *  1. `fetchAndExtract` — fetches the Figma file over the network and parses it
 *  2. `extractFromFile` — parses an already-loaded FigmaFileResponse
 */

import axios, { AxiosInstance } from 'axios';
import type {
  BorderRadiusToken,
  ColorToken,
  DesignToken,
  FigmaFileResponse,
  FigmaNode,
  FigmaPaint,
  FigmaTypeStyle,
  RgbaColor,
  SpacingToken,
  TokenCollection,
  TokenExtractionOptions,
  TypographyToken,
} from './token-types';

const FIGMA_BASE_URL = 'https://api.figma.com/v1';

const DEFAULT_OPTIONS: Required<TokenExtractionOptions> = {
  extractColors: true,
  extractTypography: true,
  extractSpacing: true,
  extractBorderRadius: true,
  nodeIds: [],
};

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/**
 * Converts normalised Figma RGBA (channels 0–1) to a CSS hex string.
 * Appends alpha byte only when the colour is not fully opaque.
 */
function rgbaToHex(r: number, g: number, b: number, a = 1): string {
  const toByte = (n: number) => Math.round(n * 255);
  const toHex = (n: number) => toByte(n).toString(16).padStart(2, '0');
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  return a < 1 ? `${hex}${toHex(a)}` : hex;
}

/**
 * Extracts the first visible SOLID paint from a fills array.
 * Returns `undefined` when no such paint exists.
 */
function solidFillColor(fills: FigmaPaint[]): RgbaColor | undefined {
  for (const fill of fills) {
    if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
      const { r, g, b, a } = fill.color;
      // Apply layer opacity to alpha if present
      const opacity = fill.opacity !== undefined ? fill.opacity : 1;
      return { r, g, b, a: a * opacity };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Node traversal helpers
// ---------------------------------------------------------------------------

/**
 * Depth-first traversal over a Figma node tree.
 * The visitor receives each node; returning `false` stops traversal of that subtree.
 */
function traverseNodes(
  node: FigmaNode,
  visitor: (n: FigmaNode) => boolean | void,
): void {
  const continueTraversal = visitor(node);
  if (continueTraversal === false) return;
  if (node.children) {
    for (const child of node.children) {
      traverseNodes(child, visitor);
    }
  }
}

/**
 * Builds a deduplicated token name from the node's name by normalising
 * slashes and trimming whitespace.
 */
function normaliseTokenName(raw: string): string {
  return raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

// ---------------------------------------------------------------------------
// Per-category extraction functions
// ---------------------------------------------------------------------------

function extractColorsFromNode(
  node: FigmaNode,
  styleIdToName: Map<string, string>,
  seen: Set<string>,
  results: ColorToken[],
): void {
  if (!node.fills || node.fills.length === 0) return;

  const color = solidFillColor(node.fills);
  if (!color) return;

  // Prefer style name over node name for consistency with Figma style library
  const styleId = node.styles?.['fills'];
  const rawName = (styleId && styleIdToName.get(styleId)) ?? node.name;
  const name = normaliseTokenName(rawName);

  // Deduplicate by name
  if (seen.has(name)) return;
  seen.add(name);

  results.push({
    type: 'color',
    name,
    value: rgbaToHex(color.r, color.g, color.b, color.a),
    rgba: color,
    nodeId: node.id,
    styleId,
  });
}

function extractTypographyFromNode(
  node: FigmaNode,
  styleIdToName: Map<string, string>,
  seen: Set<string>,
  results: TypographyToken[],
): void {
  if (node.type !== 'TEXT' || !node.style) return;

  const ts: FigmaTypeStyle = node.style;
  const styleId = node.styles?.['text'];
  const rawName = (styleId && styleIdToName.get(styleId)) ?? node.name;
  const name = normaliseTokenName(rawName);

  if (seen.has(name)) return;
  seen.add(name);

  const lineHeight: number | 'normal' =
    ts.lineHeightUnit === 'AUTO' ? 'normal' : ts.lineHeightPx;

  results.push({
    type: 'typography',
    name,
    fontFamily: ts.fontFamily,
    fontSize: ts.fontSize,
    fontWeight: ts.fontWeight,
    lineHeight,
    letterSpacing: ts.letterSpacing,
    textTransform: ts.textTransform,
    fontStyle: ts.italic ? 'italic' : 'normal',
    nodeId: node.id,
    styleId,
  });
}

function extractSpacingFromNode(
  node: FigmaNode,
  seen: Set<string>,
  results: SpacingToken[],
): void {
  // Only auto-layout frames carry meaningful spacing tokens
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return;

  const emit = (value: number, direction: SpacingToken['direction']) => {
    if (value === 0) return;
    const key = `${node.id}:${direction ?? 'gap'}`;
    if (seen.has(key)) return;
    seen.add(key);
    const label = direction ? ` (${direction})` : ' (gap)';
    results.push({
      type: 'spacing',
      name: normaliseTokenName(node.name) + label,
      value,
      direction,
      nodeId: node.id,
    });
  };

  if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
    emit(node.itemSpacing, 'gap');
  }
  if (node.paddingTop !== undefined && node.paddingTop > 0) {
    emit(node.paddingTop, 'padding-top');
  }
  if (node.paddingRight !== undefined && node.paddingRight > 0) {
    emit(node.paddingRight, 'padding-right');
  }
  if (node.paddingBottom !== undefined && node.paddingBottom > 0) {
    emit(node.paddingBottom, 'padding-bottom');
  }
  if (node.paddingLeft !== undefined && node.paddingLeft > 0) {
    emit(node.paddingLeft, 'padding-left');
  }
}

function extractBorderRadiusFromNode(
  node: FigmaNode,
  seen: Set<string>,
  results: BorderRadiusToken[],
): void {
  const hasUniform = node.cornerRadius !== undefined && node.cornerRadius > 0;
  const hasPerCorner =
    node.rectangleCornerRadii !== undefined &&
    node.rectangleCornerRadii.some((r) => r > 0);

  if (!hasUniform && !hasPerCorner) return;

  const key = `br:${node.id}`;
  if (seen.has(key)) return;
  seen.add(key);

  const uniformValue = node.cornerRadius ?? node.rectangleCornerRadii?.[0] ?? 0;

  const token: BorderRadiusToken = {
    type: 'border-radius',
    name: normaliseTokenName(node.name),
    value: uniformValue,
    nodeId: node.id,
  };

  if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    token.corners = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
  }

  results.push(token);
}

// ---------------------------------------------------------------------------
// Public extractor class
// ---------------------------------------------------------------------------

export interface FigmaTokenExtractorConfig {
  /** Figma personal access token or OAuth token */
  accessToken: string;
}

/**
 * Extracts design tokens from a Figma file.
 *
 * @example
 * ```ts
 * const extractor = new FigmaTokenExtractor({ accessToken: process.env.FIGMA_TOKEN! });
 * const tokens = await extractor.fetchAndExtract('abc123fileKey');
 * ```
 */
export class FigmaTokenExtractor {
  private readonly http: AxiosInstance;

  constructor(config: FigmaTokenExtractorConfig) {
    this.http = axios.create({
      baseURL: FIGMA_BASE_URL,
      headers: {
        'X-Figma-Token': config.accessToken,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Fetches the Figma file from the API and extracts all design tokens.
   *
   * @param fileKey - The Figma file key (from the file URL)
   * @param options - Controls which token types are extracted
   */
  async fetchAndExtract(
    fileKey: string,
    options?: TokenExtractionOptions,
  ): Promise<TokenCollection> {
    const response = await this.http.get<FigmaFileResponse>(`/files/${fileKey}`);
    return this.extractFromFile(response.data, options);
  }

  /**
   * Fetches only specific nodes from a Figma file and extracts tokens from them.
   *
   * @param fileKey - The Figma file key
   * @param nodeIds - Array of node IDs to fetch (from Figma URLs after `node-id=`)
   * @param options - Controls which token types are extracted
   */
  async fetchAndExtractNodes(
    fileKey: string,
    nodeIds: string[],
    options?: TokenExtractionOptions,
  ): Promise<TokenCollection> {
    const ids = nodeIds.join(',');
    const response = await this.http.get<{
      nodes: Record<string, { document: FigmaNode; styles: Record<string, { name: string }> }>;
    }>(`/files/${fileKey}/nodes`, { params: { ids } });

    const collection: TokenCollection = {
      colors: [],
      typography: [],
      spacing: [],
      borderRadius: [],
    };

    for (const entry of Object.values(response.data.nodes)) {
      const styleIdToName = new Map<string, string>(
        Object.entries(entry.styles ?? {}).map(([id, s]) => [id, s.name]),
      );
      this._extractFromNode(entry.document, styleIdToName, collection, options);
    }

    return collection;
  }

  /**
   * Parses an already-loaded FigmaFileResponse and returns extracted tokens.
   * Useful for testing or when the API response is cached.
   */
  extractFromFile(
    file: FigmaFileResponse,
    options?: TokenExtractionOptions,
  ): TokenCollection {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Build a lookup from style ID → style name for prettier token names
    const styleIdToName = new Map<string, string>(
      Object.entries(file.styles).map(([id, style]) => [id, style.name]),
    );

    const collection: TokenCollection = {
      colors: [],
      typography: [],
      spacing: [],
      borderRadius: [],
    };

    this._extractFromNode(file.document, styleIdToName, collection, opts);
    return collection;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _extractFromNode(
    root: FigmaNode,
    styleIdToName: Map<string, string>,
    collection: TokenCollection,
    options?: TokenExtractionOptions,
  ): void {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const colorSeen = new Set<string>();
    const typographySeen = new Set<string>();
    const spacingSeen = new Set<string>();
    const brSeen = new Set<string>();

    traverseNodes(root, (node) => {
      // When caller specified specific node IDs, skip everything else
      if (opts.nodeIds.length > 0 && !opts.nodeIds.includes(node.id)) {
        // Still traverse children — they might match
        return;
      }

      if (opts.extractColors) {
        extractColorsFromNode(node, styleIdToName, colorSeen, collection.colors);
      }
      if (opts.extractTypography) {
        extractTypographyFromNode(node, styleIdToName, typographySeen, collection.typography);
      }
      if (opts.extractSpacing) {
        extractSpacingFromNode(node, spacingSeen, collection.spacing);
      }
      if (opts.extractBorderRadius) {
        extractBorderRadiusFromNode(node, brSeen, collection.borderRadius);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Utility exports
// ---------------------------------------------------------------------------

/** Converts a TokenCollection to a flat array of all tokens */
export function flattenTokenCollection(collection: TokenCollection): DesignToken[] {
  return [
    ...collection.colors,
    ...collection.typography,
    ...collection.spacing,
    ...collection.borderRadius,
  ];
}

/** Returns only tokens of a given type from a flat token array */
export function filterByType<T extends DesignToken>(
  tokens: DesignToken[],
  type: T['type'],
): T[] {
  return tokens.filter((t): t is T => t.type === type);
}
