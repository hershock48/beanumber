/**
 * Print files for the Printful line.
 *
 * Printful takes each placement as a URL it fetches once and caches
 * against that URL. So the number lives in the URL:
 *
 *   /print/back/47.png?ink=white     back placement for #47, white ink
 *   /print/front/globe.png?ink=white front placement (no number)
 *
 * Both are rendered here from the SVG sources in public/shirt-designs
 * with resvg, at 300 DPI on a 12 x 16 inch canvas (3600 x 4800 px),
 * which is the standard DTG front/back area on both the Bella+Canvas
 * 3501 and the Gildan 18500. Printful scales a file to fit the print
 * area, so the canvas doubles as the layout: the art sits where it
 * sits on the shirt.
 *
 * Layout PLACEHOLDERS for Kevin (2026-09-14). Numbers are in inches
 * from the top of the print area, centered horizontally:
 *   back:  screen art (CHANGE THE WORLD + logo + ORDER #) 8.75in wide,
 *          top edge 1.5in down; the number 1.1in tall, 0.45in below
 *          the art. Same arrangement as the tees.
 *   front: the globe 9in wide, top edge 2.5in down.
 * Change the constants below; the URLs do not change, but Printful
 * caches by URL, so bump PRINT_VERSION after any change so every
 * placement is fetched fresh.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const PRINT_VERSION = '1';

const DPI = 300;
const CANVAS_IN = { w: 12, h: 16 };
export const CANVAS_PX = { w: CANVAS_IN.w * DPI, h: CANVAS_IN.h * DPI };

const BACK_ART_WIDTH_IN = 8.75;
const BACK_ART_TOP_IN = 1.5;
const NUMBER_HEIGHT_IN = 1.1;
const NUMBER_GAP_IN = 0.45;
const NUMBER_LETTER_SPACING_EM = 0.18;

const FRONT_ART_WIDTH_IN = 9;
const FRONT_ART_TOP_IN = 2.5;

export type Ink = 'white' | 'black';
const INK_HEX: Record<Ink, string> = { white: '#ffffff', black: '#000000' };

function px(inches: number): number {
  return Math.round(inches * DPI);
}

function repoFile(...parts: string[]): string {
  return path.join(process.cwd(), ...parts);
}

/** The outlined back screen: every glyph is already a path, so no font is needed for it. */
async function backArtSvg(): Promise<{ inner: string; viewBox: { w: number; h: number } }> {
  const raw = await readFile(repoFile('public', 'shirt-designs', 'back-halftone-875x825-outlined.svg'), 'utf8');
  const vb = /viewBox="([\d.\s-]+)"/.exec(raw);
  const [, , w, h] = (vb?.[1] || '0 0 581.9287 534.55078').split(/\s+/).map(Number);
  // Strip the outer <svg> and xml prolog; keep the drawing.
  const inner = raw
    .replace(/<\?xml[^>]*>/, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  return { inner, viewBox: { w, h } };
}

async function frontArtSvg(): Promise<{ inner: string; viewBox: { w: number; h: number } }> {
  const raw = await readFile(repoFile('public', 'shirt-designs', 'globe.svg'), 'utf8');
  const vb = /viewBox="([\d.\s-]+)"/.exec(raw);
  const [, , w, h] = (vb?.[1] || '0 0 100 100').split(/\s+/).map(Number);
  const inner = raw
    .replace(/<\?xml[^>]*>/, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  return { inner, viewBox: { w, h } };
}

/**
 * Full-canvas SVG for the back placement: the screen art with fills
 * recolored to the ink, and the number set in Courier Prime Bold with
 * the same wide tracking the tees use.
 */
export async function backPlacementSvg(shirtNumber: number, ink: Ink): Promise<string> {
  const art = await backArtSvg();
  const color = INK_HEX[ink];
  const artW = px(BACK_ART_WIDTH_IN);
  const scale = artW / art.viewBox.w;
  const artH = art.viewBox.h * scale;
  const artX = (CANVAS_PX.w - artW) / 2;
  const artY = px(BACK_ART_TOP_IN);
  // The outlined file paints black, partly through explicit fills and
  // partly through the SVG default (no fill attribute at all), so the
  // wrapping <g> below sets the ink as the inherited fill AND every
  // explicit black is rewritten. Halftone dots are fills too.
  const recolored = art.inner
    .replace(/fill:#000000/g, `fill:${color}`)
    .replace(/fill="#000000"/g, `fill="${color}"`)
    .replace(/fill:#000\b/g, `fill:${color}`)
    .replace(/fill="#000"/g, `fill="${color}"`)
    .replace(/fill="black"/g, `fill="${color}"`)
    .replace(/fill:black/g, `fill:${color}`);

  const numberSize = px(NUMBER_HEIGHT_IN);
  const numberY = artY + artH + px(NUMBER_GAP_IN) + numberSize * 0.8;
  const label = String(shirtNumber).padStart(4, '0');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_PX.w}" height="${CANVAS_PX.h}" viewBox="0 0 ${CANVAS_PX.w} ${CANVAS_PX.h}">
  <g fill="${color}" stroke="none" transform="translate(${artX.toFixed(2)} ${artY}) scale(${scale.toFixed(6)})">${recolored}</g>
  <text x="${CANVAS_PX.w / 2}" y="${numberY.toFixed(1)}" text-anchor="middle" font-family="Courier Prime" font-weight="700" font-size="${numberSize}" letter-spacing="${(numberSize * NUMBER_LETTER_SPACING_EM).toFixed(1)}" fill="${color}">${label}</text>
</svg>`;
}

/**
 * globe.svg draws inside a padded 1024-unit viewBox: the visible globe
 * occupies this box (measured from a render with scripts/print-preview
 * on 2026-09-14). The front layout is sized and placed by the visible
 * globe, not the padded box, so "9 inches wide" means the globe.
 */
const GLOBE_BOUNDS = { x: 269 / 1024, y: 275 / 1024, w: 485 / 1024, h: 486 / 1024 };

/** Full-canvas SVG for the front placement: the globe, recolored to the ink. */
export async function frontPlacementSvg(ink: Ink): Promise<string> {
  const art = await frontArtSvg();
  const color = INK_HEX[ink];
  const artW = px(FRONT_ART_WIDTH_IN);
  const scale = artW / (art.viewBox.w * GLOBE_BOUNDS.w);
  const artX = (CANVAS_PX.w - artW) / 2 - GLOBE_BOUNDS.x * art.viewBox.w * scale;
  const artY = px(FRONT_ART_TOP_IN) - GLOBE_BOUNDS.y * art.viewBox.h * scale;
  const recolored = art.inner
    .replace(/fill="currentColor"/g, `fill="${color}"`)
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)
    .replace(/fill:#000000/g, `fill:${color}`)
    .replace(/fill="#000000"/g, `fill="${color}"`)
    .replace(/fill="#000"/g, `fill="${color}"`)
    .replace(/fill="black"/g, `fill="${color}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_PX.w}" height="${CANVAS_PX.h}" viewBox="0 0 ${CANVAS_PX.w} ${CANVAS_PX.h}">
  <g fill="${color}" transform="translate(${artX.toFixed(2)} ${artY}) scale(${scale.toFixed(6)})">${recolored}</g>
</svg>`;
}

/**
 * Rasterize an SVG string to a PNG buffer with resvg. Fonts are the
 * two files bundled in ./fonts; system fonts are never consulted so
 * the output is identical on a laptop and on Vercel.
 */
export async function renderPng(svg: string): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');
  const fontDir = repoFile('src', 'lib', 'printful', 'fonts');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      loadSystemFonts: false,
      fontFiles: [
        path.join(fontDir, 'CourierPrime-Bold.ttf'),
        path.join(fontDir, 'ArchivoBlack-Regular.ttf'),
      ],
      defaultFontFamily: 'Courier Prime',
    },
    background: 'rgba(0,0,0,0)',
  });
  return Buffer.from(resvg.render().asPng());
}

// ── URLs Printful fetches ───────────────────────────────────────

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org').replace(/\/$/, '');
}

export function backPlacementUrl(shirtNumber: number, ink: Ink): string {
  return `${siteUrl()}/print/back/${shirtNumber}.png?ink=${ink}&v=${PRINT_VERSION}`;
}

export function frontPlacementUrl(ink: Ink): string {
  return `${siteUrl()}/print/front/globe.png?ink=${ink}&v=${PRINT_VERSION}`;
}

export function parseInk(value: string | null): Ink {
  return value === 'black' ? 'black' : 'white';
}
