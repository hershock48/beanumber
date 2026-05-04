/**
 * Mark Shipped — batch-update fulfillment records and kick off drip emails
 *
 * POST /api/admin/mark-shipped?token=ADMIN_API_TOKEN
 *
 * Finds all Fulfillment records where Shipping=Not Shipped,
 * marks them as Shipped, then sets DripNextSend on each unique donor so the
 * drip nurture sequence begins 3 days after shipment (not purchase).
 *
 * Kevin hits this URL after dropping packages at the post office.
 *
 * Auth: query param ?token= must match ADMIN_API_TOKEN env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';

const FULFILLMENT_TABLE_ID = 'tblkSZBRrMiHhT3MP';
const DONORS_TABLE_ID = 'tblhuLpJgYLB0pTjx';

const F = {
  orderNum:    'fldsUZIXLFesyzg8u',
  email:       'fldUakXkAhW2hYLxL',
  buyer:       'fldbGofwASSXDYj9R',
  production:  'fldbBZtOLYVVDS28X',
  shipping:    'fldJ6ehpDkpindHtO',
  tracking:    'flddun1GJzynbK9MU',
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

  // Auth via query param (browser-friendly)
  const token = request.nextUrl.searchParams.get('token');
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if ((!adminToken && !adminPassword) || (token !== adminToken && token !== adminPassword)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const headers = {
    Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // 1. Fetch all Fulfillment records that are ready to ship
  const formula = `{Shipping}="Not Shipped"`;
  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set('filterByFormula', formula);
    params.set('pageSize', '100');
    params.set('returnFieldsByFieldId', 'true');
    if (offset) params.set('offset', offset);

    const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${FULFILLMENT_TABLE_ID}?${params}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'Airtable fetch failed', detail: err }, { status: 502 });
    }

    const data = await res.json();
    allRecords.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  if (allRecords.length === 0) {
    return NextResponse.json({
      message: 'No records to ship. Everything is already marked as shipped.',
      shipped: 0,
      dripsStarted: 0,
    });
  }

  // 2. Mark all as Shipped (Airtable allows max 10 records per PATCH)
  const shippedIds: string[] = [];
  for (let i = 0; i < allRecords.length; i += 10) {
    const batch = allRecords.slice(i, i + 10);
    const patchRes = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${FULFILLMENT_TABLE_ID}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          records: batch.map(rec => ({
            id: rec.id,
            fields: { [F.shipping]: 'Shipped' },
          })),
          returnFieldsByFieldId: true,
        }),
      }
    );

    if (!patchRes.ok) {
      const err = await patchRes.text();
      return NextResponse.json({
        error: 'Failed to update Fulfillment records',
        detail: err,
        shippedSoFar: shippedIds.length,
      }, { status: 502 });
    }

    shippedIds.push(...batch.map(r => r.id));
  }

  // 3. Collect unique buyer emails from shipped records
  const uniqueEmails = new Set<string>();
  for (const rec of allRecords) {
    const email = fieldVal(rec, F.email).toLowerCase().trim();
    if (email) uniqueEmails.add(email);
  }

  // 4. For each unique email, look up the donor and set DripNextSend
  const dripDate = new Date();
  dripDate.setUTCDate(dripDate.getUTCDate() + 3);
  const dripNextSend = dripDate.toISOString().split('T')[0];

  const dripsStarted: string[] = [];
  const dripErrors: string[] = [];

  for (const email of uniqueEmails) {
    try {
      // Find donor by email
      const lookupFormula = `LOWER({Email}) = "${email}"`;
      const lookupParams = new URLSearchParams();
      lookupParams.set('filterByFormula', lookupFormula);
      lookupParams.set('maxRecords', '1');
      lookupParams.set('fields[]', 'Email');
      lookupParams.append('fields[]', 'DripPipeline');
      lookupParams.append('fields[]', 'DripNextSend');

      const lookupRes = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${DONORS_TABLE_ID}?${lookupParams}`,
        { headers }
      );

      if (!lookupRes.ok) {
        dripErrors.push(`${email}: donor lookup failed`);
        continue;
      }

      const lookupData = await lookupRes.json();
      const donor = lookupData.records?.[0];

      if (!donor) {
        dripErrors.push(`${email}: no donor record found`);
        continue;
      }

      // Only set DripNextSend if they're in a shirt pipeline and don't already
      // have a DripNextSend (avoids re-triggering for repeat shipments)
      const pipeline = donor.fields?.DripPipeline || '';
      const existingNextSend = donor.fields?.DripNextSend || '';

      if (!pipeline) {
        // No drip pipeline — nothing to start
        continue;
      }

      if (existingNextSend) {
        // Already has a send date — don't overwrite (could be mid-sequence)
        continue;
      }

      // Set DripNextSend to 3 days from now
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

      if (updateRes.ok) {
        dripsStarted.push(email);
      } else {
        dripErrors.push(`${email}: drip update failed`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dripErrors.push(`${email}: ${msg.slice(0, 100)}`);
    }
  }

  // 5. Build order summary for Kevin
  const orderNums = allRecords.map(r => fieldVal(r, F.orderNum)).filter(Boolean);

  return NextResponse.json({
    message: `Shipped ${shippedIds.length} orders. Drip emails started for ${dripsStarted.length} buyers.`,
    shipped: shippedIds.length,
    orderNumbers: orderNums,
    dripsStarted: dripsStarted.length,
    dripEmails: dripsStarted,
    dripNextSend,
    ...(dripErrors.length > 0 ? { dripErrors } : {}),
  });
}

// Also support GET so Kevin can bookmark it and just click
export async function GET(request: NextRequest) {
  const env = getEnv();

  const token = request.nextUrl.searchParams.get('token');
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if ((!adminToken && !adminPassword) || (token !== adminToken && token !== adminPassword)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Show a confirmation page instead of firing immediately on GET
  const formula = `{Shipping}="Not Shipped"`;
  const params = new URLSearchParams();
  params.set('filterByFormula', formula);
  params.set('pageSize', '100');
  params.set('returnFieldsByFieldId', 'true');

  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${FULFILLMENT_TABLE_ID}?${params}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Airtable fetch failed' }, { status: 502 });
  }

  const data = await res.json();
  const records = (data.records || []) as AirtableRecord[];
  const orderNums = records.map((r: AirtableRecord) => fieldVal(r, F.orderNum)).filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Mark Shipped — BE A NUMBER</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      color: #0d0d0d;
      display: flex;
      justify-content: center;
      padding: 60px 20px;
    }
    .card {
      background: white;
      border-radius: 8px;
      border-left: 4px solid #D4A843;
      padding: 32px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    h1 { font-size: 20px; margin-bottom: 8px; }
    .count { font-size: 48px; font-weight: 700; color: #D4A843; margin: 16px 0; }
    .orders { font-size: 14px; color: #777; margin-bottom: 24px; line-height: 1.6; }
    .btn {
      display: inline-block;
      background: #0d0d0d;
      color: white;
      border: none;
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      width: 100%;
      text-align: center;
    }
    .btn:hover { background: #333; }
    .btn:disabled { background: #999; cursor: not-allowed; }
    .note { font-size: 12px; color: #999; margin-top: 16px; text-align: center; }
    .result { margin-top: 20px; padding: 16px; background: #f0fdf4; border-radius: 6px; font-size: 14px; display: none; }
    .result.error { background: #fef2f2; }
    .empty { color: #999; font-style: italic; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Mark Shipped</h1>
    ${records.length === 0
      ? '<p class="empty">No orders ready to ship. Everything is already marked as shipped.</p>'
      : `
    <div class="count">${records.length}</div>
    <p>order${records.length === 1 ? '' : 's'} ready to mark as shipped</p>
    <div class="orders">Orders: #${orderNums.join(', #')}</div>
    <button class="btn" id="shipBtn" onclick="markShipped()">
      Mark All as Shipped
    </button>
    <div class="note">This marks them as Shipped in Airtable and starts the drip email countdown (3 days).</div>
    <div class="result" id="result"></div>
    <script>
      async function markShipped() {
        const btn = document.getElementById('shipBtn');
        const result = document.getElementById('result');
        btn.disabled = true;
        btn.textContent = 'Shipping...';
        try {
          const res = await fetch(window.location.href, { method: 'POST' });
          const data = await res.json();
          result.style.display = 'block';
          if (res.ok) {
            result.className = 'result';
            result.innerHTML = '<strong>' + data.message + '</strong>';
            btn.textContent = 'Done';
          } else {
            result.className = 'result error';
            result.textContent = data.error || 'Something went wrong';
            btn.textContent = 'Try Again';
            btn.disabled = false;
          }
        } catch (err) {
          result.style.display = 'block';
          result.className = 'result error';
          result.textContent = 'Network error: ' + err.message;
          btn.textContent = 'Try Again';
          btn.disabled = false;
        }
      }
    </script>
    `}
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
