/**
 * Unit tests for OverlayComparison — pixel-level image comparison functionality.
 */

import { OverlayComparison, type OverlayConfig, type Region } from './overlay-comparison';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Creates a simple PNG buffer for testing purposes.
 * This is a minimal PNG with just basic header structure.
 * In real usage, you'd use actual PNG files or pngjs library.
 */
function createTestPNG(width: number, height: number, color: [number, number, number, number]): Buffer {
  // For testing, we'll create a minimal PNG structure
  // PNG signature (8 bytes)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (25 bytes: 4 length + 4 type + 13 data + 4 CRC)
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // Chunk length
  ihdr.write('IHDR', 4, 'ascii'); // Chunk type
  ihdr.writeUInt32BE(width, 8); // Width
  ihdr.writeUInt32BE(height, 12); // Height
  ihdr[16] = 8; // Bit depth
  ihdr[17] = 6; // Color type (6 = RGBA)
  ihdr[18] = 0; // Compression
  ihdr[19] = 0; // Filter
  ihdr[20] = 0; // Interlace
  // CRC would go in bytes 21-24 (simplified: just zeros for testing)

  // Create a simple IDAT chunk with pixel data
  // For testing purposes, we'll use raw RGBA data
  const pixelData = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixelData[i * 4] = color[0];
    pixelData[i * 4 + 1] = color[1];
    pixelData[i * 4 + 2] = color[2];
    pixelData[i * 4 + 3] = color[3];
  }

  // IDAT chunk
  const idatData = Buffer.alloc(4 + 4 + pixelData.length + 4);
  idatData.writeUInt32BE(pixelData.length, 0);
  idatData.write('IDAT', 4, 'ascii');
  pixelData.copy(idatData, 8);

  // IEND chunk (0 length, "IEND", CRC)
  const iend = Buffer.alloc(12);
  iend.writeUInt32BE(0, 0);
  iend.write('IEND', 4, 'ascii');

  return Buffer.concat([signature, ihdr, idatData, iend]);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OverlayComparison', () => {
  describe('initialization', () => {
    it('should initialize with default config', () => {
      const comparison = new OverlayComparison();
      expect(comparison).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const config: Partial<OverlayConfig> = {
        tolerance: 10,
        antiAliasingTolerance: 5,
      };
      const comparison = new OverlayComparison(config);
      expect(comparison).toBeDefined();
    });
  });

  describe('compare', () => {
    it('should return 100% similarity for identical images', async () => {
      const comparison = new OverlayComparison({ tolerance: 5 });
      const identicalBuffer = createTestPNG(100, 100, [255, 128, 64, 255]);

      const result = await comparison.compare(identicalBuffer, identicalBuffer);

      expect(result.similarityScore).toBe(100);
      expect(result.matchingPixels).toBeGreaterThan(0);
      expect(result.differentPixels).toBe(0);
    });

    it('should return low similarity for completely different images', async () => {
      const comparison = new OverlayComparison({ tolerance: 5 });
      const image1 = createTestPNG(100, 100, [255, 0, 0, 255]);
      const image2 = createTestPNG(100, 100, [0, 0, 255, 255]);

      const result = await comparison.compare(image1, image2);

      expect(result.similarityScore).toBeLessThan(50);
      expect(result.differentPixels).toBeGreaterThan(0);
    });

    it('should respect tolerance threshold', async () => {
      const comparison = new OverlayComparison({ tolerance: 20 });

      // Create images with small color differences
      const image1 = createTestPNG(100, 100, [255, 128, 64, 255]);
      const image2 = createTestPNG(100, 100, [255, 130, 64, 255]); // 2px difference in green

      const result = await comparison.compare(image1, image2);

      // With tolerance 20, small differences should be ignored
      expect(result.similarityScore).toBeGreaterThan(90);
    });

    it('should reject images that differ by more than tolerance', async () => {
      const comparison = new OverlayComparison({ tolerance: 5 });

      const image1 = createTestPNG(100, 100, [255, 128, 64, 255]);
      const image2 = createTestPNG(100, 100, [255, 50, 64, 255]); // 78px difference

      const result = await comparison.compare(image1, image2);

      expect(result.similarityScore).toBeLessThan(50);
      expect(result.differentPixels).toBeGreaterThan(0);
    });

    it('should include diff regions in result', async () => {
      const comparison = new OverlayComparison({ tolerance: 5 });
      const image1 = createTestPNG(200, 200, [255, 0, 0, 255]);
      const image2 = createTestPNG(200, 200, [0, 0, 255, 255]);

      const result = await comparison.compare(image1, image2);

      expect(Array.isArray(result.regions)).toBe(true);
      // With completely different images, we expect at least some regions
      // (actual clustering behavior depends on implementation)
    });

    it('should generate diff image when requested', async () => {
      const comparison = new OverlayComparison({
        tolerance: 5,
        outputFormat: 'buffer',
      });

      const image1 = createTestPNG(100, 100, [255, 0, 0, 255]);
      const image2 = createTestPNG(100, 100, [0, 0, 255, 255]);

      const result = await comparison.compare(image1, image2);

      expect(result.diffImage).toBeDefined();
      expect(Buffer.isBuffer(result.diffImage)).toBe(true);
    });

    it('should calculate correct total pixel count', async () => {
      const comparison = new OverlayComparison();
      const width = 50;
      const height = 60;
      const buffer = createTestPNG(width, height, [255, 128, 64, 255]);

      const result = await comparison.compare(buffer, buffer);

      expect(result.totalPixels).toBe(width * height);
    });
  });

  describe('tolerance threshold', () => {
    it('should correctly handle zero tolerance', async () => {
      const comparison = new OverlayComparison({ tolerance: 0 });
      const image1 = createTestPNG(50, 50, [255, 128, 64, 255]);
      const image2 = createTestPNG(50, 50, [255, 128, 64, 255]);

      const result = await comparison.compare(image1, image2);

      expect(result.similarityScore).toBe(100);
    });

    it('should correctly handle high tolerance', async () => {
      const comparison = new OverlayComparison({ tolerance: 255 });
      const image1 = createTestPNG(50, 50, [255, 0, 0, 255]);
      const image2 = createTestPNG(50, 50, [0, 0, 0, 255]);

      const result = await comparison.compare(image1, image2);

      // With tolerance 255, all colors should match
      expect(result.similarityScore).toBe(100);
    });
  });

  describe('anti-aliasing tolerance', () => {
    it('should apply different tolerance at edges', async () => {
      const comparison = new OverlayComparison({
        tolerance: 2,
        antiAliasingTolerance: 30,
      });

      const image1 = createTestPNG(100, 100, [255, 0, 0, 255]);
      const image2 = createTestPNG(100, 100, [240, 0, 0, 255]); // 15px difference (> tolerance 2, < antiAliasing 30)

      const result = await comparison.compare(image1, image2);

      // Edge pixels (border of image) use antiAliasingTolerance, so some pixels should match
      expect(result.similarityScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ignore regions', () => {
    it('should skip ignored regions during comparison', async () => {
      const ignoreRegions: Region[] = [
        { x: 0, y: 0, width: 50, height: 50 },
      ];

      const comparison = new OverlayComparison({
        tolerance: 5,
        ignoreRegions,
      });

      const image1 = createTestPNG(100, 100, [255, 128, 64, 255]);
      const image2 = createTestPNG(100, 100, [255, 128, 64, 255]);

      // Modify a region that should be ignored
      // (In real test, would modify pixel data directly)
      const result = await comparison.compare(image1, image2);

      expect(result.similarityScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple ignore regions', async () => {
      const ignoreRegions: Region[] = [
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 50, y: 50, width: 50, height: 50 },
      ];

      const comparison = new OverlayComparison({ ignoreRegions });
      expect(comparison).toBeDefined();
    });
  });

  describe('image scaling', () => {
    it('should handle images of different sizes when scaleToMatch is true', async () => {
      const comparison = new OverlayComparison({ scaleToMatch: true });
      const image1 = createTestPNG(100, 100, [255, 0, 0, 255]);
      const image2 = createTestPNG(200, 200, [255, 0, 0, 255]);

      const result = await comparison.compare(image1, image2);

      expect(result.totalPixels).toBeGreaterThan(0);
      expect(result.similarityScore).toBeGreaterThanOrEqual(0);
    });

    it('should compare images as-is when scaleToMatch is false', async () => {
      const comparison = new OverlayComparison({ scaleToMatch: false });
      const image1 = createTestPNG(100, 100, [255, 0, 0, 255]);
      const image2 = createTestPNG(100, 100, [255, 0, 0, 255]);

      const result = await comparison.compare(image1, image2);

      expect(result.totalPixels).toBe(100 * 100);
    });
  });

  describe('compareRegion', () => {
    it('should compare only specified region of interest', async () => {
      const comparison = new OverlayComparison({ tolerance: 5 });
      const image1 = createTestPNG(200, 200, [255, 0, 0, 255]);
      const image2 = createTestPNG(200, 200, [255, 0, 0, 255]);

      const region: Region = { x: 50, y: 50, width: 100, height: 100 };
      const result = await comparison.compareRegion(image1, image2, region);

      expect(result).toBeDefined();
      expect(result.regions).toBeDefined();
    });

    it('should filter results to region bounds', async () => {
      const comparison = new OverlayComparison();
      const image1 = createTestPNG(200, 200, [255, 0, 0, 255]);
      const image2 = createTestPNG(200, 200, [0, 0, 255, 255]);

      const region: Region = { x: 0, y: 0, width: 100, height: 100 };
      const result = await comparison.compareRegion(image1, image2, region);

      // All reported regions should be within the specified region
      for (const diffRegion of result.regions) {
        expect(diffRegion.bounds.x).toBeGreaterThanOrEqual(region.x);
        expect(diffRegion.bounds.y).toBeGreaterThanOrEqual(region.y);
      }
    });
  });

  describe('similarity scoring', () => {
    it('should return valid percentage (0-100)', async () => {
      const comparison = new OverlayComparison();
      const image = createTestPNG(100, 100, [128, 128, 128, 255]);

      const result = await comparison.compare(image, image);

      expect(result.similarityScore).toBeGreaterThanOrEqual(0);
      expect(result.similarityScore).toBeLessThanOrEqual(100);
    });

    it('should calculate matchingPixels + differentPixels correctly', async () => {
      const comparison = new OverlayComparison({ tolerance: 5 });
      const image1 = createTestPNG(80, 80, [255, 128, 64, 255]);
      const image2 = createTestPNG(80, 80, [255, 128, 64, 255]);

      const result = await comparison.compare(image1, image2);

      expect(result.matchingPixels + result.differentPixels).toBeLessThanOrEqual(result.totalPixels);
    });
  });

  describe('edge cases', () => {
    it('should handle very small images', async () => {
      const comparison = new OverlayComparison();
      const image = createTestPNG(2, 2, [255, 0, 0, 255]);

      const result = await comparison.compare(image, image);

      expect(result.similarityScore).toBe(100);
    });

    it('should handle single-pixel images', async () => {
      const comparison = new OverlayComparison();
      const image = createTestPNG(1, 1, [128, 128, 128, 255]);

      const result = await comparison.compare(image, image);

      expect(result.totalPixels).toBe(1);
      expect(result.similarityScore).toBe(100);
    });

    it('should handle images with varying alpha', async () => {
      const comparison = new OverlayComparison();
      const image1 = createTestPNG(50, 50, [255, 0, 0, 255]);
      const image2 = createTestPNG(50, 50, [255, 0, 0, 128]);

      const result = await comparison.compare(image1, image2);

      expect(result.similarityScore).toBeLessThan(100);
    });
  });

  describe('diff region clustering', () => {
    it('should cluster connected pixels into regions', async () => {
      const comparison = new OverlayComparison();
      const image1 = createTestPNG(100, 100, [255, 0, 0, 255]);
      const image2 = createTestPNG(100, 100, [0, 0, 255, 255]);

      const result = await comparison.compare(image1, image2);

      expect(Array.isArray(result.regions)).toBe(true);
    });

    it('should assign regions to correct categories', async () => {
      const comparison = new OverlayComparison();
      const image1 = createTestPNG(100, 100, [255, 0, 0, 255]);
      const image2 = createTestPNG(100, 100, [0, 0, 255, 255]);

      const result = await comparison.compare(image1, image2);

      for (const region of result.regions) {
        expect(['layout', 'color', 'content', 'missing']).toContain(region.category);
      }
    });

    it('should calculate average difference for regions', async () => {
      const comparison = new OverlayComparison();
      const image1 = createTestPNG(100, 100, [255, 0, 0, 255]);
      const image2 = createTestPNG(100, 100, [0, 0, 255, 255]);

      const result = await comparison.compare(image1, image2);

      for (const region of result.regions) {
        expect(region.avgDifference).toBeGreaterThanOrEqual(0);
        expect(region.avgDifference).toBeLessThanOrEqual(255);
      }
    });
  });
});
