import pixelmatch from 'pixelmatch';
import {
  Bounds,
  RawImageData,
  cropRegion,
  fromRawRGBA,
  generateSideBySide,
  normalizeToSameDimensions,
} from './image-processor';

/** Options for configuring the pixel-level diff comparison */
export interface DiffOptions {
  /**
   * Matching threshold, ranges from 0 to 1.
   * Smaller values make the comparison more sensitive.
   * @default 0.1
   */
  threshold?: number;

  /**
   * Blending factor of unchanged pixels in the diff output.
   * Ranges from 0 for pure white to 1 for original brightness.
   * @default 0.1
   */
  alpha?: number;

  /**
   * Whether to detect and skip anti-aliased pixels.
   * When true, anti-aliased edges are not counted as differences.
   * @default false
   */
  includeAA?: boolean;

  /**
   * RGB color of differing pixels in the output.
   * @default [255, 119, 119]
   */
  diffColor?: [number, number, number];

  /**
   * Alternate RGB color for dark-on-light differences.
   * When set, two-pass detection is enabled.
   */
  diffColorAlt?: [number, number, number];

  /**
   * Draw the diff over a transparent background instead of the original images.
   * @default false
   */
  diffMask?: boolean;
}

/** Result of a pixel-level comparison */
export interface DiffResult {
  /** Number of pixels that differ */
  diffPixels: number;
  /** Total pixels compared */
  totalPixels: number;
  /** Percentage of pixels that differ (0–100) */
  diffPercentage: number;
  /** PNG buffer of the diff image with highlighted differences */
  diffImage: Buffer;
  /** Width of the compared images */
  width: number;
  /** Height of the compared images */
  height: number;
  /** Side-by-side PNG showing baseline | current | diff */
  sideBySideImage: Buffer;
  /** Whether images were resized to match dimensions */
  dimensionsNormalized: boolean;
}

/** Result for a component-level comparison */
export interface ComponentDiffResult extends DiffResult {
  /** Human-readable name of the component */
  componentName: string;
  /** Optional CSS selector used to isolate the component */
  selector?: string;
  /** Bounding box used to crop the component */
  bounds: Bounds;
}

/** Summary of a batch comparison across multiple components */
export interface BatchDiffSummary {
  totalComponents: number;
  passedComponents: number;
  failedComponents: number;
  results: ComponentDiffResult[];
  overallDiffPercentage: number;
}

const DEFAULT_OPTIONS: Required<Omit<DiffOptions, 'diffColorAlt'>> = {
  threshold: 0.1,
  alpha: 0.1,
  includeAA: false,
  diffColor: [255, 119, 119],
  diffMask: false,
};

/**
 * Performs pixel-level comparison of two images using pixelmatch.
 * Handles dimension normalization automatically.
 */
export class DiffEngine {
  private readonly defaultOptions: Required<Omit<DiffOptions, 'diffColorAlt'>>;

  constructor(defaultOptions: DiffOptions = {}) {
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...defaultOptions };
  }

  /**
   * Compares two full-page screenshots and returns a diff result.
   *
   * @param baseline - PNG buffer of the baseline image
   * @param current - PNG buffer of the current image
   * @param options - Override comparison options for this call
   */
  async compare(
    baseline: Buffer,
    current: Buffer,
    options: DiffOptions = {}
  ): Promise<DiffResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    const { baseline: baselineRaw, current: currentRaw, width, height } =
      await normalizeToSameDimensions(baseline, current);

    const dimensionsNormalized = await this.checkDimensionsMismatch(baseline, current);

    const diffData = Buffer.alloc(width * height * 4);

    const pixelmatchOptions: pixelmatch.PixelmatchOptions = {
      threshold: mergedOptions.threshold,
      alpha: mergedOptions.alpha,
      includeAA: mergedOptions.includeAA,
      diffColor: mergedOptions.diffColor,
      diffMask: mergedOptions.diffMask,
    };

    if (options.diffColorAlt) {
      pixelmatchOptions.diffColorAlt = options.diffColorAlt;
    }

    const diffPixels = pixelmatch(
      baselineRaw.data,
      currentRaw.data,
      diffData,
      width,
      height,
      pixelmatchOptions
    );

    const totalPixels = width * height;
    const diffPercentage = (diffPixels / totalPixels) * 100;

    const diffRaw: RawImageData = { data: diffData, width, height, channels: 4 };
    const diffImage = await fromRawRGBA(diffRaw);

    const sideBySideImage = await generateSideBySide(baseline, current, diffImage);

    return {
      diffPixels,
      totalPixels,
      diffPercentage,
      diffImage,
      width,
      height,
      sideBySideImage,
      dimensionsNormalized,
    };
  }

  /**
   * Compares a specific component region in two screenshots.
   *
   * @param baseline - PNG buffer of the baseline full-page screenshot
   * @param current - PNG buffer of the current full-page screenshot
   * @param bounds - Bounding box of the component to isolate
   * @param componentName - Human-readable name for reporting
   * @param selector - Optional CSS selector for documentation
   * @param options - Override comparison options for this call
   */
  async compareComponent(
    baseline: Buffer,
    current: Buffer,
    bounds: Bounds,
    componentName: string,
    selector?: string,
    options: DiffOptions = {}
  ): Promise<ComponentDiffResult> {
    const [baselineCrop, currentCrop] = await Promise.all([
      cropRegion(baseline, bounds),
      cropRegion(current, bounds),
    ]);

    const diffResult = await this.compare(baselineCrop, currentCrop, options);

    return {
      ...diffResult,
      componentName,
      selector,
      bounds,
    };
  }

  /**
   * Compares multiple components in a single pass.
   * Useful for batch visual regression on a full page with many components.
   *
   * @param baseline - PNG buffer of the baseline full-page screenshot
   * @param current - PNG buffer of the current full-page screenshot
   * @param components - Array of component definitions to compare
   * @param options - Shared comparison options for all components
   * @param failThreshold - Diff percentage above which a component is considered failed (0–100)
   */
  async compareComponents(
    baseline: Buffer,
    current: Buffer,
    components: Array<{ name: string; bounds: Bounds; selector?: string }>,
    options: DiffOptions = {},
    failThreshold = 0.1
  ): Promise<BatchDiffSummary> {
    const results = await Promise.all(
      components.map(({ name, bounds, selector }) =>
        this.compareComponent(baseline, current, bounds, name, selector, options)
      )
    );

    const failed = results.filter((r) => r.diffPercentage > failThreshold);
    const overallDiffPercentage =
      results.reduce((sum, r) => sum + r.diffPercentage, 0) / (results.length || 1);

    return {
      totalComponents: results.length,
      passedComponents: results.length - failed.length,
      failedComponents: failed.length,
      results,
      overallDiffPercentage,
    };
  }

  /**
   * Returns whether the two images have different dimensions.
   */
  private async checkDimensionsMismatch(img1: Buffer, img2: Buffer): Promise<boolean> {
    const [meta1, meta2] = await Promise.all([
      import('./image-processor').then((m) => m.getImageMetadata(img1)),
      import('./image-processor').then((m) => m.getImageMetadata(img2)),
    ]);
    return meta1.width !== meta2.width || meta1.height !== meta2.height;
  }
}
