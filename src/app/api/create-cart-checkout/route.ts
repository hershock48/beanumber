import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Cart Checkout] STRIPE_SECRET_KEY is not set');
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
  email: z.string().email().optional().or(z.literal('')),
  name: z.string().max(255).optional().default(''),
  ref_code: z.string().max(50).optional().default(''),
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

    const { items, email, name, ref_code } = parsed.data;
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    // Per-item metadata for the webhook (so it can build Fulfillment
    // and (when monthly) Sponsorship rows).
    const itemsMeta = items.map((item, i) => ({
      i: i,
      s: item.shirtId,
      n: SHIRTS[item.shirtId]!.name,
      c: item.color,
      z: item.size,
      m: item.continueMonthly ? 1 : 0,
    }));

    const hasMonthly = items.some(i => i.continueMonthly);
    const monthlyCount = items.filter(i => i.continueMonthly).length;

    // Shipping: $5 flat rate, free on 3+ shirts OR any monthly sponsorship.
    const freeShipping = items.length >= 3 || hasMonthly;
    const shippingOptions = freeShipping
      ? [{ shipping_rate_data: { type: 'fixed_amount' as const, fixed_amount: { amount: 0, currency: 'usd' }, display_name: 'Free shipping' } }]
      : [{ shipping_rate_data: { type: 'fixed_amount' as const, fixed_amount: { amount: 500, currency: 'usd' }, display_name: 'Standard shipping (USPS)' } }];

    const metadata: Record<string, string> = {
      order_type: 'cart',
      item_count: String(items.length),
      monthly_count: String(monthlyCount),
      items_json: JSON.stringify(itemsMeta),
      customer_name: name || '',
      ...(ref_code ? { ref_code } : {}),
    };

    // Two shapes depending on whether the cart contains a monthly opt-in.
    //
    // 1) No monthly  → payment-mode session. Shirts charged once. Card
    //                  saved off-session via setup_future_usage so the
    //                  buyer can convert later from /[number] in one tap.
    //
    // 2) Any monthly → subscription-mode session. The +monthly shirts
    //                  become recurring $25/mo line items (month 1 paid
    //                  today, ships the shirt — same single-shirt model).
    //                  Shirt-only items in the same cart ride alongside
    //                  as one-time line_items in the same mode=subscription
    //                  session (Stripe permits one-time + recurring mixed
    //                  in Checkout subscription mode; one-time items hit
    //                  the first invoice only). Stripe creates the sub
    //                  itself during checkout — there is no fragile
    //                  post-payment subscriptions.create() call in the
    //                  webhook. June 2026 incident: four +monthly cart
    //                  buyers had no Stripe sub because that retroactive
    //                  call silently failed. This shape eliminates that
    //                  failure mode at the architecture level. See
    //                  docs/claude/known_gotchas.md.

    let session;
    if (hasMonthly) {
      const lineItems = items.map(item => {
        const shirt = SHIRTS[item.shirtId]!;
        if (item.continueMonthly) {
          return {
            price_data: {
              currency: 'usd' as const,
              product_data: {
                name: `${shirt.name} tee · ${item.size} + Monthly Sponsorship`,
                description:
                  "Your shirt plus ongoing $25/month sponsorship. Today's $25 ships your shirt and is month one. Cancel anytime.",
              },
              unit_amount: SHIRT_PRICE * 100,
              recurring: { interval: 'month' as const },
            },
            quantity: 1,
          };
        }
        return {
          price_data: {
            currency: 'usd' as const,
            product_data: {
              name: `${shirt.name} tee · ${item.size}`,
              description:
                'Be A Number heavyweight tee. Your shirt number connects you to a real child.',
            },
            unit_amount: SHIRT_PRICE * 100,
          },
          quantity: 1,
        };
      });

      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'link'],
        line_items: lineItems,
        shipping_options: shippingOptions,
        mode: 'subscription',
        success_url: `${origin}/shirts/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/shirts`,
        customer_email: email || undefined,
        shipping_address_collection: { allowed_countries: ['US'] },
        custom_fields: [
          {
            key: 'referral',
            label: { type: 'custom', custom: 'How did you hear about us?' },
            type: 'text',
            optional: true,
          },
        ],
        metadata,
        subscription_data: {
          description:
            monthlyCount === 1
              ? 'Be A Number monthly sponsorship'
              : `${monthlyCount}× Be A Number monthly sponsorship`,
          metadata,
        },
      });
    } else {
      // No monthly opt-in: payment-mode session. Save card off-session
      // for the post-purchase one-tap conversion (Memo §2).
      const lineItems = items.map(item => {
        const shirt = SHIRTS[item.shirtId]!;
        return {
          price_data: {
            currency: 'usd' as const,
            product_data: {
              name: `${shirt.name} tee · ${item.size}`,
              description:
                'Be A Number heavyweight tee. Your shirt number connects you to a real child.',
            },
            unit_amount: SHIRT_PRICE * 100,
          },
          quantity: 1,
        };
      });

      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'link'],
        line_items: lineItems,
        shipping_options: shippingOptions,
        mode: 'payment',
        customer_creation: 'always',
        payment_intent_data: {
          setup_future_usage: 'off_session',
          metadata,
        },
        success_url: `${origin}/shirts/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/shirts`,
        customer_email: email || undefined,
        shipping_address_collection: { allowed_countries: ['US'] },
        custom_fields: [
          {
            key: 'referral',
            label: { type: 'custom', custom: 'How did you hear about us?' },
            type: 'text',
            optional: true,
          },
        ],
        metadata,
      });
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('[Cart Checkout] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
