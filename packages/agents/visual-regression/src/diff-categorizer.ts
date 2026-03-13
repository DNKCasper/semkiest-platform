import { RawImageData, toRawRGBA } from './image-processor';
import { DiffResult } from './diff-engine';

/** Categories of visual differences detected */
export enum DiffCategory {
  /** Elements have shifted position on screen */
  LAYOUT_SHIFT = 'LAYOUT_SHIFT',
  /** Colors have changed without structural changes */
  COLOR_CHANGE = 'COLOR_CHANGE',
  /** Text content or font rendering has changed */
  TEXT_CHANGE = 'TEXT_CHANGE',
  /** A new UI element has appeared */
  NEW_ELEMENT = 'NEW_ELEMENT',
  /** An existing UI element has been removed */
  REMOVED_ELEMENT = 'REMOVED_ELEMENT',
  /** Unclassified visual change */
  UNKNOWN = 'UNKNOWN',
}

/** A detected difference with its category and location */
export interface CategorizedDiff {
  category: DiffCategory;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Human-readable description of the detected change */
  description: string;
  /** Approximate bounding box of the changed region */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/** Full categorization output for a diff */
export interface CategorizationResult {
  /** Ordered list of detected change categories (most likely first) */
  categories: CategorizedDiff[];
  /** Primary category (highest confidence) */
  primaryCategory: DiffCategory;
  /** Whether multiple change types were detected */
  hasMultipleChanges: boolean;
}

/** Internal pixel cluster representing a contiguous diff region */
interface PixelCluster {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
}

/**
 * Analyzes diff patterns between baseline and current images to classify
 * the type of visual change that occurred.
 */
export class DiffCategorizer {
  /**
   * Categorizes a diff result by analyzing the diff image and source images.
   *
   * @param diffResult - The computed diff result from DiffEngine
   * @param baseline - PNG buffer of the baseline image
   * @param current - PNG buffer of the current image
   */
  async categorize(
    diffResult: DiffResult,
    baseline: Buffer,
    current: Buffer
  ): Promise<CategorizationResult> {
    const [baselineRaw, currentRaw, diffRaw] = await Promise.all([
      toRawRGBA(baseline),
      toRawRGBA(current),
      toRawRGBA(diffResult.diffImage),
    ]);

    const clusters = this.extractDiffClusters(diffRaw);
    const categories = this.analyzeChanges(clusters, baselineRaw, currentRaw, diffRaw);

    categories.sort((a, b) => b.confidence - a.confidence);

    const primaryCategory = categories[0]?.category ?? DiffCategory.UNKNOWN;

    return {
      categories,
      primaryCategory,
      hasMultipleChanges: categories.length > 1,
    };
  }

  /**
   * Extracts contiguous clusters of changed pixels from the diff image.
   * Uses a row-scan approach to group nearby changed pixels into regions.
   */
  private extractDiffClusters(diffRaw: RawImageData): PixelCluster[] {
    const { data, width, height } = diffRaw;
    const clusters: PixelCluster[] = [];

    // Track which pixels belong to diff regions using a bitmask
    const isDiff = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // Pixelmatch marks diff pixels in the diff color (default: red-ish)
        // and unchanged pixels as a faint version of the original.
        // Heuristic: a diff pixel has elevated red or blue channel relative to green.
        if (a !== undefined && a > 128 && r !== undefined && g !== undefined && b !== undefined) {
          const isHighlighted = r > 200 && g < 150 && b < 150; // red diff pixels
          const isAltHighlighted = b > 200 && r < 150 && g < 150; // blue diff pixels (alt color)
          if (isHighlighted || isAltHighlighted) {
            isDiff[y * width + x] = 1;
          }
        }
      }
    }

