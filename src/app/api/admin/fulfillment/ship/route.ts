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

  // Auth
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const token = request.headers.get('X-Admin-Token');
  if ((!adminToken && !adminPassword) || (token !== adminToken && token !== adminPassword)) {
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

  // 3. Start drip timers for unique buyer emails
  const uniqueEmails = new Set<string>();
  for (const rec of fetchedRecords) {
    const email = fieldVal(rec, F.email).toLowerCase().trim();
    if (email) uniqueEmails.add(email);
  }

  const dripDate = new Date();
  dripDate.setUTCDate(dripDate.getUTCDate() + 3);
  const dripNextSend = dripDate.toISOString().split('T')[0];

  const dripsStarted: string[] = [];

  for (const email of uniqueEmails) {
    try {
      const lookupFormula = `LOWER({Email Address}) = "${email}"`;
      const lookupParams = new URLSearchParams();
      lookupParams.set('filterByFormula', lookupFormula);
      lookupParams.set('maxRecords', '1');
      lookupParams.set('fields[]', 'Email Address');
      lookupParams.append('fields[]', 'DripPipeline');
      lookupParams.append('fields[]', 'DripNextSend');

      const lookupRes = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${DONORS_TABLE_ID}?${lookupParams}`,
        { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } }
      );

      if (!lookupRes.ok) continue;

      const lookupData = await lookupRes.json();
      const donor = lookupData.records?.[0];
      if (!donor) continue;

      const pipeline = donor.fields?.DripPipeline || '';
      const existingNextSend = donor.fields?.DripNextSend || '';

      if (!pipeline || existingNextSend) continue;

      const updateRes = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${DONORS_TABLE_ID}/${donor.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            fields: { DripNextSend: dripNextSend },
          }),
        }
      );

      if (updateRes.ok) dripsStarted.push(email);
    } catch {
      // Non-fatal
    }
  }

  // 4. Build summary
  const orderNums = fetchedRecords.map(r => fieldVal(r, F.orderNum)).filter(Boolean);

  return NextResponse.json({
    message: `Shipped ${shippedIds.length} order${shippedIds.length === 1 ? '' : 's'}. Drip emails started for ${dripsStarted.length} buyer${dripsStarted.length === 1 ? '' : 's'}.`,
    shipped: shippedIds.length,
    orderNumbers: orderNums,
    dripsStarted: dripsStarted.length,
    dripNextSend,
  });
}
