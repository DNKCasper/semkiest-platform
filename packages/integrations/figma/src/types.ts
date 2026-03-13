/**
 * Type definitions for the Figma REST API and internal frame extraction models.
 *
 * @see https://www.figma.com/developers/api
 */

// ---------------------------------------------------------------------------
// Figma REST API response shapes
// ---------------------------------------------------------------------------

/** Axis-aligned bounding box returned by the Figma API for most node types. */
export interface FigmaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Minimal representation of a Figma document node.
 * The API returns a deeply-nested tree; we only surface the fields we use.
 */
export interface FigmaNode {
  /** Unique node ID within the file (e.g. "123:456"). */
  id: string;
  /** Human-readable name set in the Figma editor. */
  name: string;
  /**
   * Node type string as returned by the API.
   * Common values: "DOCUMENT", "CANVAS", "FRAME", "COMPONENT", "INSTANCE", "TEXT", "RECTANGLE", etc.
   */
  type: string;
  /** Absolute position and size in the canvas coordinate space. */
  absoluteBoundingBox?: FigmaBoundingBox;
  /** Child nodes (present when type is a container). */
  children?: FigmaNode[];
}

/** A named component entry in the file-level component map. */
export interface FigmaComponent {
  /** Component key (stable across file versions). */
  key: string;
  /** Human-readable component name. */
  name: string;
  /** Description text set in the Figma editor. */
  description: string;
  /** ID of the parent component set, if any. */
  componentSetId?: string;
}

/**
 * Response from GET /v1/files/:key
 * @see https://www.figma.com/developers/api#get-files-endpoint
 */
export interface FigmaFileResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
}

/**
 * Per-node payload inside GET /v1/files/:key/nodes
 */
export interface FigmaNodeEntry {
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
}

/**
 * Response from GET /v1/files/:key/nodes?ids=…
 * @see https://www.figma.com/developers/api#get-file-nodes-endpoint
 */
export interface FigmaNodesResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  nodes: Record<string, FigmaNodeEntry>;
}

/**
 * Response from GET /v1/images/:key?ids=…
 * Maps node IDs to signed image export URLs (or null on error).
 * @see https://www.figma.com/developers/api#get-images-endpoint
 */
export interface FigmaImageExportResponse {
  err: string | null;
  images: Record<string, string | null>;
}

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

/** Configuration accepted by {@link FigmaClient}. */
export interface FigmaClientConfig {
  /**
   * Figma personal access token or OAuth token.
   * Pass the raw (decrypted) token value here.
   */
  accessToken: string;
  /**
   * Override the Figma API base URL.
   * Defaults to "https://api.figma.com/v1".
   */
  baseUrl?: string;
  /**
   * Request timeout in milliseconds.
   * Default: 30 000 ms
   */
  timeoutMs?: number;
  /**
   * Maximum number of retry attempts on rate-limit (429) or transient (5xx) errors.
   * Default: 3
   */
  maxRetries?: number;
  /**
   * Initial back-off delay in milliseconds before the first retry.
   * Subsequent retries use exponential back-off.
   * Default: 1 000 ms
   */
  retryDelayMs?: number;
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/** Structured representation of a parsed Figma file/frame URL. */
export interface ParsedFigmaUrl {
  /** The file key extracted from the URL path (e.g. "aBcDeFgHiJkLmNoP"). */
  fileKey: string;
  /**
   * Node ID extracted from the `node-id` query parameter.
   * The URL encodes colons as hyphens (e.g. "123-456"); this field normalises
   * them back to colons (e.g. "123:456") as required by the API.
   */
  nodeId?: string;
}

// ---------------------------------------------------------------------------
// Frame metadata and export results
// ---------------------------------------------------------------------------

/** Export scale factor. */
export type ExportScale = 1 | 2;

/** Metadata extracted from a Figma frame node. */
export interface FrameMetadata {
  /** Node ID in "123:456" format. */
  id: string;
  /** Human-readable frame name from the Figma editor. */
  name: string;
  /** Frame width in logical pixels (1x). */
  width: number;
  /** Frame height in logical pixels (1x). */
  height: number;
  /**
   * Name of the matching top-level component, if the node is a component or
   * instance linked to a component in the file component map.
   */
  componentName?: string;
  /** Figma file key this frame belongs to. */
  fileKey: string;
}

/** A single exported frame image at a given scale. */
export interface FrameExport {
  /** Metadata for the exported frame. */
  metadata: FrameMetadata;
  /** Scale factor used for this export. */
  scale: ExportScale;
  /**
   * Signed CDN URL returned by the Figma images API.
   * Valid for a limited time (typically several minutes).
   */
  imageUrl: string;
  /**
   * Raw PNG image bytes downloaded from `imageUrl`.
   * Only populated when the caller requests image download.
   */
  imageData?: Buffer;
}

/** Options passed to the frame extractor when exporting frames. */
export interface FrameExtractionOptions {
  /**
   * Scale factors to export.
   * Defaults to [1, 2] (1× and 2× PNG exports).
   */
  scales?: ExportScale[];
  /**
   * When true, the extractor downloads the PNG bytes from the CDN URL and
   * populates {@link FrameExport.imageData}.
   * Default: false
   */
  downloadImages?: boolean;
}

// ---------------------------------------------------------------------------
// Token encryption helpers
// ---------------------------------------------------------------------------

/** Encrypted payload produced by {@link encryptToken} / consumed by {@link decryptToken}. */
export interface EncryptedToken {
  /** Hex-encoded initialisation vector (12 bytes for AES-256-GCM). */
  iv: string;
  /** Hex-encoded GCM authentication tag (16 bytes). */
  authTag: string;
  /** Hex-encoded ciphertext. */
  ciphertext: string;
}
