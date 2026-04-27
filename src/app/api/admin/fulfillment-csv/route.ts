/**
 * Fulfillment CSV Export — Pirate Ship batch import format
 *
 * GET /api/admin/fulfillment-csv?status=ready
 *   status=ready  → Production=Done AND Shipping=Not Shipped (default)
 *   status=all    → every record
 *   status=pending → Production=Pending
 *
 * Returns a CSV file that can be uploaded directly to Pirate Ship's
 * "Import Spreadsheet" feature. Columns match their expected format.
 *
 * Requires admin auth (Bearer token = ADMIN_API_TOKEN).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import { getEnv } from '@/lib/env';

const FULFILLMENT_TABLE_ID = 'tblkSZBRrMiHhT3MP';

// Field IDs from the Fulfillment table
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
  notes:       'fldoX0697ASTKcDvD',
} as const;

// Average shirt weight in ounces (6 oz cotton tee + vinyl + poly mailer)
const SHIRT_WEIGHT_OZ = 8;

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

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET(request: NextRequest) {
  // Support both header auth (X-Admin-Token) and query param (?token=)
  const queryToken = request.nextUrl.searchParams.get('token');
  const adminToken = process.env.ADMIN_API_TOKEN;
  if (queryToken && adminToken && queryToken === adminToken) {
    // Authenticated via query param — skip header check
  } else {
    requireAdminAuth(request);
  }

  const env = getEnv();
  const status = request.nextUrl.searchParams.get('status') || 'ready';

  // Build Airtable formula filter
  let formula = '';
  if (status === 'ready') {
    formula = `AND({Production}="Done",{Shipping}="Not Shipped")`;
  } else if (status === 'pending') {
    formula = `{Production}="Pending"`;
  }
  // status=all → no filter

  // Fetch records from Airtable
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

  // Sort by Order # ascending
  allRecords.sort((a, b) => {
    const aNum = Number(a.fields[F.orderNum]) || 0;
    const bNum = Number(b.fields[F.orderNum]) || 0;
    return aNum - bNum;
  });

  // Build CSV — Pirate Ship import columns
  const headers = [
    'Order Number',
    'Ship To - Name',
    'Ship To - Company',
    'Ship To - Address 1',
    'Ship To - Address 2',
    'Ship To - City',
    'Ship To - State',
    'Ship To - Zip',
    'Ship To - Country',
    'Ship To - Phone',
    'Ship To - Email',
    'Item Name',
    'Item SKU',
    'Item Quantity',
    'Total Weight (oz)',
  ];

  const rows: string[] = [headers.map(escapeCSV).join(',')];

  for (const rec of allRecords) {
    const orderNum = fieldVal(rec, F.orderNum);
    const design = fieldVal(rec, F.design);
    const color = fieldVal(rec, F.shirtColor);
    const size = fieldVal(rec, F.size);
    const itemName = `${design} / ${color} / ${size}`;
    const sku = `BAN-${orderNum}`;

    const row = [
      orderNum,
      fieldVal(rec, F.shipName),
      '',  // Company — not collected
      fieldVal(rec, F.shipStreet1),
      fieldVal(rec, F.shipStreet2),
      fieldVal(rec, F.shipCity),
      fieldVal(rec, F.shipState),
      fieldVal(rec, F.shipZip),
      'US',
      '',  // Phone — not on fulfillment table
      fieldVal(rec, F.email),
      itemName,
      sku,
      '1',
      String(SHIRT_WEIGHT_OZ),
    ].map(escapeCSV).join(',');

    rows.push(row);
  }

  const csv = rows.join('\n');
  const filename = `pirateship-batch-${status}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
