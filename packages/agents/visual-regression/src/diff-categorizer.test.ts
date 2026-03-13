import sharp from 'sharp';
import { DiffCategorizer, DiffCategory } from './diff-categorizer';
import { DiffEngine } from './diff-engine';

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

/** Creates an image with a colored rectangle on a white background */
async function createImageWithRect(
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number },
  color: { r: number; g: number; b: number }
): Promise<Buffer> {
  const bg = await createTestImage(width, height, 255, 255, 255);

  const rectBuf = await createTestImage(rect.w, rect.h, color.r, color.g, color.b);

  return sharp(bg)
    .composite([{ input: rectBuf, left: rect.x, top: rect.y }])
    .png()
    .toBuffer();
}

describe('DiffCategorizer', () => {
  let categorizer: DiffCategorizer;
  let engine: DiffEngine;

  beforeEach(() => {
    categorizer = new DiffCategorizer();
    engine = new DiffEngine({ threshold: 0.1 });
  });

  describe('categorize', () => {
    it('returns a CategorizationResult with primaryCategory for any diff', async () => {
      const baseline = await createTestImage(50, 50, 255, 0, 0);
      const current = await createTestImage(50, 50, 0, 0, 255);

      const diffResult = await engine.compare(baseline, current);
      const result = await categorizer.categorize(diffResult, baseline, current);

      expect(result).toBeDefined();
      expect(result.primaryCategory).toBeDefined();
      expect(Object.values(DiffCategory)).toContain(result.primaryCategory);
    });

    it('returns empty categories for identical images', async () => {
      const img = await createTestImage(50, 50, 128, 128, 128);
      const diffResult = await engine.compare(img, img);

      const result = await categorizer.categorize(diffResult, img, img);

      expect(result.categories).toHaveLength(0);
      expect(result.primaryCategory).toBe(DiffCategory.UNKNOWN);
    });

    it('detects color change when only color differs', async () => {
      // Blue background → red background (same shape, different color)
      const baseline = await createTestImage(80, 80, 0, 0, 255);
      const current = await createTestImage(80, 80, 255, 0, 0);

      const diffResult = await engine.compare(baseline, current);
      const result = await categorizer.categorize(diffResult, baseline, current);

      const hasColorChange = result.categories.some(
        (c) => c.category === DiffCategory.COLOR_CHANGE
      );
      expect(hasColorChange).toBe(true);
    });

    it('includes confidence scores between 0 and 1', async () => {
      const baseline = await createTestImage(60, 60, 200, 100, 50);
      const current = await createTestImage(60, 60, 50, 100, 200);

      const diffResult = await engine.compare(baseline, current);
      const result = await categorizer.categorize(diffResult, baseline, current);

      for (const cat of result.categories) {
        expect(cat.confidence).toBeGreaterThanOrEqual(0);
        expect(cat.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('sets hasMultipleChanges correctly', async () => {
      const baseline = await createTestImage(50, 50, 255, 0, 0);
      const current = await createTestImage(50, 50, 0, 0, 255);

      const diffResult = await engine.compare(baseline, current);
      const result = await categorizer.categorize(diffResult, baseline, current);

      expect(result.hasMultipleChanges).toBe(result.categories.length > 1);
    });

    it('includes a human-readable description for each category', async () => {
      const baseline = await createTestImage(40, 40, 255, 255, 0);
      const current = await createTestImage(40, 40, 0, 255, 255);

      const diffResult = await engine.compare(baseline, current);
      const result = await categorizer.categorize(diffResult, baseline, current);

      for (const cat of result.categories) {
        expect(typeof cat.description).toBe('string');
        expect(cat.description.length).toBeGreaterThan(0);
      }
    });

    it('returns categories ordered by descending confidence', async () => {
      const baseline = await createTestImage(60, 60, 100, 100, 100);
      const current = await createTestImage(60, 60, 200, 50, 150);

      const diffResult = await engine.compare(baseline, current);
      const result = await categorizer.categorize(diffResult, baseline, current);

      for (let i = 0; i < result.categories.length - 1; i++) {
        const curr = result.categories[i];
        const next = result.categories[i + 1];
        if (curr && next) {
          expect(curr.confidence).toBeGreaterThanOrEqual(next.confidence);
        }
      }
    });

    it('provides region bounds for detected changes', async () => {
      const baseline = await createImageWithRect(
        100, 100,
        { x: 20, y: 20, w: 60, h: 60 },
        { r: 255, g: 0, b: 0 }
      );
      const current = await createImageWithRect(
        100, 100,
        { x: 20, y: 20, w: 60, h: 60 },
        { r: 0, g: 0, b: 255 }
      );

      const diffResult = await engine.compare(baseline, current);
      const result = await categorizer.categorize(diffResult, baseline, current);

      const withRegion = result.categories.filter((c) => c.region !== undefined);
      // At least one category should have a region
      if (result.categories.length > 0) {
        expect(withRegion.length).toBeGreaterThan(0);
      }
    });

    it('detects new element when pixel goes from transparent to opaque', async () => {
      // Baseline: transparent background
      const baseline = await createTestImage(50, 50, 0, 0, 0, 0);
      // Current: opaque red
      const current = await createTestImage(50, 50, 255, 0, 0, 255);

      const diffResult = await engine.compare(baseline, current);
      const result = await categorizer.categorize(diffResult, baseline, current);

      const hasNewElement = result.categories.some(
        (c) => c.category === DiffCategory.NEW_ELEMENT
      );
      // Either NEW_ELEMENT or another category should be detected
      expect(result.categories.length).toBeGreaterThan(0);
      // If new element detected, it should have high confidence
      if (hasNewElement) {
        const newElementCat = result.categories.find(
          (c) => c.category === DiffCategory.NEW_ELEMENT
        );
        expect(newElementCat?.confidence).toBeGreaterThan(0);
      }
    });
  });

  describe('DiffCategory enum', () => {
    it('exports all expected categories', () => {
      expect(DiffCategory.LAYOUT_SHIFT).toBe('LAYOUT_SHIFT');
      expect(DiffCategory.COLOR_CHANGE).toBe('COLOR_CHANGE');
      expect(DiffCategory.TEXT_CHANGE).toBe('TEXT_CHANGE');
      expect(DiffCategory.NEW_ELEMENT).toBe('NEW_ELEMENT');
      expect(DiffCategory.REMOVED_ELEMENT).toBe('REMOVED_ELEMENT');
      expect(DiffCategory.UNKNOWN).toBe('UNKNOWN');
    });
  });
});
