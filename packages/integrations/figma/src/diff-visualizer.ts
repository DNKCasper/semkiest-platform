/**
 * DiffVisualizer — generates visual representations of overlay comparison results.
 *
 * Supports:
 *  - Side-by-side comparison views (Figma | Live | Diff)
 *  - Overlay visualization (semi-transparent design over live page)
 *  - Diff region highlighting with colored boxes
 *  - Raw PNG buffer output
 */

import type { OverlayResult, Region } from './overlay-comparison';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * Configuration for diff visualization.
 */
export interface DiffVisualizerConfig {
  /**
   * Width of each section in side-by-side view. Default: 512
   */
  sectionWidth?: number;

  /**
   * Height of each section. Default: 512
   */
  sectionHeight?: number;

  /**
   * Color for highlighting diff regions (RGBA). Default: red with 0.5 opacity
   */
  highlightColor?: { r: number; g: number; b: number; a: number };

  /**
   * Whether to include bounding boxes around diff regions. Default: true
   */
  showBoundingBoxes?: boolean;

  /**
   * Overlay opacity (0-1). Default: 0.5
   */
  overlayOpacity?: number;
}

/**
 * Result of visualization generation.
 */
export interface VisualizationResult {
  /**
   * Side-by-side comparison image (Figma | Live | Diff)
   */
  sideBySide?: Buffer;

  /**
   * Overlay image (Figma semi-transparent over live)
   */
  overlay?: Buffer;

  /**
   * Diff regions highlighted on the original images
   */
  highlighted?: Buffer;
}

// ---------------------------------------------------------------------------
// Pixel manipulation utilities
// ---------------------------------------------------------------------------

/**
 * Blends two colors with alpha blending.
 */
function blendColors(
  fg: { r: number; g: number; b: number; a: number },
  bg: { r: number; g: number; b: number; a: number },
): { r: number; g: number; b: number; a: number } {
  const alpha = fg.a + bg.a * (1 - fg.a);
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha,
    a: alpha,
  };
}

/**
 * Gets RGBA values from buffer at pixel offset.
 */
function getPixel(buffer: Buffer, offset: number): { r: number; g: number; b: number; a: number } {
  const idx = offset * 4;
  return {
    r: buffer[idx] ?? 0,
    g: buffer[idx + 1] ?? 0,
    b: buffer[idx + 2] ?? 0,
    a: (buffer[idx + 3] ?? 255) / 255,
  };
}

/**
 * Sets RGBA values in buffer at pixel offset.
 */
function setPixel(
  buffer: Buffer,
  offset: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  const idx = offset * 4;
  buffer[idx] = Math.round(color.r);
  buffer[idx + 1] = Math.round(color.g);
  buffer[idx + 2] = Math.round(color.b);
  buffer[idx + 3] = Math.round(color.a * 255);
}

/**
 * Scales image buffer to target dimensions using nearest-neighbor.
 */
function scaleImage(
  sourceBuffer: Buffer,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Buffer {
  const result = Buffer.alloc(dstWidth * dstHeight * 4);

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.floor((x / dstWidth) * srcWidth);
      const srcY = Math.floor((y / dstHeight) * srcHeight);
      const srcIdx = srcY * srcWidth + srcX;
      const dstIdx = y * dstWidth + x;

      const pixel = getPixel(sourceBuffer, srcIdx);
      setPixel(result, dstIdx, pixel);
    }
  }

  return result;
}

/**
 * Creates a blank image buffer with specified dimensions and color.
 */
function createBlankImage(
  width: number,
  height: number,
  color: { r: number; g: number; b: number; a: number } = { r: 0, g: 0, b: 0, a: 1 },
): Buffer {
  const buffer = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    setPixel(buffer, i, color);
  }

  return buffer;
}

/**
 * Composites source image onto destination at specified offset.
 */
function compositeImage(
  dst: Buffer,
  dstWidth: number,
  dstHeight: number,
  src: Buffer,
  srcWidth: number,
  srcHeight: number,
  offsetX: number,
  offsetY: number,
  opacity: number = 1,
): void {
  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < srcWidth; x++) {
      const dstX = offsetX + x;
      const dstY = offsetY + y;

      if (dstX < 0 || dstX >= dstWidth || dstY < 0 || dstY >= dstHeight) continue;

      const srcIdx = y * srcWidth + x;
      const dstIdx = dstY * dstWidth + dstX;

      const srcPixel = getPixel(src, srcIdx);
      const dstPixel = getPixel(dst, dstIdx);

      // Apply opacity to source
      srcPixel.a *= opacity;

      const blended = blendColors(srcPixel, dstPixel);
      setPixel(dst, dstIdx, blended);
    }
  }
}

