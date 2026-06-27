/**
 * Market cart checkout — multi-shirt in-person sales at a market booth.
 *
 * Mirrors /api/create-cart-checkout exactly EXCEPT:
 *   - NO shipping_address_collection (buyer walks away with the shirts)
 *   - NO shipping_options (no $5 USPS line item)
 *   - sold_in_person + sold_at flags ride alongside the order_type='cart'
 *     metadata so the webhook can branch dripPipeline to the
 *     'shirt_nurture_inperson' variant for shirt-only carts.
 *   - success_url routes to /market/success
 *
 * The webhook's existing cart-branch handler reads items_json and creates
 * the same per-shirt records it would for an online cart. The only path
 * difference is the drip enrollment, which checks sold_in_person to pick
 * the right pipeline name.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Market Cart Checkout] STRIPE_SECRET_KEY is not set');
    throw new Error('Payment system configuration error. Please contact support.');
  }
  return new StripeModule(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
}

const SHIRTS: Record<string, { name: string }> = {
  onyx: { name: 'Onyx' },
  meadow: { name: 'Meadow' },
  blossom: { name: 'Blossom' },
  sky: { name: 'Sky' },
};

const SHIRT_PRICE = 25;

const cartItemSchema = z.object({
  shirtId: z.enum(['onyx', 'meadow', 'blossom', 'sky']),
  size: z.enum(['S', 'M', 'L', 'XL', '2XL']),
  color: z.enum(['Onyx', 'Meadow', 'Blossom', 'Sky']),
  continueMonthly: z.boolean().optional().default(false),
});

const cartSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(10),
});

export async function POST(request: NextRequest) {
  try {
    const stripe = await getStripe();

    const parsed = cartSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }

    const { items } = parsed.data;
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    // Per-item metadata for the webhook (so it can build Fulfillment rows
    // and per-monthly-item Sponsorships). Same shape the online cart uses.
    const itemsMeta = items.map((item, i) => ({
      i,
      s: item.shirtId,
      n: SHIRTS[item.shirtId]!.name,
      c: item.color,
      z: item.size,
      m: item.continueMonthly ? 1 : 0,
    }));

    const hasMonthly = items.some(i => i.continueMonthly);
    const monthlyCount = items.filter(i => i.continueMonthly).length;

    const metadata: Record<string, string> = {
      order_type: 'cart',
      item_count: String(items.length),
      monthly_count: String(monthlyCount),
      items_json: JSON.stringify(itemsMeta),
      // Market-sale signal. Read by the webhook to pick the right drip
      // pipeline (shirt_nurture_inperson for shirt-only carts) and is
      // available for any future analytics on in-person vs. online sales.
      sold_in_person: 'true',
      sold_at: 'farmers_market',
    };

    let session;

    if (hasMonthly) {
      // Subscription-mode session. Each +monthly item gets a shirt line
      // (one-time) plus a recurring sponsorship line. Shirts without
      // monthly are just a one-time line.
      const lineItems = items.flatMap(item => {
        const shirt = SHIRTS[item.shirtId]!;
        const shirtLine = {
          price_data: {
            currency: 'usd' as const,
            product_data: {
              name: `${shirt.name} tee · ${item.size}`,
              description:
                'The shirt is how you meet them. Open the bag, find the number, look it up, meet your kid.',
            },
            unit_amount: SHIRT_PRICE * 100,
          },
          quantity: 1,
        };
        if (!item.continueMonthly) return [shirtLine];
        const monthlyLine = {
          price_data: {
            currency: 'usd' as const,
            product_data: {
              name: 'Monthly Sponsorship',
              description:
                "$25 a month is how you stay. Letters, photos, report cards from the kid behind your number. First charge 30 days from today. Cancel anytime.",
            },
            unit_amount: SHIRT_PRICE * 100,
            recurring: { interval: 'month' as const },
          },
          quantity: 1,
        };
        return [shirtLine, monthlyLine];
      });

      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'link'],
        line_items: lineItems,
        mode: 'subscription',
        // NO shipping_address_collection — buyer is at the booth.
        // NO shipping_options — subscription mode anyway, and no shipping.
        success_url: `${origin}/market/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/market`,
        metadata,
        subscription_data: {
          description:
            monthlyCount === 1
              ? 'Be A Number monthly sponsorship (started in person)'
              : `${monthlyCount}× Be A Number monthly sponsorship (started in person)`,
          trial_period_days: 30,
          metadata,
        },
      });
    } else {
      // Payment-mode session — no monthly opt-ins. Save card off-session
      // so the buyer can convert to monthly from /[N] later in one tap.
      const lineItems = items.map(item => {
        const shirt = SHIRTS[item.shirtId]!;
        return {
          price_data: {
            currency: 'usd' as const,
            product_data: {
              name: `${shirt.name} tee · ${item.size}`,
              description:
                'The shirt is how you meet them. Open the bag, find the number, look it up, meet your kid.',
            },
            unit_amount: SHIRT_PRICE * 100,
          },
          quantity: 1,
        };
      });

      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'link'],
        line_items: lineItems,
        // NO shipping_options
        mode: 'payment',
        customer_creation: 'always',
        payment_intent_data: {
          setup_future_usage: 'off_session',
          metadata,
        },
        success_url: `${origin}/market/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/market`,
        // NO shipping_address_collection
        metadata,
      });
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout failed.';
    console.error('[Market Cart Checkout] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
