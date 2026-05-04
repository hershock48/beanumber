/**
 * Packing Slips — printable page, one slip per shirt order
 *
 * GET /api/admin/packing-slips?token=ADMIN_API_TOKEN
 *   status=pending  → Production=Pending (default — shirts being made)
 *   status=ready    → Production=Done AND Shipping=Not Shipped
 *   status=all      → every record
 *
 * Opens in browser → Ctrl+P → print. Slips are sorted by size so they
 * match the order Kevin works through the pile. Each slip has buyer name,
 * address, shirt spec, vinyl spec, child number, and order number.
 *
 * Auth: query param ?token= must match ADMIN_API_TOKEN env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';

const FULFILLMENT_TABLE_ID = 'tblkSZBRrMiHhT3MP';

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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(request: NextRequest) {
  const env = getEnv();

  // Auth via query param so Kevin can open this in a browser
  const token = request.nextUrl.searchParams.get('token');
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if ((!adminToken && !adminPassword) || (token !== adminToken && token !== adminPassword)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get('status') || 'not-shipped';

  // Build Airtable formula filter
  let formula = '';
  if (status === 'not-shipped') {
    // Default: everything that hasn't shipped yet — Kevin's production queue
    formula = `{Shipping}="Not Shipped"`;
  } else if (status === 'ready') {
    formula = `AND({Production}="Done",{Shipping}="Not Shipped")`;
  } else if (status === 'pending') {
    formula = `{Production}="Pending"`;
  }

  // Fetch records
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

  // Group by size for section headers
  let currentSize = '';
  const slipsHtml: string[] = [];

  for (const rec of allRecords) {
    const size = fieldVal(rec, F.size);
    const orderNum = fieldVal(rec, F.orderNum);
    const design = fieldVal(rec, F.design);
    const color = fieldVal(rec, F.shirtColor);
    const vinylFront = fieldVal(rec, F.vinylFront);
    const vinylBack = fieldVal(rec, F.vinylBack);
    const buyer = fieldVal(rec, F.buyer);
    const email = fieldVal(rec, F.email);
    const shipName = fieldVal(rec, F.shipName) || buyer;
    const street1 = fieldVal(rec, F.shipStreet1);
    const street2 = fieldVal(rec, F.shipStreet2);
    const city = fieldVal(rec, F.shipCity);
    const state = fieldVal(rec, F.shipState);
    const zip = fieldVal(rec, F.shipZip);
    const childName = fieldVal(rec, F.childName);

    // Size section header
    if (size !== currentSize) {
      currentSize = size;
      slipsHtml.push(`<div class="size-header">SIZE: ${esc(size)}</div>`);
    }

    const addressLine2 = street2 ? `<div>${esc(street2)}</div>` : '';
    const hasAddress = street1 && city && state;
    const addressBlock = hasAddress
      ? `<div class="address">
           <div>${esc(shipName)}</div>
           <div>${esc(street1)}</div>
           ${addressLine2}
           <div>${esc(city)}, ${esc(state)} ${esc(zip)}</div>
         </div>`
      : `<div class="address missing">ADDRESS INCOMPLETE — contact ${esc(buyer)} (${esc(email)})</div>`;

    slipsHtml.push(`
      <div class="slip">
        <div class="slip-top">
          <div class="order-num">#${esc(orderNum)}</div>
          <div class="child-name">${esc(childName)}</div>
        </div>
        <div class="slip-body">
          <div class="shirt-spec">
            <div class="design">${esc(design)}</div>
            <div class="details">${esc(color)} · ${esc(size)} · Vinyl: ${esc(vinylFront)}/${esc(vinylBack)}</div>
          </div>
          ${addressBlock}
        </div>
        <div class="slip-footer">
          <div class="buyer-info">${esc(buyer)} · ${esc(email)}</div>
        </div>
      </div>
    `);
  }

  const statusLabel = status === 'pending' ? 'Pending Production' : status === 'ready' ? 'Ready to Ship' : 'All Orders';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Packing Slips — ${statusLabel} — ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #0d0d0d;
      background: #f5f5f5;
      padding: 20px;
    }

    .header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 2px solid #D4A843;
    }
    .header h1 { font-size: 18px; font-weight: 600; }
    .header .meta { font-size: 12px; color: #777; margin-top: 4px; }

    .size-header {
      background: #0d0d0d;
      color: white;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.15em;
      padding: 6px 12px;
      margin: 20px 0 8px 0;
      break-after: avoid;
    }

    .slip {
      border: 1px solid #ccc;
      border-left: 4px solid #D4A843;
      padding: 12px 16px;
      margin-bottom: 6px;
      background: white;
      page-break-inside: avoid;
    }

    .slip-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e8e0d4;
    }

    .order-num {
      font-size: 20px;
      font-weight: 700;
    }

    .child-name {
      font-size: 13px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .slip-body {
      display: flex;
      justify-content: space-between;
      gap: 24px;
    }

    .shirt-spec { flex: 1; }
    .design { font-size: 15px; font-weight: 600; }
    .details { font-size: 12px; color: #555; margin-top: 2px; }

    .address { font-size: 13px; line-height: 1.4; text-align: right; }
    .address.missing { color: #c00; font-weight: 600; font-size: 12px; text-align: right; max-width: 280px; }

    .slip-footer {
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dotted #ddd;
    }
    .buyer-info { font-size: 11px; color: #999; }

    /* Print styles */
    @media print {
      body { background: white; padding: 0; margin: 0; }
      .header { margin-bottom: 12px; }
      .no-print { display: none !important; }
      .slip { border: 1px solid #999; margin-bottom: 4px; }
      .size-header { margin: 12px 0 4px 0; }
    }

    .toolbar {
      position: fixed;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 8px;
      z-index: 100;
    }
    .toolbar button {
      background: #0d0d0d;
      color: white;
      border: none;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
    }
    .toolbar button:hover { background: #333; }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Print</button>
  </div>

  <div class="header">
    <h1>BE A NUMBER — Packing Slips</h1>
    <div class="meta">${esc(statusLabel)} · ${allRecords.length} orders · ${esc(dateStr)}</div>
  </div>

  ${slipsHtml.join('\n')}

</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
