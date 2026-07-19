/**
 * Fulfillment List — JSON API for the admin fulfillment dashboard
 *
 * GET /api/admin/fulfillment/list
 *   ?status=unshipped (default) | shipped | all
 *
 * Returns fulfillment rows as JSON with all fields needed for the
 * unified fulfillment page: shirt spec, address, buyer info, child
 * name, and drip status for shipped orders.
 *
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { fulfillments, donors } from '@/lib/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';

// Size sort order — Youth first (smallest bodies), then Adult small→big.
// Keys MUST match what's actually stored in fulfillments.size: full
// strings like "Youth S", not short codes.
const SIZE_ORDER: Record<string, number> = {
  'Youth S': 0, 'Youth M': 1, 'Youth L': 2, 'Youth XL': 3,
  S: 4, M: 5, L: 6, XL: 7, '2XL': 8, '3XL': 9, '4XL': 10,
};

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get('status') || 'unshipped';

  const where =
    status === 'unshipped'
      ? eq(fulfillments.shipping, 'Not Shipped')
      : status === 'shipped'
        ? // 'Handed in Person' = market-booth sales (2026-07-19). The
          // buyer left with the shirt, so they belong with fulfilled
          // orders, never in the To Ship queue. The dashboard tags
          // them "In person" so they read distinctly from mailed ones.
          inArray(fulfillments.shipping, ['Shipped', 'Handed in Person'])
        : undefined;

  const rows = where
    ? await db.select().from(fulfillments).where(where)
    : await db.select().from(fulfillments);

  // Sort by size primary, order number secondary.
  rows.sort((a, b) => {
    const sa = SIZE_ORDER[a.size || ''] ?? 99;
    const sb = SIZE_ORDER[b.size || ''] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.orderNumber ?? 0) - (b.orderNumber ?? 0);
  });

  // Drip lookup for shipped orders — pull donor drip pipeline state.
  const dripByEmail: Record<
    string,
    { pipeline: string; stage: number; nextSend: string }
  > = {};
  if (status === 'shipped' || status === 'all') {
    const emails = Array.from(
      new Set(
        rows
          .map(r => (r.buyerEmail || '').toLowerCase().trim())
          .filter(Boolean)
      )
    );
    if (emails.length > 0) {
      // Single query, case-insensitive — match the lowered email list.
      const donorRows = await db
        .select({
          email: donors.email,
          dripPipeline: donors.dripPipeline,
          dripStage: donors.dripStage,
          dripNextSend: donors.dripNextSend,
        })
        .from(donors)
        .where(inArray(sql`lower(${donors.email})`, emails));
      for (const d of donorRows) {
        if (!d.dripPipeline) continue;
        const key = (d.email || '').toLowerCase();
        dripByEmail[key] = {
          pipeline: d.dripPipeline,
          stage: d.dripStage ?? 0,
          nextSend: d.dripNextSend || '',
        };
      }
    }
  }

  const orders = rows.map(rec => {
    const email = (rec.buyerEmail || '').toLowerCase().trim();
    const out: Record<string, unknown> = {
      id: rec.id,
      orderNum: String(rec.orderNumber ?? ''),
      design: rec.design || '',
      shirtColor: rec.shirtColor || '',
      size: rec.size || '',
      vinylFront: rec.vinylFront || '',
      vinylBack: rec.vinylBack || '',
      buyer: rec.buyerName || '',
      email: rec.buyerEmail || '',
      shipName: rec.shipName || rec.buyerName || '',
      shipStreet1: rec.shipStreet1 || '',
      shipStreet2: rec.shipStreet2 || '',
      shipCity: rec.shipCity || '',
      shipState: rec.shipState || '',
      shipZip: rec.shipZip || '',
      shipping: rec.shipping || '',
      childName: rec.childName || '',
      orderDate: rec.orderDate || '',
      notes: rec.notes || '',
      hasAddress: !!(rec.shipStreet1 && rec.shipCity && rec.shipState),
    };
    if (dripByEmail[email]) out.drip = dripByEmail[email];
    return out;
  });

  return NextResponse.json({
    orders,
    count: orders.length,
    status,
  });
}