/**
 * Draws a line on the image buffer (Bresenham's algorithm).
 */
function drawLine(
  buffer: Buffer,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      setPixel(buffer, idx, color);
    }

    if (x === x1 && y === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Draws a rectangle outline on the image buffer.
 */
function drawRectangle(
  buffer: Buffer,
  width: number,
  height: number,
  region: Region,
  color: { r: number; g: number; b: number; a: number },
  thickness: number = 2,
): void {
  for (let i = 0; i < thickness; i++) {
    // Top and bottom edges
    for (let x = region.x; x < region.x + region.width; x++) {
      // Top
      if (region.y + i >= 0 && region.y + i < height && x >= 0 && x < width) {
        const idx = (region.y + i) * width + x;
        setPixel(buffer, idx, color);
      }
      // Bottom
      const bottomY = region.y + region.height - 1 - i;
      if (bottomY >= 0 && bottomY < height && x >= 0 && x < width) {
        const idx = bottomY * width + x;
        setPixel(buffer, idx, color);
      }
    }

    // Left and right edges
    for (let y = region.y; y < region.y + region.height; y++) {
      // Left
      if (region.x + i >= 0 && region.x + i < width && y >= 0 && y < height) {
        const idx = y * width + (region.x + i);
        setPixel(buffer, idx, color);
      }
      // Right
      const rightX = region.x + region.width - 1 - i;
      if (rightX >= 0 && rightX < width && y >= 0 && y < height) {
        const idx = y * width + rightX;
        setPixel(buffer, idx, color);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// DiffVisualizer class
// ---------------------------------------------------------------------------

/**
 * Generates visual representations of overlay comparison results.
 *
 * @example
 * ```ts
 * const visualizer = new DiffVisualizer({
 *   sectionWidth: 512,
 *   sectionHeight: 512,
 * });
 *
 * const result = visualizer.visualize(figmaBuffer, liveBuffer, overlayResult);
 * // result.sideBySide contains the comparison image
 * ```
 */
export class DiffVisualizer {
  private readonly config: Required<DiffVisualizerConfig>;

  constructor(config: Partial<DiffVisualizerConfig> = {}) {
    this.config = {
      sectionWidth: config.sectionWidth ?? 512,
      sectionHeight: config.sectionHeight ?? 512,
      highlightColor: config.highlightColor ?? { r: 255, g: 0, b: 0, a: 0.5 },
      showBoundingBoxes: config.showBoundingBoxes ?? true,
      overlayOpacity: config.overlayOpacity ?? 0.5,
    };
  }

  /**
   * Generates all available visualizations from the comparison result.
   *
   * @param figmaBuffer - Original Figma image buffer
   * @param liveBuffer - Original live page image buffer
   * @param result - Overlay comparison result
   * @returns Visualization result with multiple views
   */
  visualize(figmaBuffer: Buffer, liveBuffer: Buffer, result: OverlayResult): VisualizationResult {
    const visualizations: VisualizationResult = {};

    // Generate side-by-side comparison
    visualizations.sideBySide = this.generateSideBySide(figmaBuffer, liveBuffer, result);

    // Generate overlay visualization
    visualizations.overlay = this.generateOverlay(figmaBuffer, liveBuffer, result);

    // Generate highlighted diff view
    visualizations.highlighted = this.generateHighlighted(figmaBuffer, liveBuffer, result);

    return visualizations;
  }

  /**
   * Generates a side-by-side comparison image (Figma | Live | Diff).
   */
  private generateSideBySide(figmaBuffer: Buffer, liveBuffer: Buffer, result: OverlayResult): Buffer {
    const sw = this.config.sectionWidth;
    const sh = this.config.sectionHeight;
    const totalWidth = sw * 3 + 4; // 3 sections + 2px gaps
    const totalHeight = sh;

    // Scale images to section size
    const figmaScaled = scaleImage(figmaBuffer, result.totalPixels, sh, sw, sh);
    const liveScaled = scaleImage(liveBuffer, result.totalPixels, sh, sw, sh);

    // Create diff visualization
    const diffBuffer = this.createDiffBuffer(result);

    // Composite all three
    const output = createBlankImage(totalWidth, totalHeight, { r: 200, g: 200, b: 200, a: 1 });

    // Figma section
    compositeImage(output, totalWidth, totalHeight, figmaScaled, sw, sh, 0, 0);

    // Live section
    compositeImage(output, totalWidth, totalHeight, liveScaled, sw, sh, sw + 2, 0);

    // Diff section
    compositeImage(output, totalWidth, totalHeight, diffBuffer, sw, sh, (sw + 2) * 2, 0);

    return output;
  }

  /**
   * Generates an overlay visualization (Figma semi-transparent over live).
   */
  private generateOverlay(figmaBuffer: Buffer, liveBuffer: Buffer, result: OverlayResult): Buffer {
    // Start with live image
    const output = Buffer.from(liveBuffer);

    // Composite Figma with reduced opacity
    compositeImage(
      output,
      result.totalPixels,
      result.totalPixels,
      figmaBuffer,
      result.totalPixels,
      result.totalPixels,
      0,
      0,
      this.config.overlayOpacity,
    );

    // Draw bounding boxes around diff regions
    if (this.config.showBoundingBoxes && result.regions.length > 0) {
      const boxColor = this.config.highlightColor;
      for (const region of result.regions) {
        drawRectangle(output, result.totalPixels, result.totalPixels, region.bounds, boxColor, 3);
      }
    }

    return output;
  }

  /**
   * Generates a highlighted view showing differences.
   */
  private generateHighlighted(figmaBuffer: Buffer, liveBuffer: Buffer, result: OverlayResult): Buffer {
    const output = Buffer.from(figmaBuffer);

    // Highlight diff regions with semi-transparent overlay
    if (result.regions.length > 0) {
      const highlightColor = this.config.highlightColor;
      for (const region of result.regions) {
        this.fillRegion(output, result.totalPixels, region.bounds, highlightColor, 0.3);

        // Draw bounding box
        if (this.config.showBoundingBoxes) {
          drawRectangle(output, result.totalPixels, result.totalPixels, region.bounds, highlightColor, 2);
        }
      }
    }

    return output;
  }

  /**
   * Creates a diff visualization buffer from comparison result.
   */
  private createDiffBuffer(result: OverlayResult): Buffer {
    // Create a visualization showing where differences occur
    const width = Math.sqrt(result.totalPixels);
    const height = result.totalPixels / width;

    const buffer = createBlankImage(Math.round(width), Math.round(height), { r: 64, g: 64, b: 64, a: 1 });

    // Draw regions
    if (result.regions.length > 0) {
      for (const region of result.regions) {
        const color = this.getCategoryColor(region.category);
        drawRectangle(buffer, Math.round(width), Math.round(height), region.bounds, color, 2);
      }
    }

    return buffer;
  }

  /**
   * Gets color based on diff region category.
   */
  private getCategoryColor(category: string): { r: number; g: number; b: number; a: number } {
    switch (category) {
      case 'color':
        return { r: 255, g: 128, b: 0, a: 1 }; // Orange
      case 'layout':
        return { r: 255, g: 0, b: 0, a: 1 }; // Red
      case 'content':
        return { r: 0, g: 0, b: 255, a: 1 }; // Blue
      case 'missing':
        return { r: 128, g: 0, b: 128, a: 1 }; // Purple
      default:
        return { r: 255, g: 255, b: 0, a: 1 }; // Yellow
    }
  }

  /**
   * Fills a region with a semi-transparent color.
   */
  private fillRegion(
    buffer: Buffer,
    width: number,
    region: Region,
    color: { r: number; g: number; b: number; a: number },
    opacity: number,
  ): void {
    const adjustedColor = { ...color, a: color.a * opacity };

    for (let y = Math.max(0, region.y); y < Math.min(width, region.y + region.height); y++) {
      for (let x = Math.max(0, region.x); x < Math.min(width, region.x + region.width); x++) {
        const idx = y * width + x;
        const existing = getPixel(buffer, idx);
        const blended = blendColors(adjustedColor, existing);
        setPixel(buffer, idx, blended);
      }
    }
  }

  /**
   * Gets current configuration.
   */
  getConfig(): Readonly<Required<DiffVisualizerConfig>> {
    return { ...this.config };
  }

  /**
   * Updates configuration for future visualizations.
   */
  updateConfig(config: Partial<DiffVisualizerConfig>): void {
    if (config.sectionWidth !== undefined) {
      (this.config as any).sectionWidth = config.sectionWidth;
    }
    if (config.sectionHeight !== undefined) {
      (this.config as any).sectionHeight = config.sectionHeight;
    }
    if (config.highlightColor !== undefined) {
      (this.config as any).highlightColor = config.highlightColor;
    }
    if (config.showBoundingBoxes !== undefined) {
      (this.config as any).showBoundingBoxes = config.showBoundingBoxes;
    }
    if (config.overlayOpacity !== undefined) {
      (this.config as any).overlayOpacity = config.overlayOpacity;
    }
  }
}
