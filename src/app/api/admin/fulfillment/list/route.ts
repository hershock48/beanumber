/**
 * Fulfillment List — JSON API for the admin fulfillment dashboard
 *
 * GET /api/admin/fulfillment/list
 *   ?status=unshipped (default) | shipped | all
 *
 * Returns fulfillment records as JSON with all fields needed for
 * the unified fulfillment page: shirt spec, address, buyer info,
 * child name, and drip status for shipped orders.
 *
 * Auth: X-Admin-Token header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { verifyAdminToken } from '@/lib/auth';

const FULFILLMENT_TABLE_ID = 'tblkSZBRrMiHhT3MP';
const DONORS_TABLE_ID = 'tblhuLpJgYLB0pTjx';

const F = {
  orderNum:    'fldsUZIXLFesyzg8u',
  design:      'fldsWHbE3yq7Xoyn4',
  shirtColor:  'fldaVW0nkpBjz0Gm7',
  size:        'fldicYGUVXRbCP4ze',
  vinylFront:  'fldwFBqD55i4G5yBf',
  vinylBack:   'fldp3RObd3abl3O7w',
  buyer:       'fldbGofwASSXDYj9R',
  email:       'fldUakXkAhW2hYLxL',
  shipName:    'fldOhzT4xrR1jaJYC',
  shipStreet1: 'fldaNij76IbSJwf8l',
  shipStreet2: 'fldIptRN8o5c1JYZV',
  shipCity:    'fldklictYmJe4rW5C',
  shipState:   'fldqXjndiZ1dOoIZj',
  shipZip:     'fld4TPxLBb9jaAa14',
  production:  'fldbBZtOLYVVDS28X',
  shipping:    'fldJ6ehpDkpindHtO',
  tracking:    'flddun1GJzynbK9MU',
  childName:   'fldkACkyAtFQCOPFL',
  orderDate:   'fldnXiHlwBtEWP3io',
  notes:       'fldoX0697ASTKcDvD',
} as const;

// Size sort order — small to large
const SIZE_ORDER: Record<string, number> = {
  'YS': 0, 'YM': 1, 'YL': 2,
  'S': 3, 'M': 4, 'L': 5, 'XL': 6, '2XL': 7, '3XL': 8, '4XL': 9,
};

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

export async function GET(request: NextRequest) {
  const env = getEnv();

  // Auth — accepts admin session cookie OR X-Admin-Token header.
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get('status') || 'unshipped';

  // Build Airtable formula filter
  let formula = '';
  if (status === 'unshipped') {
    formula = `{Shipping}="Not Shipped"`;
  } else if (status === 'shipped') {
    formula = `{Shipping}="Shipped"`;
  }
  // status=all → no formula, fetch everything

  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    if (formula) params.set('filterByFormula', formula);
    params.set('pageSize', '100');
    params.set('returnFieldsByFieldId', 'true');
    if (offset) params.set('offset', offset);

    const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${FULFILLMENT_TABLE_ID}?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'Airtable fetch failed', detail: err }, { status: 502 });
    }

    const data = await res.json();
    allRecords.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  // Sort by size (primary), then order number (secondary)
  allRecords.sort((a, b) => {
    const sizeA = SIZE_ORDER[fieldVal(a, F.size)] ?? 99;
    const sizeB = SIZE_ORDER[fieldVal(b, F.size)] ?? 99;
    if (sizeA !== sizeB) return sizeA - sizeB;
    const numA = Number(a.fields[F.orderNum]) || 0;
    const numB = Number(b.fields[F.orderNum]) || 0;
    return numA - numB;
  });

  // For shipped orders, also pull drip data from Donors table
  const dripByEmail: Record<string, { pipeline: string; stage: number; nextSend: string }> = {};

  if (status === 'shipped' || status === 'all') {
    const uniqueEmails = new Set<string>();
    for (const rec of allRecords) {
      const email = fieldVal(rec, F.email).toLowerCase().trim();
      if (email) uniqueEmails.add(email);
    }

    // Fetch drip info for these donors (batch by email)
    for (const email of uniqueEmails) {
      try {
        const lookupFormula = `LOWER({Email Address}) = "${email}"`;
        const lookupParams = new URLSearchParams();
        lookupParams.set('filterByFormula', lookupFormula);
        lookupParams.set('maxRecords', '1');
        lookupParams.set('fields[]', 'Email Address');
        lookupParams.append('fields[]', 'DripPipeline');
        lookupParams.append('fields[]', 'DripStage');
        lookupParams.append('fields[]', 'DripNextSend');

        const lookupRes = await fetch(
          `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${DONORS_TABLE_ID}?${lookupParams}`,
          { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } }
        );

        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          const donor = lookupData.records?.[0];
          if (donor?.fields?.DripPipeline) {
            dripByEmail[email] = {
              pipeline: donor.fields.DripPipeline,
              stage: donor.fields.DripStage ?? 0,
              nextSend: donor.fields.DripNextSend || '',
            };
          }
        }
      } catch {
        // Non-fatal — skip drip lookup for this email
      }
    }
  }

  // Build response
  const orders = allRecords.map(rec => {
    const email = fieldVal(rec, F.email).toLowerCase().trim();
    const order: Record<string, unknown> = {
      id: rec.id,
      orderNum: fieldVal(rec, F.orderNum),
      design: fieldVal(rec, F.design),
      shirtColor: fieldVal(rec, F.shirtColor),
      size: fieldVal(rec, F.size),
      vinylFront: fieldVal(rec, F.vinylFront),
      vinylBack: fieldVal(rec, F.vinylBack),
      buyer: fieldVal(rec, F.buyer),
      email: fieldVal(rec, F.email),
      shipName: fieldVal(rec, F.shipName) || fieldVal(rec, F.buyer),
      shipStreet1: fieldVal(rec, F.shipStreet1),
      shipStreet2: fieldVal(rec, F.shipStreet2),
      shipCity: fieldVal(rec, F.shipCity),
      shipState: fieldVal(rec, F.shipState),
      shipZip: fieldVal(rec, F.shipZip),
      shipping: fieldVal(rec, F.shipping),
      childName: fieldVal(rec, F.childName),
      orderDate: fieldVal(rec, F.orderDate),
      notes: fieldVal(rec, F.notes),
      hasAddress: !!(fieldVal(rec, F.shipStreet1) && fieldVal(rec, F.shipCity) && fieldVal(rec, F.shipState)),
    };

    if (dripByEmail[email]) {
      order.drip = dripByEmail[email];
    }

    return order;
  });

  return NextResponse.json({
    orders,
    count: orders.length,
    status,
  });
}
