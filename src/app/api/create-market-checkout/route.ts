/**
 * Market checkout — in-person sales at a farmers market booth.
 *
 * Mirrors /api/create-shirt-checkout (single shirt) except:
 *   - NO shipping_address_collection in either branch (buyer walks away
 *     with the shirt)
 *   - NO shipping_options on the payment-mode branch (no $5 USPS)
 *   - order_type metadata is 'shirt' / 'shirt_plus_monthly' (aliased so
 *     the existing webhook handlers fire unmodified); the sold_in_person
 *     and sold_at flags carry the market-sale signal alongside
 *   - success_url routes to /market/success
 *
 * Two branches like /api/create-shirt-checkout:
 *   1. continueMonthly = false  → mode='payment', one $25 shirt line item
 *   2. continueMonthly = true   → mode='subscription', shirt today + $25/mo
 *      starting in 30 days (trial_period_days: 30)
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

// Adult run S–2XL plus the July 2026 youth run.
const VALID_SIZES = ['S', 'M', 'L', 'XL', '2XL', 'Youth S', 'Youth M', 'Youth L'] as const;
const VALID_COLORS = ['Onyx', 'Meadow', 'Blossom', 'Sky'] as const;
const SHIRT_PRICE = 25;

export async function POST(request: NextRequest) {
  try {
    const stripe = await getStripe();

    const body = await request.json().catch(() => ({}));
    const {
      shirtId,
      size,
      color,
      continueMonthly: continueMonthlyRaw,
    } = body as {
      shirtId?: string;
      size?: string;
      color?: string;
      continueMonthly?: boolean;
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
    const continueMonthly = continueMonthlyRaw === true;

    // order_type is aliased so the existing webhook switches (which check
    // for the exact strings 'shirt' / 'shirt_plus_monthly') fire unmodified.
    // The sold_in_person / sold_at flags carry the market-sale signal for
    // the webhook + drip cron to branch on. See webhooks/stripe/route.ts
    // ~L2576 (shirt-only drip enrollment) for where sold_in_person gets read.
    const orderType = continueMonthly ? 'shirt_plus_monthly' : 'shirt';

    const metadata: Record<string, string> = {
      order_type: orderType,
      shirt_id: shirtId,
      shirt_name: shirt.name,
      shirt_color: color,
      shirt_size: size,
      continue_monthly: continueMonthly ? 'true' : 'false',
      sold_in_person: 'true',
      sold_at: 'farmers_market',
    };

    // ── Branch 1: shirt only, payment mode ────────────────────────
    if (!continueMonthly) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'link'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${shirt.name} tee · ${size}`,
                description:
                  'The shirt is how you meet them. Open the bag, find the number, look it up, meet your kid.',
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
        // NO shipping_address_collection — buyer is at the booth
        metadata,
      });
      return NextResponse.json({ sessionId: session.id, url: session.url });
    }

    // ── Branch 2: shirt + monthly, subscription mode ─────────────
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${shirt.name} tee · ${size}`,
              description:
                'The shirt is how you meet them. Open the bag, find the number, look it up, meet your kid.',
            },
            unit_amount: SHIRT_PRICE * 100,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Monthly Sponsorship',
              description:
                "$25 a month is how you stay. Letters, photos, report cards from the kid behind your number. First charge 30 days from today. Cancel anytime.",
            },
            unit_amount: SHIRT_PRICE * 100,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      // NO shipping_address_collection — buyer is at the booth.
      // Stripe Checkout collects the billing address natively when card
      // entry is required for a subscription; that's enough for AVS.
      success_url: `${origin}/market/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/market`,
      metadata,
      subscription_data: {
        description: `Monthly sponsorship started in person at the market with ${shirt.name} (${color}, ${size}).`,
        trial_period_days: 30,
        metadata,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout failed.';
    console.error('[Market Checkout] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
