import axios, { AxiosInstance, AxiosError } from 'axios';
import * as crypto from 'crypto';
import type {
  FigmaClientConfig,
  FigmaFileResponse,
  FigmaNodesResponse,
  FigmaImageExportResponse,
  ParsedFigmaUrl,
  EncryptedToken,
  ExportScale,
} from './types';

const DEFAULT_BASE_URL = 'https://api.figma.com/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// Token encryption helpers
// ---------------------------------------------------------------------------

/**
 * Encrypts a plain-text Figma access token using AES-256-GCM.
 *
 * @param token - Plain-text token to encrypt.
 * @param encryptionKey - 32-byte hex-encoded encryption key
 *   (set via FIGMA_ENCRYPTION_KEY env var). Generate with:
 *   `openssl rand -hex 32`
 * @returns Serialised {@link EncryptedToken} as a JSON string.
 */
export function encryptToken(token: string, encryptionKey: string): string {
  const keyBuffer = Buffer.from(encryptionKey, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('encryptToken: encryptionKey must be a 32-byte hex string (64 hex chars)');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload: EncryptedToken = {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };

  return JSON.stringify(payload);
}

/**
 * Decrypts an AES-256-GCM encrypted token produced by {@link encryptToken}.
 *
 * @param encryptedJson - JSON string as returned by {@link encryptToken}.
 * @param encryptionKey - 32-byte hex-encoded encryption key.
 * @returns The original plain-text token.
 */
export function decryptToken(encryptedJson: string, encryptionKey: string): string {
  const keyBuffer = Buffer.from(encryptionKey, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('decryptToken: encryptionKey must be a 32-byte hex string (64 hex chars)');
  }

  let payload: EncryptedToken;
  try {
    payload = JSON.parse(encryptedJson) as EncryptedToken;
  } catch {
    throw new Error('decryptToken: invalid encrypted token JSON');
  }

  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const ciphertext = Buffer.from(payload.ciphertext, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Parses a Figma file or frame URL into its constituent parts.
 *
 * Supported URL formats:
 * - `https://www.figma.com/file/:fileKey/:name`
 * - `https://www.figma.com/design/:fileKey/:name`
 * - `https://www.figma.com/file/:fileKey/:name?node-id=123-456`
 * - `https://www.figma.com/design/:fileKey/:name?node-id=123-456`
 *
 * @param url - Full Figma URL string.
 * @returns Parsed file key and optional node ID (colons restored).
 * @throws If the URL does not match a known Figma pattern.
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`parseFigmaUrl: invalid URL "${url}"`);
  }

  const pathMatch = parsed.pathname.match(/^\/(file|design)\/([^/]+)/);
  if (!pathMatch) {
    throw new Error(
      `parseFigmaUrl: URL does not match a Figma file/design path — got "${parsed.pathname}"`,
    );
  }

  const fileKey = pathMatch[2];
  const rawNodeId = parsed.searchParams.get('node-id');
  // Figma URLs encode node IDs with hyphens; the API expects colons.
  const nodeId = rawNodeId ? rawNodeId.replace(/-/g, ':') : undefined;

  return { fileKey, nodeId };
}

// ---------------------------------------------------------------------------
// Rate-limit aware HTTP helper
// ---------------------------------------------------------------------------

/** Waits for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns true for HTTP status codes that should trigger a retry. */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

// ---------------------------------------------------------------------------
// FigmaClient
// ---------------------------------------------------------------------------

/**
 * Authenticated HTTP client for the Figma REST API v1.
 *
 * Handles:
 * - Bearer-token authentication
 * - Automatic exponential back-off retries for 429 / 5xx responses
 * - Typed response parsing
 *
 * @example
 * ```ts
 * const client = new FigmaClient({ accessToken: process.env.FIGMA_ACCESS_TOKEN! });
 * const file = await client.getFile('aBcDeFgHiJkLmNoP');
 * ```
 */
