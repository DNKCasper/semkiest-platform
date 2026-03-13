/**
 * @semkiest/figma-integration
 *
 * Figma API client and design frame extraction for the SemkiEst platform.
 *
 * @example
 * ```ts
 * import { FigmaClient, FrameExtractor, createFigmaClientFromEnv } from '@semkiest/figma-integration';
 *
 * const client = createFigmaClientFromEnv();
 * const extractor = new FrameExtractor(client);
 *
 * const exports = await extractor.extractByUrl(
 *   'https://www.figma.com/file/aBcDeF/My-Design?node-id=1-2',
 *   { scales: [1, 2], downloadImages: true },
 * );
 * ```
 */

export {
  FigmaClient,
  createFigmaClientFromEnv,
  parseFigmaUrl,
  encryptToken,
  decryptToken,
} from './figma-client';

export { FrameExtractor, collectAllFrames } from './frame-extractor';

export type {
  FigmaClientConfig,
  FigmaBoundingBox,
  FigmaNode,
  FigmaComponent,
  FigmaFileResponse,
  FigmaNodeEntry,
  FigmaNodesResponse,
  FigmaImageExportResponse,
  ParsedFigmaUrl,
  ExportScale,
  FrameMetadata,
  FrameExport,
  FrameExtractionOptions,
  EncryptedToken,
} from './types';
