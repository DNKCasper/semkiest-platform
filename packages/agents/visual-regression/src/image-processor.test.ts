import sharp from 'sharp';
import {
  Bounds,
  cropRegion,
  fromRawRGBA,
  generateSideBySide,
  getImageMetadata,
  normalizeToSameDimensions,
  RawImageData,
  toRawRGBA,
} from './image-processor';

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

describe('getImageMetadata', () => {
  it('returns correct dimensions for a test image', async () => {
    const img = await createTestImage(100, 80, 255, 0, 0);
    const meta = await getImageMetadata(img);
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(80);
    expect(meta.channels).toBe(4);
    expect(meta.format).toBe('png');
  });
});

describe('toRawRGBA', () => {
  it('converts a PNG to raw RGBA data with correct dimensions', async () => {
    const img = await createTestImage(10, 10, 0, 255, 0);
    const raw = await toRawRGBA(img);

    expect(raw.width).toBe(10);
    expect(raw.height).toBe(10);
    expect(raw.channels).toBe(4);
    expect(raw.data.length).toBe(10 * 10 * 4);
  });

  it('ensures alpha channel is present even for RGB images', async () => {
    const rgbBuffer = await sharp({
      create: { width: 5, height: 5, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .png()
      .toBuffer();

    const raw = await toRawRGBA(rgbBuffer);
    expect(raw.channels).toBe(4);
    expect(raw.data.length).toBe(5 * 5 * 4);
  });
});

describe('fromRawRGBA', () => {
  it('round-trips a raw RGBA buffer back to PNG', async () => {
    const original = await createTestImage(8, 8, 128, 64, 32);
    const raw = await toRawRGBA(original);
    const encoded = await fromRawRGBA(raw);

    const decodedMeta = await getImageMetadata(encoded);
    expect(decodedMeta.width).toBe(8);
    expect(decodedMeta.height).toBe(8);
    expect(decodedMeta.format).toBe('png');
  });

  it('preserves pixel data through encode/decode cycle', async () => {
    const raw: RawImageData = {
      data: Buffer.alloc(4 * 4 * 4, 200),
      width: 4,
      height: 4,
      channels: 4,
    };
    // Fill with a specific color
    for (let i = 0; i < 4 * 4; i++) {
      raw.data[i * 4] = 255;     // R
      raw.data[i * 4 + 1] = 0;   // G
      raw.data[i * 4 + 2] = 0;   // B
      raw.data[i * 4 + 3] = 255; // A
    }

    const encoded = await fromRawRGBA(raw);
    const decoded = await toRawRGBA(encoded);

    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(4);
    // Pixel 0 should be red
    expect(decoded.data[0]).toBe(255);
    expect(decoded.data[1]).toBe(0);
    expect(decoded.data[2]).toBe(0);
  });
});

describe('normalizeToSameDimensions', () => {
  it('returns same size images when inputs match', async () => {
    const img1 = await createTestImage(50, 50, 255, 0, 0);
    const img2 = await createTestImage(50, 50, 0, 255, 0);

    const result = await normalizeToSameDimensions(img1, img2);
    expect(result.width).toBe(50);
    expect(result.height).toBe(50);
    expect(result.baseline.width).toBe(50);
    expect(result.current.width).toBe(50);
  });

  it('resizes current image to match baseline dimensions', async () => {
    const baseline = await createTestImage(100, 80, 255, 0, 0);
    const current = await createTestImage(200, 160, 0, 255, 0);

    const result = await normalizeToSameDimensions(baseline, current);
    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
    expect(result.current.width).toBe(100);
    expect(result.current.height).toBe(80);
  });

  it('returns raw data with correct buffer size', async () => {
    const img1 = await createTestImage(20, 15, 0, 0, 255);
    const img2 = await createTestImage(20, 15, 128, 128, 128);

    const result = await normalizeToSameDimensions(img1, img2);
    expect(result.baseline.data.length).toBe(20 * 15 * 4);
    expect(result.current.data.length).toBe(20 * 15 * 4);
  });
});

describe('cropRegion', () => {
  it('crops a rectangular region from an image', async () => {
    const img = await createTestImage(100, 100, 255, 0, 0);
    const bounds: Bounds = { x: 10, y: 10, width: 50, height: 30 };

    const cropped = await cropRegion(img, bounds);
    const meta = await getImageMetadata(cropped);

    expect(meta.width).toBe(50);
    expect(meta.height).toBe(30);
  });

  it('preserves pixel color when cropping', async () => {
    const img = await createTestImage(20, 20, 0, 128, 255);
    const bounds: Bounds = { x: 5, y: 5, width: 10, height: 10 };

    const cropped = await cropRegion(img, bounds);
    const raw = await toRawRGBA(cropped);

    // All pixels should have the same color as the original
    expect(raw.data[0]).toBe(0);   // R
    expect(raw.data[1]).toBe(128); // G
    expect(raw.data[2]).toBe(255); // B
  });
});

describe('generateSideBySide', () => {
  it('creates a side-by-side image with 3x the width', async () => {
    const img = await createTestImage(30, 20, 100, 100, 100);

    const result = await generateSideBySide(img, img, img);
    const meta = await getImageMetadata(result);

    expect(meta.width).toBe(90); // 30 * 3
    expect(meta.height).toBe(20);
  });

  it('handles images of different sizes', async () => {
    const baseline = await createTestImage(40, 30, 255, 0, 0);
    const current = await createTestImage(60, 45, 0, 255, 0);
    const diff = await createTestImage(40, 30, 0, 0, 255);

    const result = await generateSideBySide(baseline, current, diff);
    const meta = await getImageMetadata(result);

    expect(meta.width).toBe(40 * 3);
    expect(meta.height).toBe(30);
  });
});
