/**
 * GET /print/front/globe.png?ink=white|black
 *
 * The front print file (the globe), same canvas and caching rules as
 * the back file. Only one design exists today; the segment is there so
 * a seasonal front design can be added without changing the URL shape.
 */

import { NextRequest, NextResponse } from 'next/server';
import { frontPlacementSvg, parseInk, renderPng } from '@/lib/printful/print-files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ design: string }> }) {
  const { design } = await ctx.params;
  const name = design.replace(/\.png$/i, '');
  if (name !== 'globe') {
    return NextResponse.json({ error: 'Unknown design' }, { status: 404 });
  }
  const ink = parseInk(request.nextUrl.searchParams.get('ink'));
  try {
    const svg = await frontPlacementSvg(ink);
    const png = await renderPng(svg);
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="ban-front-${name}-${ink}.png"`,
      },
    });
  } catch (err) {
    console.error('[print/front] render failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Render failed' }, { status: 500 });
  }
}
