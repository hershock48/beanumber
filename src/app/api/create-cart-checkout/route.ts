import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  canApplyPromoToCart,
  discountedAmountCents,
} from '@/lib/promo-codes';
import { isFreeShippingWindowActive } from '@/lib/free-shipping-window';
import { getProduct, isValidSelection } from '@/lib/products';

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

// The monthly sponsorship line is always $25 whatever the garment cost.
const SHIRT_PRICE = 25;

// Products, colors, sizes and prices come from src/lib/products.ts; a
// line the catalog does not know is rejected below with a 400. Sizes
// are stored as literal strings ("Youth S") so display everywhere reads
// clean without a translation layer.
const cartItemSchema = z
  .object({
    shirtId: z.string().min(1).max(40),
    size: z.string().min(1).max(20),
    color: z.string().min(1).max(40),
    continueMonthly: z.boolean().optional().default(false),
  })
  .refine(item => isValidSelection(item.shirtId, item.color, item.size), {
    message: 'That product, color, or size is not available.',
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
     * unit_amount in cents for a line item: the catalog price, reduced
     * by the promo when one applies. Stripe wants integer cents.
     */
    const unitAmountFor = (productId: string): number => {
      const price = (getProduct(productId)?.price ?? SHIRT_PRICE) * 100;
      return appliedPromo ? discountedAmountCents(price, appliedPromo.percentOff) : price;
    };
    const lineName = (item: (typeof items)[number]): string => {
      const p = getProduct(item.shirtId);
      if (!p) return `${item.shirtId} · ${item.size}`;
      // Tees are one product per colorway ("Onyx tee · L"); seasonal
      // pieces name the garment and the color ("Hoodie · Navy · L").
      return p.colors.length === 1
        ? `${p.name} tee · ${item.size}`
        : `${p.name} · ${item.color} · ${item.size}`;
    };
    const lineDescription = (item: (typeof items)[number]): string => {
      const p = getProduct(item.shirtId);
      return p?.fulfillment === 'printful'
        ? 'Be A Number. Printed to order with a unique number that connects you to a real child.'
        : 'Be A Number heavyweight tee. Your shirt number connects you to a real child.';
    };

    // Per-item metadata for the webhook (so it can build Fulfillment
    // and (when monthly) Sponsorship rows).
    //
    // Compact shape — Stripe caps each metadata VALUE at 500 chars,
    // and this whole array serializes into one string. `n` (name) is
    // derivable from `s` (product id) on the webhook side, so it is
    // omitted. `c` (color) is sent only for products with more than
    // one color; the tees are one product per colorway. A 10-line
    // cart stays around 450 chars, under the cap.
    const itemsMeta = items.map((item, i) => {
      const p = getProduct(item.shirtId);
      return {
        i: i,
        s: item.shirtId,
        ...(p && p.colors.length > 1 ? { c: item.color } : {}),
        z: item.size,
        m: item.continueMonthly ? 1 : 0,
      };
    });

    const hasMonthly = items.some(i => i.continueMonthly);
    const monthlyCount = items.filter(i => i.continueMonthly).length;

    // Shipping: $5 flat rate, free on 3+ shirts OR any monthly sponsorship.
    // Free shipping applies if any of:
    //   - buyer has 3+ shirts in the cart (bulk-buyer perk)
    //   - buyer added monthly to at least one shirt (shirt+monthly always free)
    //   - the FREE_SHIPPING_UNTIL env-var window is currently active
    //     (site-wide temporary promo — see src/lib/free-shipping-window.ts)
    const freeShipping =
      items.length >= 3 || hasMonthly || isFreeShippingWindowActive();
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
    // 2) Any monthly → subscription-mode session. Each +monthly shirt
    //                  becomes TWO line items: a one-time shirt line
    //                  (charged today, $25, shipped) plus a recurring
    //                  $25/mo sponsorship line. The subscription gets
    //                  `trial_period_days: 30` so the first sponsorship
    //                  charge fires 30 days from checkout — the buyer
    //                  pays $25 today (for the shirt) and $25/mo from
    //                  day 30 onward. Same total over time as the old
    //                  &ldquo;today is month one&rdquo; framing, but Stripe can now
    //                  cleanly attach shipping to the one-time line
    //                  instead of trying (and failing) to attach it to
    //                  a recurring line with an inline product. The
    //                  failure mode this fixes: Ronna Whitaker reported
    //                  June 16, 2026 that Stripe Checkout pops a
    //                  shipping error mid-checkout for shirt+monthly
    //                  carts. Inline products via price_data default to
    //                  non-shippable, and Stripe rejects shipping on
    //                  a recurring item it can&rsquo;t verify is shippable.
    //                  Splitting the line items removes the ambiguity.

    let session;
    if (hasMonthly) {
      // Build flattened line items: one one-time shirt line per item,
      // plus one recurring sponsorship line per item.continueMonthly.
      // flatMap so a cart with mixed shirt-only + shirt+monthly stays
      // a clean array. Discounts (when applicable per the promo rules)
      // apply only to shirt one-time lines — never to recurring.
      const lineItems = items.flatMap(item => {
        const shirtLine = {
          price_data: {
            currency: 'usd' as const,
            product_data: {
              name: lineName(item),
              description: lineDescription(item),
            },
            unit_amount: unitAmountFor(item.shirtId),
          },
          quantity: 1,
        };
        if (!item.continueMonthly) {
          return [shirtLine];
        }
        // The recurring line is deliberately never discounted — even if
        // a future promo with appliesTo='any-shirt' ships, the monthly
        // is off-limits per Kevin&rsquo;s rule.
        const monthlyLine = {
          price_data: {
            currency: 'usd' as const,
            product_data: {
              name: 'Monthly Sponsorship',
              description:
                "$25/month keeps your kid in school, fed, and seen by a doctor. First monthly charge 30 days from today. Cancel anytime.",
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
        // shipping_options is intentionally NOT set on subscription-mode
        // sessions. Per Stripe&rsquo;s docs: &ldquo;Only Checkout Sessions in
        // payment mode support shipping options.&rdquo; This was the actual
        // cause of Ronna Whitaker&rsquo;s blocked checkout on June 16, 2026.
        // shirt+monthly carts get free shipping by policy anyway (the
        // freeShipping branch above), so the practical effect is zero:
        // no rate selection UI in checkout, address still collected for
        // fulfillment via shipping_address_collection below.
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
          // 30-day trial so the first sponsorship invoice lands a
          // month after the shirt ships. Today&rsquo;s $25 covers the
          // shirt; $25/mo recurring begins on day 30.
          trial_period_days: 30,
          metadata,
        },
      });
    } else {
      // No monthly opt-in: payment-mode session. Save card off-session
      // for the post-purchase one-tap conversion (Memo §2). All line
      // items are one-time shirts so the promo discount (if applied)
      // hits every one of them at the discounted shirtUnitAmount.
      const lineItems = items.map(item => {
        return {
          price_data: {
            currency: 'usd' as const,
            product_data: {
              name: lineName(item),
              description: lineDescription(item),
            },
            unit_amount: unitAmountFor(item.shirtId),
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
        // Stripe-native promotion codes (e.g. legacy-sponsor free-shirt codes).
        // Payment-mode only — matches the same flag on create-shirt-checkout.
        allow_promotion_codes: true,
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
