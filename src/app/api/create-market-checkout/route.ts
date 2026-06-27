/**
 * Market checkout — in-person sales at a farmers market booth.
 *
 * Mirrors /api/create-shirt-checkout (single shirt, no cart) except:
 *   - NO shipping_address_collection (buyer walks away with the shirt)
 *   - NO shipping_options (no $5 USPS line item)
 *   - order_type metadata = 'market' so the webhook + drip can branch later
 *   - success_url routes back to /market/success
 *
 * Same downstream contract as the standard shirt checkout:
 *   - Stripe Customer is created + payment method saved off_session for
 *     the one-tap "stay with [child]" CTA on /[N]
 *   - Stripe Checkout natively collects email + name; no form needed
 *   - The webhook fires checkout.session.completed and runs the standard
 *     post-purchase pipeline (drip, sponsor recovery, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Market Checkout] STRIPE_SECRET_KEY is not set');
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

const VALID_SIZES = ['S', 'M', 'L', 'XL', '2XL'] as const;
const VALID_COLORS = ['Onyx', 'Meadow', 'Blossom', 'Sky'] as const;
const SHIRT_PRICE = 25;

export async function POST(request: NextRequest) {
  try {
    const stripe = await getStripe();

    const body = await request.json().catch(() => ({}));
    const { shirtId, size, color } = body as {
      shirtId?: string;
      size?: string;
      color?: string;
    };

    if (!shirtId || !SHIRTS[shirtId]) {
      return NextResponse.json({ error: 'Invalid shirt design.' }, { status: 400 });
    }
    if (!size || !VALID_SIZES.includes(size as typeof VALID_SIZES[number])) {
      return NextResponse.json({ error: 'Invalid size.' }, { status: 400 });
    }
    if (!color || !VALID_COLORS.includes(color as typeof VALID_COLORS[number])) {
      return NextResponse.json({ error: 'Invalid color.' }, { status: 400 });
    }

    const shirt = SHIRTS[shirtId]!;
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    // IMPORTANT: order_type is aliased to 'shirt' so the existing webhook
    // path (src/app/api/webhooks/stripe/route.ts ~L1815) fires unmodified —
    // creates the donation record, enrolls in shirt_nurture drip, etc.
    // The webhook only branches on a fixed set of order_type values; adding
    // a new 'market' branch would require touching that webhook, which is
    // load-bearing and risky to change the night before a market.
    //
    // The sold_in_person/sold_at flags carry the market-sale signal in
    // metadata for any future routing (e.g. swap the day-0 drip copy from
    // "your shirt is in the mail" to "your shirt is in your hands"). They
    // are safe to add — the webhook ignores unknown metadata keys.
    const metadata: Record<string, string> = {
      order_type: 'shirt',
      shirt_id: shirtId,
      shirt_name: shirt.name,
      shirt_color: color,
      shirt_size: size,
      sold_in_person: 'true',
      sold_at: 'farmers_market',
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${shirt.name} tee · ${size}`,
              description:
                'The shirt is how you meet them. $25 a month is how you stay. Open the bag, find the number, look it up, meet your kid.',
            },
            unit_amount: SHIRT_PRICE * 100,
          },
          quantity: 1,
        },
      ],
      // NO shipping_options — in-person sale
      mode: 'payment',
      customer_creation: 'always',
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata,
      },
      success_url: `${origin}/market/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/market`,
      // NO shipping_address_collection — buyer is standing at the booth
      // Stripe Checkout natively collects email + name (always required by
      // the Stripe receipt + customer record)
      metadata,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout failed.';
    console.error('[Market Checkout] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