export class FigmaClient {
  private readonly http: AxiosInstance;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(config: FigmaClientConfig) {
    if (!config.accessToken) {
      throw new Error('FigmaClient: accessToken is required');
    }

    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    this.http = axios.create({
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: {
        'X-Figma-Token': config.accessToken,
        'Content-Type': 'application/json',
      },
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Executes an HTTP GET request with automatic retry logic.
   * Retries on 429 (rate-limit) and 5xx (server error) responses.
   */
  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        const response = await this.http.get<T>(path, { params });
        return response.data;
      } catch (err) {
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status;

        if (status !== undefined && isRetryable(status) && attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          attempt++;
          await sleep(delay);
          continue;
        }

        // Enrich the error message before re-throwing.
        const message = axiosErr.response
          ? `Figma API error ${status} on GET ${path}: ${JSON.stringify(axiosErr.response.data)}`
          : `Figma API request failed on GET ${path}: ${axiosErr.message}`;

        throw new Error(message);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public API methods
  // -------------------------------------------------------------------------

  /**
   * Fetches the complete file document.
   *
   * @param fileKey - Figma file key (extracted from the file URL).
   * @returns The full file response including the document tree and components.
   */
  async getFile(fileKey: string): Promise<FigmaFileResponse> {
    if (!fileKey) {
      throw new Error('FigmaClient.getFile: fileKey is required');
    }
    return this.get<FigmaFileResponse>(`/files/${fileKey}`);
  }

  /**
   * Fetches specific nodes from a file by their IDs.
   *
   * @param fileKey - Figma file key.
   * @param nodeIds - One or more node IDs in "123:456" format.
   * @returns The nodes response containing document subtrees for each requested node.
   */
  async getFileNodes(fileKey: string, nodeIds: string[]): Promise<FigmaNodesResponse> {
    if (!fileKey) {
      throw new Error('FigmaClient.getFileNodes: fileKey is required');
    }
    if (nodeIds.length === 0) {
      throw new Error('FigmaClient.getFileNodes: at least one nodeId is required');
    }

    return this.get<FigmaNodesResponse>(`/files/${fileKey}/nodes`, {
      ids: nodeIds.join(','),
    });
  }

  /**
   * Requests PNG image exports for the given nodes at the specified scale.
   *
   * The Figma API returns signed CDN URLs; the caller is responsible for
   * downloading the actual image bytes if needed.
   *
   * @param fileKey - Figma file key.
   * @param nodeIds - Node IDs to export.
   * @param scale - Export scale factor (1 = 1×, 2 = 2×).
   * @returns Map of node IDs to signed PNG export URLs (or null on per-node error).
   */
  async getImageExports(
    fileKey: string,
    nodeIds: string[],
    scale: ExportScale,
  ): Promise<FigmaImageExportResponse> {
    if (!fileKey) {
      throw new Error('FigmaClient.getImageExports: fileKey is required');
    }
    if (nodeIds.length === 0) {
      throw new Error('FigmaClient.getImageExports: at least one nodeId is required');
    }

    return this.get<FigmaImageExportResponse>(`/images/${fileKey}`, {
      ids: nodeIds.join(','),
      scale: String(scale),
      format: 'png',
    });
  }

  /**
   * Convenience method: parses a Figma URL and fetches the file or specific node.
   *
   * - If the URL contains a `node-id` parameter, fetches that node via
   *   {@link getFileNodes}.
   * - Otherwise, fetches the entire file via {@link getFile}.
   *
   * @param figmaUrl - Full Figma file or frame URL.
   */
  async getByUrl(
    figmaUrl: string,
  ): Promise<FigmaFileResponse | FigmaNodesResponse> {
    const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

    if (nodeId) {
      return this.getFileNodes(fileKey, [nodeId]);
    }

    return this.getFile(fileKey);
  }

  /**
   * Downloads raw PNG bytes from a signed Figma CDN URL.
   *
   * @param imageUrl - Signed CDN URL returned by {@link getImageExports}.
   * @returns Raw PNG image as a Node.js Buffer.
   */
  async downloadImage(imageUrl: string): Promise<Buffer> {
    if (!imageUrl) {
      throw new Error('FigmaClient.downloadImage: imageUrl is required');
    }

    let attempt = 0;

    while (true) {
      try {
        const response = await axios.get<ArrayBuffer>(imageUrl, {
          responseType: 'arraybuffer',
          timeout: this.http.defaults.timeout,
        });

        return Buffer.from(response.data);
      } catch (err) {
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status;

        if (status !== undefined && isRetryable(status) && attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          attempt++;
          await sleep(delay);
          continue;
        }

        throw new Error(
          `FigmaClient.downloadImage: failed to download "${imageUrl}": ${axiosErr.message}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Creates a {@link FigmaClient} from environment variables.
 *
 * Reads:
 * - `FIGMA_ACCESS_TOKEN` — plain-text token (used when encryption key is absent)
 * - `FIGMA_ACCESS_TOKEN_ENCRYPTED` — AES-256-GCM encrypted token JSON
 * - `FIGMA_ENCRYPTION_KEY` — 32-byte hex key required to decrypt the above
 *
 * If both plain-text and encrypted tokens are provided, the encrypted token
 * takes precedence.
 *
 * @param overrides - Optional partial config to override defaults.
 */
export function createFigmaClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Omit<FigmaClientConfig, 'accessToken'>> = {},
): FigmaClient {
  const encryptedToken = env['FIGMA_ACCESS_TOKEN_ENCRYPTED'];
  const encryptionKey = env['FIGMA_ENCRYPTION_KEY'];
  const plainToken = env['FIGMA_ACCESS_TOKEN'];

  let accessToken: string;

  if (encryptedToken) {
    if (!encryptionKey) {
      throw new Error(
        'createFigmaClientFromEnv: FIGMA_ENCRYPTION_KEY is required when FIGMA_ACCESS_TOKEN_ENCRYPTED is set',
      );
    }
    accessToken = decryptToken(encryptedToken, encryptionKey);
  } else if (plainToken) {
    accessToken = plainToken;
  } else {
    throw new Error(
      'createFigmaClientFromEnv: either FIGMA_ACCESS_TOKEN or FIGMA_ACCESS_TOKEN_ENCRYPTED must be set',
    );
  }

  return new FigmaClient({ accessToken, ...overrides });
}
