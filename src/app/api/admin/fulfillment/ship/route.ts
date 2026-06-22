/**
 * Selective Ship — mark specific fulfillment rows as Shipped
 *
 * POST /api/admin/fulfillment/ship
 * Body: { recordIds: string[] }
 *
 * Marks each row.shipping = 'Shipped' in Postgres, then sets
 * dripNextSend on each unique buyer's donor so the drip nurture
 * sequence begins 3 days after shipment. Buyers not yet enrolled in
 * any drip pipeline get auto-enrolled in shirt_nurture at stage 0.
 *
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { fulfillments, donors } from '@/lib/db/schema';
import { inArray, sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { recordIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const recordIds = Array.isArray(body.recordIds) ? (body.recordIds as string[]) : [];
  if (recordIds.length === 0) {
    return NextResponse.json(
      { error: 'recordIds array is required' },
      { status: 400 }
    );
  }

  // 1. Fetch the rows so we have buyer emails + order numbers.
  const records = await db
    .select()
    .from(fulfillments)
    .where(inArray(fulfillments.id, recordIds));

  // 2. Flip shipping = Shipped.
  await db
    .update(fulfillments)
    .set({ shipping: 'Shipped', updatedAt: new Date() })
    .where(inArray(fulfillments.id, recordIds));

  // 3. Reschedule drips. Every shirt buyer who came through the webhook
  // already has dripPipeline + dripNextSend set (10 days from purchase
  // as a fallback). Replace that with (ship + 3 days). For donors with
  // no pipeline yet (Donorbox-imported, etc), enroll in shirt_nurture
  // at stage 0.
  const uniqueEmails = Array.from(
    new Set(
      records
        .map(r => (r.buyerEmail || '').toLowerCase().trim())
        .filter(Boolean)
    )
  );

  const dripDate = new Date();
  dripDate.setUTCDate(dripDate.getUTCDate() + 3);
  const dripNextSend = dripDate.toISOString().slice(0, 10);

  let dripsRescheduled = 0;
  let dripsNewlyEnrolled = 0;

  for (const email of uniqueEmails) {
    try {
      const donor = (
        await db
          .select()
          .from(donors)
          .where(sql`lower(${donors.email}) = ${email}`)
          .limit(1)
      )[0];
      if (!donor) continue;

      const patch: Record<string, unknown> = {
        dripNextSend,
        updatedAt: new Date(),
      };
      let isNew = false;
      if (!donor.dripPipeline) {
        patch.dripPipeline = 'shirt_nurture';
        patch.dripStage = 0;
        isNew = true;
      } else if (donor.dripStage == null) {
        patch.dripStage = 0;
      }

      await db
        .update(donors)
        .set(patch)
        .where(sql`lower(${donors.email}) = ${email}`);

      if (isNew) dripsNewlyEnrolled++;
      else dripsRescheduled++;
    } catch (err) {
      console.warn('[fulfillment/ship] drip update failed for', email, err);
    }
  }

  const orderNums = records.map(r => String(r.orderNumber ?? '')).filter(Boolean);
  const totalDripsTouched = dripsRescheduled + dripsNewlyEnrolled;

  return NextResponse.json({
    message:
      `Shipped ${records.length} order${records.length === 1 ? '' : 's'}. ` +
      `Drip timer set to ship + 3 days for ${totalDripsTouched} buyer${totalDripsTouched === 1 ? '' : 's'}` +
      (dripsNewlyEnrolled ? ` (${dripsNewlyEnrolled} newly enrolled)` : '') +
      '.',
    shipped: records.length,
    orderNumbers: orderNums,
    dripsTouched: totalDripsTouched,
    dripsRescheduled,
    dripsNewlyEnrolled,
    dripNextSend,
  });
}
