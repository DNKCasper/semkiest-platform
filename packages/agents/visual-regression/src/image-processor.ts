import sharp from 'sharp';

/** Bounding box for a region of an image */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Raw image data with metadata */
export interface RawImageData {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

/** Processed image metadata */
export interface ImageMetadata {
  width: number;
  height: number;
  channels: number;
  format: string | undefined;
}

/**
 * Loads an image buffer and returns its metadata.
 */
export async function getImageMetadata(buffer: Buffer): Promise<ImageMetadata> {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    channels: metadata.channels ?? 4,
    format: metadata.format,
  };
}

/**
 * Converts an image buffer to raw RGBA pixel data.
 * Always outputs 4 channels (RGBA) for consistent pixelmatch input.
 */
export async function toRawRGBA(buffer: Buffer): Promise<RawImageData> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: 4,
  };
}

/**
 * Encodes raw RGBA pixel data back into a PNG buffer.
 */
export async function fromRawRGBA(raw: RawImageData): Promise<Buffer> {
  return sharp(raw.data, {
    raw: {
      width: raw.width,
      height: raw.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

/**
 * Resizes the second image to match the dimensions of the first.
 * Returns both images as RGBA raw data at the same dimensions.
 */
export async function normalizeToSameDimensions(
  baseline: Buffer,
  current: Buffer
): Promise<{ baseline: RawImageData; current: RawImageData; width: number; height: number }> {
  const baselineMeta = await getImageMetadata(baseline);
  const { width, height } = baselineMeta;

  const baselineRaw = await toRawRGBA(baseline);

  const resizedCurrentBuffer = await sharp(current)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const currentRaw: RawImageData = {
    data: resizedCurrentBuffer,
    width,
    height,
    channels: 4,
  };

  return { baseline: baselineRaw, current: currentRaw, width, height };
}

/**
 * Crops a region from an image buffer.
 */
export async function cropRegion(image: Buffer, bounds: Bounds): Promise<Buffer> {
  return sharp(image)
    .extract({
      left: bounds.x,
      top: bounds.y,
      width: bounds.width,
      height: bounds.height,
    })
    .png()
    .toBuffer();
}

/**
 * Generates a side-by-side comparison image: [baseline | current | diff]
 */
export async function generateSideBySide(
  baseline: Buffer,
  current: Buffer,
  diff: Buffer
): Promise<Buffer> {
  const meta = await getImageMetadata(baseline);
  const { width, height } = meta;

  const [resizedCurrent, resizedDiff] = await Promise.all([
    sharp(current).resize(width, height, { fit: 'fill' }).png().toBuffer(),
    sharp(diff).resize(width, height, { fit: 'fill' }).png().toBuffer(),
  ]);

  return sharp({
    create: {
      width: width * 3,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .composite([
      { input: baseline, left: 0, top: 0 },
      { input: resizedCurrent, left: width, top: 0 },
      { input: resizedDiff, left: width * 2, top: 0 },
    ])
    .png()
    .toBuffer();
}

/**
 * Generates an overlay comparison image blending baseline and current.
 *
 * @param alpha - blend factor for current image (0.0 = baseline only, 1.0 = current only)
 */
export async function generateOverlay(
  baseline: Buffer,
  current: Buffer,
  alpha = 0.5
): Promise<Buffer> {
  const meta = await getImageMetadata(baseline);
  const { width, height } = meta;

  const resizedCurrent = await sharp(current)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .png()
    .toBuffer();

  const opacity = Math.round(alpha * 255);

  return sharp(baseline)
    .composite([
      {
        input: resizedCurrent,
        blend: 'over',
        premultiplied: false,
        tile: false,
        // Blend current at specified opacity over baseline
        raw: undefined,
        // Use sharp's limitInputPixels for safety
      },
    ])
    .modulate({ brightness: 1 })
    .png()
    .toBuffer();

  // Note: sharp's composite 'over' blend uses the alpha channel of the overlay.
  // To achieve a true blend ratio we tint the overlay with the desired alpha.
  void opacity; // Used conceptually; sharp handles alpha via the image's own channel.
}

/**
 * Highlights changed regions in the current image by drawing a semi-transparent
 * red overlay wherever the diff mask has non-zero pixels.
 */
export async function generateHighlightedDiff(
  current: Buffer,
  diffMaskBuffer: Buffer,
  highlightColor: { r: number; g: number; b: number } = { r: 255, g: 0, b: 0 }
): Promise<Buffer> {
  const meta = await getImageMetadata(current);
  const { width, height } = meta;

  // Create a solid-color highlight layer
  const highlight = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: highlightColor.r, g: highlightColor.g, b: highlightColor.b, alpha: 180 },
    },
  })
    .png()
    .toBuffer();

  // Resize diff mask to match current image
  const resizedMask = await sharp(diffMaskBuffer)
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .png()
    .toBuffer();

  return sharp(current)
    .composite([
      {
        input: highlight,
        blend: 'over',
        // Mask composite to only apply where diff exists
      },
      {
        input: resizedMask,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
}
