/**
 * Client-side image compression.
 *
 * Phone photos routinely run 4–10 MB raw. Airtable's content upload
 * endpoint caps inline base64 uploads at ~5 MB total request body,
 * which works out to ~3.7 MB raw payload. Anything bigger gets
 * rejected with a 413, and Simon (on the ground in Uganda) has no
 * easy way to shrink a photo before uploading.
 *
 * This helper runs in the browser before the file ever leaves the
 * device. It detects images, downscales the longest side to 1600px,
 * and re-encodes as JPEG at a quality level that gets the file
 * comfortably under the limit. PDFs and other non-image files pass
 * through untouched.
 *
 * Returns a File object — either the compressed JPEG or the
 * original. Callers should pass the result to their base64 encoder
 * and upload normally.
 */

const MAX_DIMENSION = 1600;
const TARGET_MAX_BYTES = 2_800_000; // ~2.8 MB raw, well under Airtable's cap
const QUALITY_LEVELS = [0.85, 0.75, 0.6, 0.45];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      quality
    );
  });
}

function withJpgExtension(filename: string): string {
  return filename.replace(/\.[^./\\]+$/, '') + '.jpg';
}

export async function compressImageIfNeeded(file: File): Promise<File> {
  // Non-image files (PDFs, etc.) pass through untouched.
  if (!file.type.startsWith('image/')) return file;
  // Already small enough — no work.
  if (file.size <= TARGET_MAX_BYTES) return file;

  let img: HTMLImageElement;
  try {
    const dataUrl = await readAsDataUrl(file);
    img = await loadImage(dataUrl);
  } catch {
    // If we can't decode, return the original and let the server
    // surface a real error.
    return file;
  }

  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  // White background so PNGs with transparency don't render dark.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let lastBlob: Blob | null = null;
  for (const quality of QUALITY_LEVELS) {
    try {
      const blob = await canvasToBlob(canvas, quality);
      lastBlob = blob;
      if (blob.size <= TARGET_MAX_BYTES) {
        return new File([blob], withJpgExtension(file.name), {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
      }
    } catch {
      break;
    }
  }
  // Couldn't get under the target at any quality — return the
  // smallest version we managed (still smaller than the original
  // for big photos).
  if (lastBlob) {
    return new File([lastBlob], withJpgExtension(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  }
  return file;
}
