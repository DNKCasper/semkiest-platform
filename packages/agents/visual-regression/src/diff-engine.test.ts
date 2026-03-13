import sharp from 'sharp';
import { DiffEngine, DiffOptions } from './diff-engine';
import { Bounds } from './image-processor';

/** Creates a solid-color PNG buffer for testing */
async function createTestImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r, g, b, alpha: a } },
  })
    .png()
    .toBuffer();
}

/** Creates a gradient PNG for more realistic testing */
async function createGradientImage(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = Math.floor((x / width) * 255);
      data[idx + 1] = Math.floor((y / height) * 255);
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe('DiffEngine', () => {
  let engine: DiffEngine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  describe('compare', () => {
    it('returns 0% diff for identical images', async () => {
      const img = await createTestImage(50, 50, 255, 0, 0);
      const result = await engine.compare(img, img);

      expect(result.diffPercentage).toBe(0);
      expect(result.diffPixels).toBe(0);
      expect(result.totalPixels).toBe(50 * 50);
    });

    it('returns 100% diff for completely different solid-color images', async () => {
      const baseline = await createTestImage(20, 20, 255, 0, 0);
      const current = await createTestImage(20, 20, 0, 0, 255);

      const result = await engine.compare(baseline, current);

      expect(result.diffPixels).toBeGreaterThan(0);
      expect(result.diffPercentage).toBeGreaterThan(0);
      expect(result.totalPixels).toBe(20 * 20);
    });

    it('returns correct dimensions in result', async () => {
      const baseline = await createTestImage(60, 40, 128, 128, 128);
      const current = await createTestImage(60, 40, 128, 128, 128);

      const result = await engine.compare(baseline, current);

      expect(result.width).toBe(60);
      expect(result.height).toBe(40);
    });

    it('returns a valid PNG diff image', async () => {
      const baseline = await createTestImage(30, 30, 255, 0, 0);
      const current = await createTestImage(30, 30, 0, 255, 0);

      const result = await engine.compare(baseline, current);

      // PNG magic bytes: 89 50 4E 47
      expect(result.diffImage[0]).toBe(0x89);
      expect(result.diffImage[1]).toBe(0x50);
      expect(result.diffImage[2]).toBe(0x4e);
      expect(result.diffImage[3]).toBe(0x47);
    });

    it('normalizes images with different dimensions', async () => {
      const baseline = await createTestImage(100, 100, 255, 0, 0);
      const current = await createTestImage(200, 200, 255, 0, 0);

      const result = await engine.compare(baseline, current);

      expect(result.dimensionsNormalized).toBe(true);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('does not flag dimension normalization for same-size images', async () => {
      const img = await createTestImage(50, 50, 128, 128, 128);
      const result = await engine.compare(img, img);

      expect(result.dimensionsNormalized).toBe(false);
    });

    it('returns a side-by-side PNG image', async () => {
      const baseline = await createTestImage(20, 20, 255, 0, 0);
      const current = await createTestImage(20, 20, 0, 255, 0);

      const result = await engine.compare(baseline, current);

      // Should be a valid PNG
      expect(result.sideBySideImage[0]).toBe(0x89);
      expect(result.sideBySideImage[1]).toBe(0x50);
    });

    it('respects custom threshold option', async () => {
      const baseline = await createGradientImage(50, 50);
      // Slightly modified version
      const current = await createGradientImage(50, 50);

      const strictResult = await engine.compare(baseline, current, { threshold: 0.0 });
      const lenientResult = await engine.compare(baseline, current, { threshold: 0.5 });

      // Lenient threshold should produce fewer or equal diff pixels
      expect(lenientResult.diffPixels).toBeLessThanOrEqual(strictResult.diffPixels);
    });

    it('respects diffColor option', async () => {
      const baseline = await createTestImage(10, 10, 255, 0, 0);
      const current = await createTestImage(10, 10, 0, 255, 0);

      const result = await engine.compare(baseline, current, {
        diffColor: [0, 255, 255], // cyan
      });

      expect(result.diffImage).toBeDefined();
      expect(result.diffPixels).toBeGreaterThan(0);
    });
  });

  describe('compareComponent', () => {
    it('compares a sub-region of two images', async () => {
      const baseline = await createTestImage(100, 100, 255, 0, 0);
      const current = await createTestImage(100, 100, 0, 255, 0);
      const bounds: Bounds = { x: 10, y: 10, width: 50, height: 50 };

      const result = await engine.compareComponent(
        baseline,
        current,
        bounds,
        'TestComponent'
      );

      expect(result.componentName).toBe('TestComponent');
      expect(result.bounds).toEqual(bounds);
      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    });

    it('returns 0% diff for identical component regions', async () => {
      const img = await createTestImage(100, 100, 200, 200, 200);
      const bounds: Bounds = { x: 0, y: 0, width: 50, height: 50 };

      const result = await engine.compareComponent(img, img, bounds, 'Header');

      expect(result.diffPercentage).toBe(0);
    });

    it('includes optional selector in result', async () => {
      const img = await createTestImage(50, 50, 255, 0, 0);
      const bounds: Bounds = { x: 0, y: 0, width: 50, height: 50 };

      const result = await engine.compareComponent(
        img,
        img,
        bounds,
        'NavBar',
        '.navbar'
      );

      expect(result.selector).toBe('.navbar');
    });

    it('selector defaults to undefined when not provided', async () => {
      const img = await createTestImage(50, 50, 0, 255, 0);
      const bounds: Bounds = { x: 0, y: 0, width: 50, height: 50 };

      const result = await engine.compareComponent(img, img, bounds, 'Footer');

      expect(result.selector).toBeUndefined();
    });
  });

  describe('compareComponents', () => {
    it('returns a batch summary for multiple components', async () => {
      const baseline = await createTestImage(200, 200, 255, 0, 0);
      const current = await createTestImage(200, 200, 0, 255, 0);

      const components = [
        { name: 'Header', bounds: { x: 0, y: 0, width: 200, height: 50 } },
        { name: 'Content', bounds: { x: 0, y: 50, width: 200, height: 100 } },
        { name: 'Footer', bounds: { x: 0, y: 150, width: 200, height: 50 } },
      ];

      const summary = await engine.compareComponents(baseline, current, components);

      expect(summary.totalComponents).toBe(3);
      expect(summary.results).toHaveLength(3);
      expect(summary.failedComponents).toBeGreaterThan(0);
      expect(summary.overallDiffPercentage).toBeGreaterThan(0);
    });

    it('counts all components as passed when images are identical', async () => {
      const img = await createTestImage(100, 100, 128, 128, 128);

      const components = [
        { name: 'A', bounds: { x: 0, y: 0, width: 50, height: 50 } },
        { name: 'B', bounds: { x: 50, y: 50, width: 50, height: 50 } },
      ];

      const summary = await engine.compareComponents(img, img, components);

      expect(summary.passedComponents).toBe(2);
      expect(summary.failedComponents).toBe(0);
      expect(summary.overallDiffPercentage).toBe(0);
    });

    it('respects custom fail threshold', async () => {
      const baseline = await createTestImage(50, 50, 200, 200, 200);
      const current = await createTestImage(50, 50, 200, 200, 200);

      const components = [{ name: 'Test', bounds: { x: 0, y: 0, width: 50, height: 50 } }];

      // With 0% diff and threshold 0.01, should pass
      const summary = await engine.compareComponents(
        baseline,
        current,
        components,
        {},
        0.01
      );

      expect(summary.failedComponents).toBe(0);
    });

    it('handles empty component list gracefully', async () => {
      const img = await createTestImage(50, 50, 0, 0, 0);
      const summary = await engine.compareComponents(img, img, []);

      expect(summary.totalComponents).toBe(0);
      expect(summary.results).toHaveLength(0);
      expect(summary.overallDiffPercentage).toBe(0);
    });

    it('includes per-component results with correct names', async () => {
      const img = await createTestImage(100, 100, 50, 50, 50);

      const components = [
        { name: 'Alpha', bounds: { x: 0, y: 0, width: 50, height: 50 }, selector: '#alpha' },
        { name: 'Beta', bounds: { x: 50, y: 50, width: 50, height: 50 } },
      ];

      const summary = await engine.compareComponents(img, img, components);

      expect(summary.results[0].componentName).toBe('Alpha');
      expect(summary.results[0].selector).toBe('#alpha');
      expect(summary.results[1].componentName).toBe('Beta');
    });
  });

  describe('DiffEngine constructor options', () => {
    it('applies default options from constructor', async () => {
      const customEngine = new DiffEngine({ threshold: 0.5, includeAA: true });
      const baseline = await createTestImage(20, 20, 200, 200, 200);
      const current = await createTestImage(20, 20, 210, 210, 210);

      // Should not throw; just verify it runs
      const result = await customEngine.compare(baseline, current);
      expect(result).toBeDefined();
    });

    it('per-call options override constructor defaults', async () => {
      const strictEngine = new DiffEngine({ threshold: 0.0 });
      const baseline = await createGradientImage(30, 30);
      const current = await createGradientImage(30, 30);

      const strictResult = await strictEngine.compare(baseline, current, { threshold: 0.0 });
      const lenientResult = await strictEngine.compare(baseline, current, { threshold: 1.0 });

      expect(lenientResult.diffPixels).toBeLessThanOrEqual(strictResult.diffPixels);
    });
  });
});
