/**
 * POST /api/webhooks/printful?key=PRINTFUL_WEBHOOK_SECRET
 *
 * Printful calls this as an order moves. v1 webhooks are not signed,
 * so the shared secret rides in the URL; anything without it is 401.
 * Registered by POST /api/admin/printful/setup-webhook.
 *
 *   package_shipped   mark the row Shipped, store tracking, email the
 *                     buyer, start the drip clock at ship + 3 days
 *                     (same as the in-house ship button)
 *   order_failed, order_canceled, order_put_hold
 *                     record the status and alert Kevin
 *   order_remove_hold, order_updated
 *                     record the status
 *
 * Rows are found by Printful's order id first, then by external_id
 * (our fulfillment uuid). Always 200 once the secret checks out, so
 * Printful does not retry an event we simply do not recognise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { donors, fulfillments } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email';

interface PrintfulEvent {
  type: string;
  created?: number;
  data?: {
    order?: { id?: number; external_id?: string | null; status?: string };
    shipment?: {
      id?: number;
      carrier?: string;
      service?: string;
      tracking_number?: string;
      tracking_url?: string;
      ship_date?: string;
    };
    reason?: string;
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.PRINTFUL_WEBHOOK_SECRET;
  const key = request.nextUrl.searchParams.get('key');
  if (!secret || key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: PrintfulEvent;
  try {
    event = (await request.json()) as PrintfulEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const order = event.data?.order;
  const orderId = order?.id != null ? String(order.id) : null;
  const externalId = order?.external_id || null;
  console.log('[printful-webhook]', event.type, 'order', orderId, 'external', externalId);

  if (!orderId && !externalId) {
    return NextResponse.json({ received: true, ignored: 'no order on event' });
  }

  const conditions = [];
  if (orderId) conditions.push(eq(fulfillments.printfulOrderId, orderId));
  if (externalId && /^[0-9a-f-]{36}$/i.test(externalId)) conditions.push(eq(fulfillments.id, externalId));
  const rows = await db
    .select()
    .from(fulfillments)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1);
  const row = rows[0];
  if (!row) {
    console.warn('[printful-webhook] no fulfillment row for order', orderId, externalId);
    return NextResponse.json({ received: true, ignored: 'unknown order' });
  }

  try {
    switch (event.type) {
      case 'package_shipped': {
        const s = event.data?.shipment || {};
        await db
          .update(fulfillments)
          .set({
            shipping: 'Shipped',
            production: 'Printful',
            printfulStatus: order?.status || 'fulfilled',
            printfulOrderId: row.printfulOrderId || orderId,
            tracking: s.tracking_number || row.tracking,
            trackingUrl: s.tracking_url || row.trackingUrl,
            shippedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(fulfillments.id, row.id));
        await startDripClock(row.buyerEmail);
        await emailBuyerShipped(row.buyerEmail, row.buyerName, row.productId, s.tracking_url, s.carrier);
        break;
      }
      case 'order_failed':
      case 'order_canceled':
      case 'order_put_hold': {
        const status = event.type === 'order_failed' ? 'failed' : event.type === 'order_canceled' ? 'canceled' : 'onhold';
        const reason = event.data?.reason || '';
        await db
          .update(fulfillments)
          .set({ printfulStatus: status, lastError: reason || event.type, updatedAt: new Date() })
          .where(eq(fulfillments.id, row.id));
        await alertKevin(
          `[BAN] Printful order ${status}${row.orderNumber ? ` for #${row.orderNumber}` : ''}`,
          `<p>Printful reports <strong>${status}</strong> on the order for ${esc(row.buyerName)} &lt;${esc(row.buyerEmail)}&gt; (${esc(row.productId)} / ${esc(row.shirtColor)} / ${esc(row.size)}).</p>
           ${reason ? `<p><strong>Reason:</strong> ${esc(reason)}</p>` : ''}
           <p>Open it in the Printful dashboard: order ${esc(orderId)}. On hold usually means a print file or address problem.</p>`
        );
        break;
      }
      case 'order_remove_hold':
      case 'order_updated': {
        await db
          .update(fulfillments)
          .set({ printfulStatus: order?.status || row.printfulStatus, updatedAt: new Date() })
          .where(eq(fulfillments.id, row.id));
        break;
      }
      default:
        console.log('[printful-webhook] unhandled type', event.type);
    }
  } catch (err) {
    console.error('[printful-webhook] handler failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Same rule as the in-house ship button: drip starts 3 days after shipping. */
async function startDripClock(email: string | null): Promise<void> {
  const lowered = (email || '').toLowerCase().trim();
  if (!lowered) return;
  try {
    const donor = (
      await db.select().from(donors).where(sql`lower(${donors.email}) = ${lowered}`).limit(1)
    )[0];
    if (!donor) return;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 3);
    const patch: Record<string, unknown> = { dripNextSend: d.toISOString().slice(0, 10), updatedAt: new Date() };
    if (!donor.dripPipeline) {
      patch.dripPipeline = 'shirt_nurture';
      patch.dripStage = 0;
    } else if (donor.dripStage == null) {
      patch.dripStage = 0;
    }
    await db.update(donors).set(patch).where(eq(donors.id, donor.id));
  } catch (e) {
    console.warn('[printful-webhook] drip update failed:', e instanceof Error ? e.message : e);
  }
}

async function emailBuyerShipped(
  email: string | null,
  name: string | null,
  productId: string | null,
  trackingUrl: string | undefined,
  carrier: string | undefined
): Promise<void> {
  if (!email) return;
  const first = (name || 'there').trim().split(/\s+/)[0] || 'there';
  const piece = productId === 'hoodie' ? 'hoodie' : productId === 'long-sleeve' ? 'long sleeve' : 'order';
  const track = trackingUrl
    ? `<p style="margin: 24px 0;"><a href="${esc(trackingUrl)}" style="display: inline-block; background: #D4A843; color: #0d0d0d; padding: 14px 28px; font-weight: bold; text-decoration: none; font-size: 14px; letter-spacing: 0.05em;">Track the package</a></p>`
    : '';
  try {
    await sendEmail({
      to: { email, name: name || email },
      from: { email: process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org', name: 'Kevin at Be A Number' },
      subject: `Your ${piece} shipped.`,
      html: `
        <div style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
          <p style="margin-top: 0;">Hey ${esc(first)},</p>
          <p>Your ${piece} is on its way${carrier ? ` with ${esc(carrier)}` : ''}.</p>
          ${track}
          <p>When it arrives, look at the back. The number there belongs to a real child at the campus in Northern Uganda. Go to <a href="https://www.beanumber.org" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, type it in, and meet them.</p>
          <p>Thanks for being part of this,<br><strong>Kevin</strong></p>
          <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">
          <p style="font-size: 12px; color: #999; line-height: 1.5;">Be A Number, International<br><a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a></p>
        </div>`,
    });
  } catch (e) {
    console.warn('[printful-webhook] shipped email failed:', e instanceof Error ? e.message : e);
  }
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function alertKevin(subject: string, html: string): Promise<void> {
  try {
    await sendEmail({
      to: { email: process.env.KEVIN_ALERT_EMAIL || 'kevin@beanumber.org', name: 'Kevin' },
      subject,
      html,
    });
  } catch (e) {
    console.warn('[printful-webhook] alert email failed:', e instanceof Error ? e.message : e);
  }
}
