/**
 * Submit a fulfillment row to Printful.
 *
 * Called by the Stripe webhook right after it inserts a fulfillment
 * row for a Printful product, and by the admin retry route. Everything
 * it needs is on the row: product, color, size, recipient. It assigns
 * the shirt number (once), builds the two print-file URLs, posts the
 * order, and writes Printful's order id and status back.
 *
 * Failure is never fatal to the caller. The row keeps shipping =
 * 'Not Shipped' with printful_status = 'failed' and last_error set, it
 * shows in the admin Printful tab with a Retry button, and Kevin gets
 * the alert email. Stripe already has the money; nothing is lost.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { fulfillments } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email';
import { getProduct, getProductColor, printfulVariantId } from '@/lib/products';
import { assignNumberToFulfillment } from '@/lib/shirt-numbers';
import { backPlacementUrl, frontPlacementUrl } from './print-files';
import {
  createOrder,
  isPrintfulConfigured,
  printfulAutoConfirm,
  type PrintfulOrderInput,
} from './client';

export interface SubmitResult {
  ok: boolean;
  fulfillmentId: string;
  shirtNumber?: number;
  printfulOrderId?: string;
  status?: string;
  error?: string;
}

/** What the buyer reads on the packing slip. Kept short; it prints small. */
const PACKING_SLIP_MESSAGE =
  'Look at the back. That number belongs to a real child at our campus in Northern Uganda. Go to beanumber.org, type it in, and meet them.';

export async function submitPrintfulOrder(fulfillmentId: string): Promise<SubmitResult> {
  const rows = await db.select().from(fulfillments).where(eq(fulfillments.id, fulfillmentId)).limit(1);
  const row = rows[0];
  if (!row) return { ok: false, fulfillmentId, error: 'Fulfillment row not found' };
  if (row.fulfillmentSource !== 'printful') {
    return { ok: false, fulfillmentId, error: 'Not a Printful row' };
  }
  if (row.printfulOrderId) {
    return { ok: true, fulfillmentId, printfulOrderId: row.printfulOrderId, status: row.printfulStatus || undefined, shirtNumber: row.orderNumber ?? undefined };
  }

  try {
    if (!isPrintfulConfigured()) throw new Error('PRINTFUL_API_KEY is not set');

    const product = row.productId ? getProduct(row.productId) : null;
    if (!product || product.fulfillment !== 'printful') {
      throw new Error(`Unknown Printful product on row: ${row.productId ?? '(none)'}`);
    }
    const color = getProductColor(product, row.shirtColor || '');
    if (!color) throw new Error(`Color "${row.shirtColor}" is not on product ${product.id}`);
    const variantId = printfulVariantId(product, color.name, row.size || '');
    if (!variantId) throw new Error(`No Printful variant for ${product.id} / ${color.name} / ${row.size}`);
    if (!row.shipStreet1 || !row.shipCity || !row.shipState || !row.shipZip) {
      throw new Error('Shipping address is incomplete on the row');
    }

    // The number goes on the file, so it is assigned before the order.
    const shirtNumber = await assignNumberToFulfillment(fulfillmentId);

    const input: PrintfulOrderInput = {
      external_id: fulfillmentId,
      shipping: 'STANDARD',
      recipient: {
        name: row.shipName || row.buyerName || 'Be A Number supporter',
        address1: row.shipStreet1,
        address2: row.shipStreet2 || undefined,
        city: row.shipCity,
        state_code: row.shipState,
        country_code: 'US',
        zip: row.shipZip,
        email: row.buyerEmail || undefined,
      },
      items: [
        {
          external_id: `${fulfillmentId}:0`,
          variant_id: variantId,
          quantity: 1,
          retail_price: product.price.toFixed(2),
          name: `Be A Number ${product.name} #${shirtNumber}`,
          files: [
            { type: 'front', url: frontPlacementUrl(color.ink) },
            { type: 'back', url: backPlacementUrl(shirtNumber, color.ink) },
          ],
        },
      ],
      retail_costs: { currency: 'USD', subtotal: product.price.toFixed(2) },
      packing_slip: {
        email: 'kevin@beanumber.org',
        message: PACKING_SLIP_MESSAGE,
        store_name: 'Be A Number',
        custom_order_id: `#${shirtNumber}`,
      },
    };

    const order = await createOrder(input, printfulAutoConfirm());

    await db
      .update(fulfillments)
      .set({
        printfulOrderId: String(order.id),
        printfulStatus: order.status,
        production: 'Printful',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(fulfillments.id, fulfillmentId));

    console.log(`[printful] order ${order.id} (${order.status}) for #${shirtNumber} ${product.id}/${color.name}/${row.size}`);
    return { ok: true, fulfillmentId, shirtNumber, printfulOrderId: String(order.id), status: order.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[printful] submit failed:', fulfillmentId, message.slice(0, 300));
    await db
      .update(fulfillments)
      .set({ printfulStatus: 'failed', lastError: message.slice(0, 1000), updatedAt: new Date() })
      .where(eq(fulfillments.id, fulfillmentId));
    await alertKevin(
      `[BAN] Printful order failed for ${row.buyerName || row.buyerEmail || 'a buyer'}`,
      `<p>A paid order for a Printful piece did not reach Printful. It is sitting in the admin Printful tab with a Retry button.</p>
       <p><strong>Buyer:</strong> ${esc(row.buyerName)} &lt;${esc(row.buyerEmail)}&gt;<br>
       <strong>Item:</strong> ${esc(row.productId)} / ${esc(row.shirtColor)} / ${esc(row.size)}<br>
       <strong>Error:</strong> <code>${esc(message.slice(0, 300))}</code></p>`
    );
    return { ok: false, fulfillmentId, error: message };
  }
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function alertKevin(subject: string, html: string): Promise<void> {
  try {
    await sendEmail({
      to: { email: process.env.KEVIN_ALERT_EMAIL || 'kevin@beanumber.org', name: 'Kevin' },
      subject,
      html,
    });
  } catch (e) {
    console.warn('[printful] alert email failed:', e instanceof Error ? e.message : e);
  }
}
