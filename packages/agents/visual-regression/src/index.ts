export { DiffEngine } from './diff-engine';
export type {
  DiffOptions,
  DiffResult,
  ComponentDiffResult,
  BatchDiffSummary,
} from './diff-engine';

export { DiffCategorizer, DiffCategory } from './diff-categorizer';
export type {
  CategorizedDiff,
  CategorizationResult,
} from './diff-categorizer';

export {
  getImageMetadata,
  toRawRGBA,
  fromRawRGBA,
  normalizeToSameDimensions,
  cropRegion,
  generateSideBySide,
  generateOverlay,
  generateHighlightedDiff,
} from './image-processor';
export type { Bounds, RawImageData, ImageMetadata } from './image-processor';