    // Simple row-scan cluster extraction with union-find would be ideal,
    // but a bounding-box scan is sufficient for categorization heuristics.
    const visited = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      if (isDiff[i] === 1 && visited[i] === 0) {
        const cluster = this.floodFill(isDiff, visited, i % width, Math.floor(i / width), width, height);
        if (cluster.pixelCount > 4) {
          clusters.push(cluster);
        }
      }
    }

    return clusters;
  }

  /**
   * Simple flood-fill to find a contiguous cluster of diff pixels.
   */
  private floodFill(
    isDiff: Uint8Array,
    visited: Uint8Array,
    startX: number,
    startY: number,
    width: number,
    height: number
  ): PixelCluster {
    const stack: [number, number][] = [[startX, startY]];
    let minX = startX, minY = startY, maxX = startX, maxY = startY;
    let pixelCount = 0;

    while (stack.length > 0) {
      const entry = stack.pop();
      if (!entry) continue;
      const [x, y] = entry;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;
      if (visited[idx] === 1 || isDiff[idx] === 0) continue;

      visited[idx] = 1;
      pixelCount++;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    return { minX, minY, maxX, maxY, pixelCount };
  }

  /**
   * Analyzes pixel clusters and source images to classify the type of change.
   */
  private analyzeChanges(
    clusters: PixelCluster[],
    baseline: RawImageData,
    current: RawImageData,
    diff: RawImageData
  ): CategorizedDiff[] {
    if (clusters.length === 0) {
      return [];
    }

    const categories: CategorizedDiff[] = [];

    const layoutShiftScore = this.scoreLayoutShift(clusters, baseline, current, diff);
    const colorChangeScore = this.scoreColorChange(clusters, baseline, current);
    const textChangeScore = this.scoreTextChange(clusters, baseline, current);
    const newElementScore = this.scoreNewElement(clusters, baseline, current);
    const removedElementScore = this.scoreRemovedElement(clusters, baseline, current);

    const threshold = 0.2;

    if (layoutShiftScore > threshold) {
      categories.push({
        category: DiffCategory.LAYOUT_SHIFT,
        confidence: layoutShiftScore,
        description: `Layout shift detected across ${clusters.length} region(s). Elements appear to have moved position.`,
        region: this.mergedBounds(clusters),
      });
    }

    if (colorChangeScore > threshold) {
      categories.push({
        category: DiffCategory.COLOR_CHANGE,
        confidence: colorChangeScore,
        description: 'Color values changed without structural changes. Possible theme or style update.',
        region: this.mergedBounds(clusters),
      });
    }

    if (textChangeScore > threshold) {
      categories.push({
        category: DiffCategory.TEXT_CHANGE,
        confidence: textChangeScore,
        description: 'Text or font rendering differences detected. Content or typography may have changed.',
        region: this.mergedBounds(clusters),
      });
    }

    if (newElementScore > threshold) {
      categories.push({
        category: DiffCategory.NEW_ELEMENT,
        confidence: newElementScore,
        description: 'New UI element detected in current screenshot that was not present in baseline.',
        region: this.mergedBounds(clusters),
      });
    }

    if (removedElementScore > threshold) {
      categories.push({
        category: DiffCategory.REMOVED_ELEMENT,
        confidence: removedElementScore,
        description: 'UI element present in baseline is missing from current screenshot.',
        region: this.mergedBounds(clusters),
      });
    }

    if (categories.length === 0) {
      categories.push({
        category: DiffCategory.UNKNOWN,
        confidence: 0.5,
        description: 'Unclassified visual change detected.',
        region: this.mergedBounds(clusters),
      });
    }

    return categories;
  }

  /**
   * Scores likelihood of a layout shift.
   * Layout shifts produce large, spatially spread diff regions spanning multiple rows/cols.
   */
  private scoreLayoutShift(
    clusters: PixelCluster[],
    baseline: RawImageData,
    current: RawImageData,
    diff: RawImageData
  ): number {
    // Layout shifts tend to create long, wide diff bands (not small spots)
    const totalDiffArea = clusters.reduce((sum, c) => {
      return sum + (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1);
    }, 0);

    const imageArea = diff.width * diff.height;
    const areaRatio = totalDiffArea / imageArea;

    // Check if clusters span a significant vertical range (suggests shift)
    const bounds = this.mergedBounds(clusters);
    if (!bounds) return 0;

    const verticalSpan = bounds.height / diff.height;
    const horizontalSpan = bounds.width / diff.width;

    // Layout shifts tend to produce tall, wide regions spanning the full width
    const spreadScore = (verticalSpan + horizontalSpan) / 2;

    // Multiple clusters at different positions also suggest layout shift
    const clusterSpreadScore = clusters.length > 2 ? Math.min(clusters.length / 10, 0.5) : 0;

    // Pixel density in clusters: layout shifts often have moderate density
    const avgClusterDensity =
      clusters.reduce((sum, c) => {
        const clusterArea = (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1);
        return sum + c.pixelCount / clusterArea;
      }, 0) / (clusters.length || 1);

    const densityScore = avgClusterDensity > 0.1 && avgClusterDensity < 0.8 ? 0.3 : 0.1;

    return Math.min(spreadScore * 0.4 + clusterSpreadScore * 0.3 + densityScore + areaRatio * 0.1, 1.0);
  }

  /**
   * Scores likelihood of a color-only change.
   * Color changes produce dense diff regions that closely mirror the original element shapes.
   */
  private scoreColorChange(
    clusters: PixelCluster[],
    baseline: RawImageData,
    current: RawImageData
  ): number {
    let hueChangedPixels = 0;
    let brightnessChangedPixels = 0;
    let totalSampledPixels = 0;

    for (const cluster of clusters) {
      const sampleCount = Math.min(cluster.pixelCount, 100);
      const stepX = Math.max(1, Math.floor((cluster.maxX - cluster.minX + 1) / 10));
      const stepY = Math.max(1, Math.floor((cluster.maxY - cluster.minY + 1) / 10));

      for (let y = cluster.minY; y <= cluster.maxY && totalSampledPixels < sampleCount; y += stepY) {
        for (let x = cluster.minX; x <= cluster.maxX && totalSampledPixels < sampleCount; x += stepX) {
          const idx = (y * baseline.width + x) * 4;

          const br = baseline.data[idx];
          const bg = baseline.data[idx + 1];
          const bb = baseline.data[idx + 2];
          const cr = current.data[idx];
          const cg = current.data[idx + 1];
          const cb = current.data[idx + 2];

          if (
            br !== undefined && bg !== undefined && bb !== undefined &&
            cr !== undefined && cg !== undefined && cb !== undefined
          ) {
            const bHue = this.approximateHue(br, bg, bb);
            const cHue = this.approximateHue(cr, cg, cb);
            const bBrightness = (br + bg + bb) / 3;
            const cBrightness = (cr + cg + cb) / 3;

            if (Math.abs(bHue - cHue) > 15) hueChangedPixels++;
            if (Math.abs(bBrightness - cBrightness) > 20) brightnessChangedPixels++;
            totalSampledPixels++;
          }
        }
      }
    }

    if (totalSampledPixels === 0) return 0;

    const hueRatio = hueChangedPixels / totalSampledPixels;
    const brightnessRatio = brightnessChangedPixels / totalSampledPixels;

    // High hue or brightness change with clustered diff regions suggests color change
    return Math.min((hueRatio * 0.6 + brightnessRatio * 0.4) * 1.2, 1.0);
  }

  /**
   * Scores likelihood of a text change.
   * Text changes produce small, high-density diff clusters in typically narrow regions.
   */
  private scoreTextChange(
    clusters: PixelCluster[],
    baseline: RawImageData,
    current: RawImageData
  ): number {
    // Text regions tend to have narrow height (line height ~14-24px) and moderate width
    let textLikeClusters = 0;

    for (const cluster of clusters) {
      const clusterHeight = cluster.maxY - cluster.minY + 1;
      const clusterWidth = cluster.maxX - cluster.minX + 1;
      const aspectRatio = clusterWidth / clusterHeight;

      // Text clusters: horizontal, narrow, aspect ratio > 2
      if (clusterHeight <= 32 && clusterHeight >= 6 && aspectRatio > 1.5) {
        textLikeClusters++;
      }
    }

    const textClusterRatio = textLikeClusters / (clusters.length || 1);

    // Also check pixel-level: text pixels tend to be near-black or near-white with sharp edges
    let edgePixels = 0;
    let totalChecked = 0;

    for (const cluster of clusters.slice(0, 5)) {
      for (let y = cluster.minY; y <= Math.min(cluster.maxY, cluster.minY + 20); y++) {
        for (let x = cluster.minX; x <= Math.min(cluster.maxX, cluster.minX + 20); x++) {
          const idx = (y * baseline.width + x) * 4;
          const r = baseline.data[idx];
          const g = baseline.data[idx + 1];
          const b = baseline.data[idx + 2];

          if (r !== undefined && g !== undefined && b !== undefined) {
            const brightness = (r + g + b) / 3;
            if (brightness < 50 || brightness > 200) edgePixels++;
            totalChecked++;
          }
        }
      }
    }

    const edgeRatio = totalChecked > 0 ? edgePixels / totalChecked : 0;

    return Math.min(textClusterRatio * 0.5 + edgeRatio * 0.3, 1.0);
  }

  /**
   * Scores likelihood of a new element appearing.
   * New elements show high-brightness pixels in current where baseline had low-brightness (or transparent).
   */
  private scoreNewElement(
    clusters: PixelCluster[],
    baseline: RawImageData,
    current: RawImageData
  ): number {
    let newPixels = 0;
    let totalSampled = 0;

    for (const cluster of clusters.slice(0, 10)) {
      const centerX = Math.floor((cluster.minX + cluster.maxX) / 2);
      const centerY = Math.floor((cluster.minY + cluster.maxY) / 2);
      const idx = (centerY * baseline.width + centerX) * 4;

      const ba = baseline.data[idx + 3];
      const ca = current.data[idx + 3];

      if (ba !== undefined && ca !== undefined) {
        // Pixel is transparent (or near-transparent) in baseline but opaque in current
        if (ba < 50 && ca > 200) {
          newPixels++;
        }
        totalSampled++;
      }
    }

    if (totalSampled === 0) return 0;

    const newRatio = newPixels / totalSampled;

    // Supplement: large, dense clusters that don't exist in baseline
    const largeDenseClusters = clusters.filter((c) => {
      const area = (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1);
      return c.pixelCount / area > 0.6 && area > 200;
    });

    const largeClusterBonus = Math.min(largeDenseClusters.length * 0.1, 0.3);

    return Math.min(newRatio * 0.7 + largeClusterBonus, 1.0);
  }

  /**
   * Scores likelihood of an element being removed.
   * Removed elements show high-brightness pixels in baseline where current is transparent/low.
   */
  private scoreRemovedElement(
    clusters: PixelCluster[],
    baseline: RawImageData,
    current: RawImageData
  ): number {
    let removedPixels = 0;
    let totalSampled = 0;

    for (const cluster of clusters.slice(0, 10)) {
      const centerX = Math.floor((cluster.minX + cluster.maxX) / 2);
      const centerY = Math.floor((cluster.minY + cluster.maxY) / 2);
      const idx = (centerY * baseline.width + centerX) * 4;

      const ba = baseline.data[idx + 3];
      const ca = current.data[idx + 3];

      if (ba !== undefined && ca !== undefined) {
        // Pixel is opaque in baseline but transparent (or near-transparent) in current
        if (ba > 200 && ca < 50) {
          removedPixels++;
        }
        totalSampled++;
      }
    }

    if (totalSampled === 0) return 0;

    const removedRatio = removedPixels / totalSampled;

    // Also: large, dense clusters in baseline that are absent in current
    const largeDenseClusters = clusters.filter((c) => {
      const area = (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1);
      return c.pixelCount / area > 0.6 && area > 200;
    });

    const largeClusterBonus = Math.min(largeDenseClusters.length * 0.1, 0.3);

    return Math.min(removedRatio * 0.7 + largeClusterBonus, 1.0);
  }

  /**
   * Computes an approximate hue value (0–360) from RGB for color change detection.
   */
  private approximateHue(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (delta === 0) return 0;

    let hue: number;

    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }

    return ((hue * 60) + 360) % 360;
  }

  /**
   * Computes a merged bounding box for all clusters.
   */
  private mergedBounds(
    clusters: PixelCluster[]
  ): { x: number; y: number; width: number; height: number } | undefined {
    if (clusters.length === 0) return undefined;

    const minX = Math.min(...clusters.map((c) => c.minX));
    const minY = Math.min(...clusters.map((c) => c.minY));
    const maxX = Math.max(...clusters.map((c) => c.maxX));
    const maxY = Math.max(...clusters.map((c) => c.maxY));

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }
}
