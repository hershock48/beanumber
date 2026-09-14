/**
 * GET /print/back/[n].png?ink=white|black
 *
 * The back print file for shirt number n: the screen art plus the
 * number, at 300 DPI on the 12 x 16 inch DTG area. Printful fetches
 * this URL once per number and caches it. Public on purpose: the file
 * shows a number and the campus art, nothing about a buyer or a kid.
 *
 * Cached for a year at the edge; the version query string in the URL
 * (see PRINT_VERSION) is how a layout change invalidates it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backPlacementSvg, parseInk, renderPng } from '@/lib/printful/print-files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ n: string }> }) {
  const { n } = await ctx.params;
  const num = parseInt(n.replace(/\.png$/i, ''), 10);
  if (!Number.isFinite(num) || num < 1 || num > 99999) {
    return NextResponse.json({ error: 'Bad number' }, { status: 400 });
  }
  const ink = parseInk(request.nextUrl.searchParams.get('ink'));
  try {
    const svg = await backPlacementSvg(num, ink);
    const png = await renderPng(svg);
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="ban-back-${num}-${ink}.png"`,
      },
    });
  } catch (err) {
    console.error('[print/back] render failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Render failed' }, { status: 500 });
  }
}
