import type { FigmaClient } from './figma-client';
import { parseFigmaUrl } from './figma-client';
import type {
  FigmaNode,
  FigmaComponent,
  FrameMetadata,
  FrameExport,
  FrameExtractionOptions,
  ExportScale,
} from './types';

const DEFAULT_SCALES: ExportScale[] = [1, 2];

// ---------------------------------------------------------------------------
// Node traversal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the node should be treated as an exportable frame.
 * The Figma API uses "FRAME" and "COMPONENT" as the primary frame-like types.
 */
function isFrameNode(node: FigmaNode): boolean {
  return node.type === 'FRAME' || node.type === 'COMPONENT';
}

/**
 * Recursively collects all frame-like nodes from a document subtree.
 *
 * @param node - Root node to traverse.
 * @param results - Accumulator array (mutated in place).
 */
function collectFrames(node: FigmaNode, results: FigmaNode[]): void {
  if (isFrameNode(node)) {
    results.push(node);
  }

  if (node.children) {
    for (const child of node.children) {
      collectFrames(child, results);
    }
  }
}

/**
 * Builds a reverse-lookup map from node ID → component name using the
 * file-level component registry.
 *
 * The Figma components map uses component *keys* as keys, not node IDs.
 * We rely on the component `name` field which is stable enough for our needs.
 */
function buildComponentNameIndex(
  components: Record<string, FigmaComponent>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const component of Object.values(components)) {
    // Components don't directly expose their node IDs in this map, so we
    // index by name to allow fuzzy matching against frame names.
    index.set(component.name, component.name);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extracts {@link FrameMetadata} from a Figma node.
 *
 * @param node - A frame or component node.
 * @param fileKey - The Figma file key this node belongs to.
 * @param componentNameIndex - Index of known component names for name matching.
 */
function extractMetadata(
  node: FigmaNode,
  fileKey: string,
  componentNameIndex: Map<string, string>,
): FrameMetadata {
  const bbox = node.absoluteBoundingBox;
  const width = bbox?.width ?? 0;
  const height = bbox?.height ?? 0;

  const componentName = componentNameIndex.get(node.name);

  return {
    id: node.id,
    name: node.name,
    width,
    height,
    componentName,
    fileKey,
  };
}

// ---------------------------------------------------------------------------
// FrameExtractor
// ---------------------------------------------------------------------------

/**
 * Extracts design frames from a Figma file and exports them as PNG images.
 *
 * Workflow:
 * 1. Fetch node tree from the Figma API (by URL or explicit file key + node IDs).
 * 2. Traverse the document to find all FRAME / COMPONENT nodes.
 * 3. Request PNG exports at the configured scales.
 * 4. Optionally download the raw image bytes.
 *
 * @example
 * ```ts
 * const client = new FigmaClient({ accessToken: '...' });
 * const extractor = new FrameExtractor(client);
 *
 * const exports = await extractor.extractByUrl(
 *   'https://www.figma.com/file/aBcDeF/MyFile?node-id=1-2',
 *   { scales: [1, 2], downloadImages: true },
 * );
 * ```
 */
export class FrameExtractor {
  private readonly client: FigmaClient;

  constructor(client: FigmaClient) {
    this.client = client;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Extracts and exports frames starting from a Figma URL.
   *
   * If the URL contains a `node-id` parameter, only that subtree is fetched;
   * otherwise the whole file is traversed.
   *
   * @param figmaUrl - Full Figma file or frame URL.
   * @param options  - Export options (scales, download flag).
   * @returns Array of {@link FrameExport} objects, one per frame per scale.
   */
  async extractByUrl(
    figmaUrl: string,
    options: FrameExtractionOptions = {},
  ): Promise<FrameExport[]> {
    const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

    if (nodeId) {
      return this.extractByNodeIds(fileKey, [nodeId], options);
    }

    return this.extractFromFile(fileKey, options);
  }

  /**
   * Extracts and exports frames from an entire Figma file.
   *
   * @param fileKey - Figma file key.
   * @param options - Export options.
   */
  async extractFromFile(
    fileKey: string,
    options: FrameExtractionOptions = {},
  ): Promise<FrameExport[]> {
    const fileResponse = await this.client.getFile(fileKey);

    const frames = collectAllFrames(fileResponse.document);
    const componentIndex = buildComponentNameIndex(fileResponse.components);

    return this.exportFrames(fileKey, frames, componentIndex, options);
  }

  /**
   * Extracts and exports frames for specific node IDs within a file.
   *
   * @param fileKey  - Figma file key.
   * @param nodeIds  - Node IDs in "123:456" format.
   * @param options  - Export options.
   */
  async extractByNodeIds(
    fileKey: string,
    nodeIds: string[],
    options: FrameExtractionOptions = {},
  ): Promise<FrameExport[]> {
    const nodesResponse = await this.client.getFileNodes(fileKey, nodeIds);

    const frames: FigmaNode[] = [];
    let componentIndex = new Map<string, string>();

    for (const nodeEntry of Object.values(nodesResponse.nodes)) {
      collectFrames(nodeEntry.document, frames);
      const partial = buildComponentNameIndex(nodeEntry.components);
      partial.forEach((v, k) => componentIndex.set(k, v));
    }

    return this.exportFrames(fileKey, frames, componentIndex, options);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Requests image exports for an array of frame nodes and returns
   * {@link FrameExport} objects.
   */
  private async exportFrames(
    fileKey: string,
    frames: FigmaNode[],
    componentIndex: Map<string, string>,
    options: FrameExtractionOptions,
  ): Promise<FrameExport[]> {
    if (frames.length === 0) {
      return [];
    }

    const scales = options.scales ?? DEFAULT_SCALES;
    const nodeIds = frames.map((f) => f.id);
    const results: FrameExport[] = [];

    for (const scale of scales) {
      const exportResponse = await this.client.getImageExports(fileKey, nodeIds, scale);

      if (exportResponse.err) {
        throw new Error(
          `Figma image export error at scale ${scale}×: ${exportResponse.err}`,
        );
      }

      for (const frame of frames) {
        const imageUrl = exportResponse.images[frame.id];

        if (!imageUrl) {
          // Per-node export can fail; skip rather than abort the whole batch.
          continue;
        }

        const metadata = extractMetadata(frame, fileKey, componentIndex);
        const frameExport: FrameExport = { metadata, scale, imageUrl };

        if (options.downloadImages) {
          frameExport.imageData = await this.client.downloadImage(imageUrl);
        }

        results.push(frameExport);
      }
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Standalone utility
// ---------------------------------------------------------------------------

/**
 * Collects all frame-like nodes from a document root, including deeply
 * nested frames inside canvases and other containers.
 *
 * @param documentRoot - Top-level document node (type "DOCUMENT").
 */
export function collectAllFrames(documentRoot: FigmaNode): FigmaNode[] {
  const frames: FigmaNode[] = [];

  if (documentRoot.children) {
    for (const canvas of documentRoot.children) {
      // Each top-level child of DOCUMENT is a CANVAS (page).
      // We recurse into each canvas to collect frames.
      collectFrames(canvas, frames);
    }
  }

  return frames;
}
