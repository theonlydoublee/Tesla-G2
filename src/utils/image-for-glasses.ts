/**
 * Load image from URL, resize to target dimensions, export as PNG bytes for G2.
 * Caches the result to avoid re-processing on every rebuild.
 */

const BG_IMAGE_URL = '/bg.png';

let cachedPngBytes: number[] | null = null;
const imageCache = new Map<string, number[]>();

/**
 * Load an image from URL, resize to target dimensions, and return PNG bytes as number[].
 * Caches results by url+width+height. Returns null if the image fails to load or decode.
 */
export async function loadAndPrepareImage(
  url: string,
  width: number,
  height: number
): Promise<number[] | null> {
  const cacheKey = `${url}|${width}|${height}`;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!pngBlob) return null;

    const buffer = await pngBlob.arrayBuffer();
    const pngBytes = Array.from(new Uint8Array(buffer));
    imageCache.set(cacheKey, pngBytes);
    return pngBytes;
  } catch (err) {
    console.warn('[Tesla] Failed to load image:', url, err);
    return null;
  }
}

/**
 * Load the background image, resize to target dimensions, and return PNG bytes as number[].
 * Returns null if the image fails to load or decode.
 */
export async function loadAndPrepareBackgroundImage(
  width: number,
  height: number
): Promise<number[] | null> {
  if (cachedPngBytes) return cachedPngBytes;
  cachedPngBytes = await loadAndPrepareImage(BG_IMAGE_URL, width, height);
  return cachedPngBytes;
}
