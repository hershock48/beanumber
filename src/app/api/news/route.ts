/**
 * GET /api/news
 *
 * Returns the recent campus newsletters as JSON. Mirrors what
 * src/lib/newsletter-feed.ts gives the web kid pages and /news,
 * just exposed over JSON for non-Next.js clients (the mobile app).
 *
 * Additive endpoint — does not change existing web behavior.
 */

import { NextResponse } from 'next/server';
import { getRecentCampusNewsletters } from '@/lib/newsletter-feed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.max(1, Math.min(50, parseInt(limitParam, 10))) : 12;
    const newsletters = await getRecentCampusNewsletters(limit);
    return NextResponse.json(newsletters);
  } catch (err) {
    console.error('[api/news] Error', err);
    return NextResponse.json(
      { error: 'Failed to fetch newsletters' },
      { status: 500 }
    );
  }
}
