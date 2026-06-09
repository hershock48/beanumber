/**
 * Selective Ship — mark specific fulfillment records as Shipped
 *
 * POST /api/admin/fulfillment/ship
 * Body: { recordIds: string[] }
 *
 * Marks the given records as Shipped in Airtable, then sets
 * DripNextSend on each unique donor so the drip nurture sequence
 * begins 3 days after shipment.
 *
 * This replaces the old mark-shipped endpoint's "ship everything"
 * approach with selective shipping from the fulfillment dashboard.
 *
 * Auth: X-Admin-Token header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { verifyAdminToken } from '@/lib/auth';

const FULFILLMENT_TABLE_ID = 'tblkSZBRrMiHhT3MP';
const DONORS_TABLE_ID = 'tblhuLpJgYLB0pTjx';

const F = {
  orderNum: 'fldsUZIXLFesyzg8u',
  email:    'fldUakXkAhW2hYLxL',
  buyer:    'fldbGofwASSXDYj9R',
  shipping: 'fldJ6ehpDkpindHtO',
} as const;

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

function fieldVal(rec: AirtableRecord, fieldId: string): string {
  const v = rec.fields[fieldId];
  if (!v) return '';
  if (typeof v === 'object' && v !== null && 'name' in v) return (v as { name: string }).name;
  return String(v);
}

export async function POST(request: NextRequest) {
  const env = getEnv();

  // Auth — accepts admin session cookie OR X-Admin-Token header.
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const recordIds: string[] = body.recordIds;

  if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds array is required' }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // 1. First, fetch these records to get buyer emails for drip enrollment
  const fetchedRecords: AirtableRecord[] = [];
  for (let i = 0; i < recordIds.length; i += 100) {
    const batch = recordIds.slice(i, i + 100);
    // Use filterByFormula with OR(RECORD_ID()=...) to fetch specific records
    const formula = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
    const params = new URLSearchParams();
    params.set('filterByFormula', formula);
    params.set('returnFieldsByFieldId', 'true');

    const res = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${FULFILLMENT_TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } }
    );

    if (res.ok) {
      const data = await res.json();
      fetchedRecords.push(...(data.records || []));
    }
  }

  // 2. Mark as Shipped (max 10 per PATCH)
  const shippedIds: string[] = [];
  for (let i = 0; i < recordIds.length; i += 10) {
    const batch = recordIds.slice(i, i + 10);
    const patchRes = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${FULFILLMENT_TABLE_ID}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          records: batch.map(id => ({
            id,
            fields: { [F.shipping]: 'Shipped' },
          })),
          returnFieldsByFieldId: true,
        }),
      }
    );

    if (!patchRes.ok) {
      const err = await patchRes.text();
      return NextResponse.json({
        error: 'Failed to update records',
        detail: err,
        shippedSoFar: shippedIds.length,
      }, { status: 502 });
    }

    shippedIds.push(...batch);
  }

  // 3. Reschedule drip timers for unique buyer emails.
  //
  // Every shirt buyer who came through the Stripe webhook already has
  // DripPipeline + DripNextSend set. The webhook seeds DripNextSend to
  // (purchase + 10 days) as a fallback in case shipment isn't marked
  // here in the admin UI. THIS endpoint replaces that fallback with
  // the real (ship + 3 days) date — that's the whole point of marking
  // an order shipped. Previously we skipped any donor with
  // DripNextSend already populated, which meant we skipped every
  // buyer the webhook had ever touched — i.e. all of them — and the
  // drip never actually got the "real ship date" handoff. Fixed.
  //
  // For Donorbox-imported donors who never went through the webhook:
  // DripPipeline is empty. We assign shirt_nurture as the default
  // (every Fulfillment row is by definition a shirt buyer) and kick
  // them off at ship + 3.

  const uniqueEmails = new Set<string>();
  for (const rec of fetchedRecords) {
    const email = fieldVal(rec, F.email).toLowerCase().trim();
    if (email) uniqueEmails.add(email);
  }

  const dripDate = new Date();
  dripDate.setUTCDate(dripDate.getUTCDate() + 3);
  const dripNextSend = dripDate.toISOString().split('T')[0];

  const dripsRescheduled: string[] = [];
  const dripsNewlyEnrolled: string[] = [];

  for (const email of uniqueEmails) {
    try {
      const lookupFormula = `LOWER({Email Address}) = "${email}"`;
      const lookupParams = new URLSearchParams();
      lookupParams.set('filterByFormula', lookupFormula);
      lookupParams.set('maxRecords', '1');
      lookupParams.set('fields[]', 'Email Address');
      lookupParams.append('fields[]', 'DripPipeline');
      lookupParams.append('fields[]', 'DripStage');

      const lookupRes = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${DONORS_TABLE_ID}?${lookupParams}`,
        { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } }
      );

      if (!lookupRes.ok) continue;

      const lookupData = await lookupRes.json();
      const donor = lookupData.records?.[0];
      if (!donor) continue;

      const pipeline = donor.fields?.DripPipeline || '';
      const stage = donor.fields?.DripStage;

      // Build the patch. Always reset DripNextSend. If they're already
      // mid-sequence (Stage > 0) we don't reset Stage — they keep
      // making forward progress, just on the post-ship timeline. If
      // they're not enrolled at all, assign the default pipeline and
      // start them at Stage 0.
      const patchFields: Record<string, unknown> = {
        DripNextSend: dripNextSend,
      };

      let isNew = false;
      if (!pipeline) {
        patchFields.DripPipeline = 'shirt_nurture';
        patchFields.DripStage = 0;
        isNew = true;
      } else if (stage == null) {
        patchFields.DripStage = 0;
      }

      const updateRes = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${DONORS_TABLE_ID}/${donor.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ fields: patchFields }),
        }
      );

      if (updateRes.ok) {
        if (isNew) dripsNewlyEnrolled.push(email);
        else dripsRescheduled.push(email);
      }
    } catch {
      // Non-fatal
    }
  }

  // 4. Build summary
  const orderNums = fetchedRecords.map(r => fieldVal(r, F.orderNum)).filter(Boolean);
  const totalDripsTouched = dripsRescheduled.length + dripsNewlyEnrolled.length;

  return NextResponse.json({
    message:
      `Shipped ${shippedIds.length} order${shippedIds.length === 1 ? '' : 's'}. ` +
      `Drip timer set to ship + 3 days for ${totalDripsTouched} buyer${totalDripsTouched === 1 ? '' : 's'}` +
      (dripsNewlyEnrolled.length
        ? ` (${dripsNewlyEnrolled.length} newly enrolled)`
        : '') +
      `.`,
    shipped: shippedIds.length,
    orderNumbers: orderNums,
    dripsTouched: totalDripsTouched,
    dripsRescheduled: dripsRescheduled.length,
    dripsNewlyEnrolled: dripsNewlyEnrolled.length,
    dripNextSend,
  });
}
