/**
 * Mark Shipped — batch-update unshipped fulfillment rows and kick off
 * drip emails.
 *
 * POST /api/admin/mark-shipped?token=ADMIN_API_TOKEN
 *
 * Finds every Fulfillment row where shipping='Not Shipped', marks
 * them shipped, then sets dripNextSend on each unique donor so the
 * nurture sequence begins 3 days after shipment.
 *
 * Kevin hits this URL after dropping packages at the post office.
 *
 * Auth: ?token= must match ADMIN_API_TOKEN or ADMIN_PASSWORD.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { fulfillments, donors } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

function isAuthed(request: NextRequest): boolean {
  const token = request.nextUrl.searchParams.get('token');
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminToken && !adminPassword) return false;
  return token === adminToken || (!!adminPassword && token === adminPassword);
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Fetch unshipped.
  const rows = await db
    .select()
    .from(fulfillments)
    .where(eq(fulfillments.shipping, 'Not Shipped'));

  if (rows.length === 0) {
    return NextResponse.json({
      message: 'No records to ship. Everything is already marked as shipped.',
      shipped: 0,
      dripsStarted: 0,
    });
  }

  // 2. Mark all as shipped.
  await db
    .update(fulfillments)
    .set({ shipping: 'Shipped', updatedAt: new Date() })
    .where(eq(fulfillments.shipping, 'Not Shipped'));

  // 3. Drip enrollment / nudge.
  const uniqueEmails = Array.from(
    new Set(
      rows
        .map(r => (r.buyerEmail || '').toLowerCase().trim())
        .filter(Boolean)
    )
  );
  const dripDate = new Date();
  dripDate.setUTCDate(dripDate.getUTCDate() + 3);
  const dripNextSend = dripDate.toISOString().slice(0, 10);

  const dripsStarted: string[] = [];
  const dripErrors: string[] = [];

  for (const email of uniqueEmails) {
    try {
      const donor = (
        await db
          .select()
          .from(donors)
          .where(sql`lower(${donors.email}) = ${email}`)
          .limit(1)
      )[0];
      if (!donor) {
        dripErrors.push(`${email}: no donor record found`);
        continue;
      }
      if (!donor.dripPipeline) continue; // nothing to drip
      if (donor.dripNextSend) continue; // mid-sequence, don't overwrite

      await db
        .update(donors)
        .set({ dripNextSend, updatedAt: new Date() })
        .where(eq(donors.id, donor.id));
      dripsStarted.push(email);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      dripErrors.push(`${email}: ${m.slice(0, 100)}`);
    }
  }

  const orderNums = rows.map(r => String(r.orderNumber ?? '')).filter(Boolean);

  return NextResponse.json({
    message: `Shipped ${rows.length} orders. Drip emails started for ${dripsStarted.length} buyers.`,
    shipped: rows.length,
    orderNumbers: orderNums,
    dripsStarted: dripsStarted.length,
    dripEmails: dripsStarted,
    dripNextSend,
    ...(dripErrors.length > 0 ? { dripErrors } : {}),
  });
}

// Also support GET so Kevin can bookmark it and just click.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      orderNumber: fulfillments.orderNumber,
    })
    .from(fulfillments)
    .where(eq(fulfillments.shipping, 'Not Shipped'));
  const orderNums = rows.map(r => String(r.orderNumber ?? '')).filter(Boolean);

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
    ${
      rows.length === 0
        ? '<p class="empty">No orders ready to ship. Everything is already marked as shipped.</p>'
        : `
    <div class="count">${rows.length}</div>
    <p>order${rows.length === 1 ? '' : 's'} ready to mark as shipped</p>
    <div class="orders">Orders: #${orderNums.join(', #')}</div>
    <button class="btn" id="shipBtn" onclick="markShipped()">
      Mark All as Shipped
    </button>
    <div class="note">This marks them as Shipped and starts the drip email countdown (3 days).</div>
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
    `
    }
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
