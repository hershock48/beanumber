/**
 * Packing Slips — printable page, one slip per shirt order
 *
 * GET /api/admin/packing-slips?token=ADMIN_API_TOKEN
 *   status=not-shipped (default — Kevin's production queue)
 *   status=ready       → Production=Done AND Shipping=Not Shipped
 *   status=pending     → Production=Pending
 *   status=all         → every row
 *
 * Opens in browser → Ctrl+P → print. Sorted by size so slips match
 * the order Kevin works through the pile.
 *
 * Auth: ?token=.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { fulfillments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

// Size sort order — Youth first (smallest bodies), then Adult small→big.
// Keys MUST match what's actually stored in fulfillments.size: full
// strings like "Youth S", not short codes. Short codes here were a
// dev-time typo that would silently sort youth rows to the bottom.
const SIZE_ORDER: Record<string, number> = {
  'Youth S': 0, 'Youth M': 1, 'Youth L': 2, 'Youth XL': 3,
  S: 4, M: 5, L: 6, XL: 7, '2XL': 8, '3XL': 9, '4XL': 10,
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if ((!adminToken && !adminPassword) || (token !== adminToken && token !== adminPassword)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get('status') || 'not-shipped';

  const where =
    status === 'not-shipped'
      ? eq(fulfillments.shipping, 'Not Shipped')
      : status === 'ready'
        ? and(eq(fulfillments.production, 'Done'), eq(fulfillments.shipping, 'Not Shipped'))
        : status === 'pending'
          ? eq(fulfillments.production, 'Pending')
          : undefined;

  const rows = where
    ? await db.select().from(fulfillments).where(where)
    : await db.select().from(fulfillments);

  rows.sort((a, b) => {
    const sa = SIZE_ORDER[a.size || ''] ?? 99;
    const sb = SIZE_ORDER[b.size || ''] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.orderNumber ?? 0) - (b.orderNumber ?? 0);
  });

  let currentSize = '';
  const slipsHtml: string[] = [];

  for (const rec of rows) {
    const size = rec.size || '';
    const orderNum = String(rec.orderNumber ?? '');
    const design = rec.design || '';
    const color = rec.shirtColor || '';
    const vinylFront = rec.vinylFront || '';
    const vinylBack = rec.vinylBack || '';
    const buyer = rec.buyerName || '';
    const email = rec.buyerEmail || '';
    const shipName = rec.shipName || buyer;
    const street1 = rec.shipStreet1 || '';
    const street2 = rec.shipStreet2 || '';
    const city = rec.shipCity || '';
    const state = rec.shipState || '';
    const zip = rec.shipZip || '';
    const childName = rec.childName || '';

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

  const statusLabel =
    status === 'pending'
      ? 'Pending Production'
      : status === 'ready'
        ? 'Ready to Ship'
        : status === 'all'
          ? 'All Orders'
          : 'Not Shipped';
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

    .order-num { font-size: 20px; font-weight: 700; }

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
    <div class="meta">${esc(statusLabel)} · ${rows.length} orders · ${esc(dateStr)}</div>
  </div>

  ${slipsHtml.join('\n')}

</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
