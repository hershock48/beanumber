import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  canApplyPromoToCart,
  discountedAmountCents,
} from '@/lib/promo-codes';

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
  // Promo code is validated server-side against the SAME helper the
  // cart context uses, so an out-of-date client cart can&rsquo;t bypass
  // the shirt-only rule. Trimmed + uppercased before validation.
  promo_code: z.string().max(50).optional().default(''),
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

    const { items, email, name, ref_code, promo_code } = parsed.data;
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    const hasMonthlyForPromo = items.some(i => i.continueMonthly);
    // Server-side promo validation. Mirrors the cart context: if the
    // raw code is set, run it through canApplyPromoToCart against the
    // current cart shape. The result drives both the discounted
    // unit_amount on shirt line items AND a metadata breadcrumb so we
    // can audit redemptions later. Rejection is silent here — the
    // server keeps the cart total at full price and the client&rsquo;s
    // inline reason banner already told the user why. We don&rsquo;t hard-
    // error because that would block a checkout the cart context is
    // already showing at full price; the user already agreed to it.
    const promoResult = promo_code
      ? canApplyPromoToCart(promo_code, { hasMonthly: hasMonthlyForPromo })
      : null;
    const appliedPromo =
      promoResult && promoResult.ok ? promoResult.code : null;
    /**
     * unit_amount in cents for a shirt line item. With an applied
     * promo, the cents are reduced; otherwise full price. Stripe
     * wants integer cents.
     */
    const shirtUnitAmount = appliedPromo
      ? discountedAmountCents(SHIRT_PRICE * 100, appliedPromo.percentOff)
      : SHIRT_PRICE * 100;

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
      // Audit trail for the redemption: what code was applied, how
      // much came off. Helps Kevin reconcile FB-comment-driven
      // checkouts later without re-pulling Stripe.
      ...(appliedPromo
        ? {
            promo_code: appliedPromo.code,
            promo_percent_off: String(appliedPromo.percentOff),
          }
        : {}),
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
          // Recurring line items are deliberately never discounted —
          // the promo system rejects shirt-only codes the moment any
          // item is monthly. The full SHIRT_PRICE here is the
          // belt-and-suspenders defense in case a future promo with
          // appliesTo='any-shirt' ships and someone forgets that
          // recurring is still off-limits.
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
            unit_amount: shirtUnitAmount,
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
      // for the post-purchase one-tap conversion (Memo §2). All line
      // items are one-time shirts so the promo discount (if applied)
      // hits every one of them at the discounted shirtUnitAmount.
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
            unit_amount: shirtUnitAmount,
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
