/**
 * Fulfillment CSV Export — Pirate Ship batch import format
 *
 * GET /api/admin/fulfillment-csv?status=ready
 *   status=ready   → Production=Done AND Shipping=Not Shipped (default)
 *   status=all     → every row
 *   status=pending → Production=Pending
 *
 * Returns a CSV file uploadable to Pirate Ship's Import Spreadsheet.
 *
 * Requires admin auth (X-Admin-Token or ?token=).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { fulfillments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

// Average shirt weight in ounces (6 oz cotton tee + vinyl + poly mailer)
const SHIRT_WEIGHT_OZ = 8;

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET(request: NextRequest) {
  const queryToken = request.nextUrl.searchParams.get('token');
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (queryToken && ((adminToken && queryToken === adminToken) || (adminPassword && queryToken === adminPassword))) {
    // Authenticated via query param.
  } else {
    requireAdminAuth(request);
  }

  const status = request.nextUrl.searchParams.get('status') || 'ready';

  // Apply the status filter directly in Postgres.
  const where =
    status === 'ready'
      ? and(eq(fulfillments.production, 'Done'), eq(fulfillments.shipping, 'Not Shipped'))
      : status === 'pending'
        ? eq(fulfillments.production, 'Pending')
        : undefined;

  const rows = where
    ? await db.select().from(fulfillments).where(where)
    : await db.select().from(fulfillments);

  // Sort by Order # ascending.
  rows.sort((a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0));

  // Group records by shipping address so multiple shirts to the same
  // person produce ONE shipping label.
  const grouped = new Map<string, typeof rows>();
  for (const rec of rows) {
    const key = [
      rec.shipName || '',
      rec.shipStreet1 || '',
      rec.shipZip || '',
    ]
      .join('|')
      .toLowerCase();
    const group = grouped.get(key) || [];
    group.push(rec);
    grouped.set(key, group);
  }

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
  const out: string[] = [headers.map(escapeCSV).join(',')];

  for (const [, recs] of grouped) {
    const first = recs[0];
    const orderNums = recs.map(r => String(r.orderNumber ?? ''));
    const items = recs.map(
      r => `${r.design || ''} / ${r.shirtColor || ''} / ${r.size || ''}`
    );
    const skus = orderNums.map(n => `BAN-${n}`);
    const totalWeight = recs.length * SHIRT_WEIGHT_OZ;

    const row = [
      orderNums.join('+'),
      first.shipName || '',
      '',
      first.shipStreet1 || '',
      first.shipStreet2 || '',
      first.shipCity || '',
      first.shipState || '',
      first.shipZip || '',
      'US',
      '',
      first.buyerEmail || '',
      items.join(' + '),
      skus.join('+'),
      String(recs.length),
      String(totalWeight),
    ]
      .map(escapeCSV)
      .join(',');
    out.push(row);
  }

  const csv = out.join('\n');
  const filename = `pirateship-batch-${status}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
