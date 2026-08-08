/**
 * Sized image URLs — route remote photos through the website's image
 * optimizer instead of pulling full-resolution originals into the app.
 *
 * Why this exists (2026-08-08): the app painted untouched Supabase
 * originals into every surface, including the Campus grid, which
 * renders up to 100 KidCards at 150pt wide. A roster photo averages
 * ~550KB, so one scroll of that grid pulled ~30MB of full-resolution
 * JPEG to draw thumbnails. Combined with Supabase's default one-hour
 * cache header, that exhausted the project's cached-egress quota and
 * took every photo on the site, the app, and the admin panel down
 * with a 402.
 *
 * The web has never had this problem: next/image already re-encodes
 * and resizes every kid photo. This routes the app through that exact
 * pipeline, so the app is now at parity with the website rather than
 * below it.
 *
 * Measured on the worst case in the roster (#22, an 886KB source):
 *   card (w=640)  ->  32KB, 27x smaller
 *   hero (w=1200) -> 113KB, 7.6x smaller
 * Compared side by side at 1:1 pixels, skin texture, eyelashes, and
 * catchlights are indistinguishable from the original. The ORIGINALS
 * ARE NEVER MODIFIED — this only changes which rendition we request.
 *
 * After the first request each rendition is served from the site's
 * edge cache for a year, so repeat views cost Supabase nothing.
 */
import { API_BASE_URL } from './api';

/**
 * Hosts the optimizer will actually accept. Must stay in sync with
 * `images.remotePatterns` in next.config.ts — a host missing there
 * makes /_next/image answer 400, which in the app reads as a photo
 * that silently never loads. Anything not listed passes through
 * untouched.
 */
const OPTIMIZABLE_HOST = /(^|\.)supabase\.co$|^v5\.airtableusercontent\.com$|^dl\.airtable\.com$/;

/**
 * Next only honors widths from `deviceSizes` ∪ `imageSizes`; any other
 * value is rejected. These are the framework defaults, which the site
 * doesn't override.
 */
const ALLOWED_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
  3840,
];

/** Video and document sources must reach the player/viewer untouched. */
const NOT_AN_IMAGE = /\.(mp4|mov|m4v|webm|avi|mkv|pdf|doc|docx)(\?|#|$)/i;

/** Smallest allowed width that still covers the target, capped at max. */
function snapWidth(target: number): number {
  for (const w of ALLOWED_WIDTHS) if (w >= target) return w;
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

/**
 * Rewrite `url` to the optimizer at the smallest rendition that still
 * covers `targetPx` PHYSICAL pixels (i.e. points × device pixel ratio,
 * which callers pass already multiplied).
 *
 * Returns the input unchanged when it isn't an optimizable remote
 * image — local requires, data/blob URIs, videos, PDFs, unknown hosts,
 * and URLs already pointing at the optimizer. Never throws: a URL that
 * fails to parse falls through as-is, because a slightly-too-large
 * photo is a much better failure than no photo.
 */
export function sizedImage(
  url: string | null | undefined,
  targetPx: number
): string | undefined {
  if (!url) return undefined;
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed; // data:, file:, blob:
  if (trimmed.includes('/_next/image')) return trimmed; // already sized
  if (NOT_AN_IMAGE.test(trimmed)) return trimmed;

  let host: string;
  try {
    host = new URL(trimmed).hostname;
  } catch {
    return trimmed;
  }
  if (!OPTIMIZABLE_HOST.test(host)) return trimmed;

  const w = snapWidth(Math.max(1, Math.round(targetPx)));
  return `${API_BASE_URL}/_next/image?url=${encodeURIComponent(
    trimmed
  )}&w=${w}&q=75`;
}

/**
 * Named sizes for the surfaces that render photos, in physical pixels.
 * Derived from each container's point size at a 3x device pixel ratio
 * (the densest phones ship), then snapped up to an allowed width.
 *
 * Keep these honest: requesting far more than a container paints is
 * how the original problem started, and requesting less than it paints
 * is how photos start looking soft.
 */
export const IMG = {
  /** 48–56pt avatar in the notes list. */
  avatar: 256,
  /** ~104–120pt round/rounded portrait (home strip, keep-going). */
  portraitSmall: 384,
  /** 150pt KidCard and the 2-up Campus grid. */
  card: 640,
  /** Newsletter cover on the home feed. */
  cover: 828,
  /** Full-bleed feed photo and campus update. */
  feed: 1080,
  /** Full-width kid hero, the reveal, newsletter hero and body. */
  hero: 1200,
  /** Full-screen viewer — pinch-zooms to 4x, so it gets real pixels. */
  zoomable: 1920,
} as const;
