import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import {
  canApplyPromoToCart,
  discountedAmountCents,
} from '@/lib/promo-codes';
import { shippingOptionsWithWindow } from '@/lib/free-shipping-window';

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Shirt Checkout] STRIPE_SECRET_KEY is not set');
    throw new Error('Payment system configuration error. Please contact support.');
  }
  return new StripeModule(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
}

// Valid shirt definitions. Every design is printed on every color below, so
// `color` is now chosen by the buyer at checkout rather than baked into the
// design record.
const SHIRTS: Record<string, { name: string }> = {
  onyx: { name: 'Onyx' },
  meadow: { name: 'Meadow' },
  blossom: { name: 'Blossom' },
  sky: { name: 'Sky' },
};

// Adult run S–2XL plus the July 2026 youth run (stored as literal
// "Youth S" / "Youth M" / "Youth L" strings so display everywhere
// reads clean without a translation layer).
const VALID_SIZES = ['S', 'M', 'L', 'XL', '2XL', 'Youth S', 'Youth M', 'Youth L'];
const VALID_COLORS = ['Black', 'White', 'Grey', 'Pink', 'Yellow'];
const SHIRT_PRICE = 25; // $25 per shirt (and per month when opted in)

export async function POST(request: NextRequest) {
  try {
    const stripe = await getStripe();

    const shirtSchema = z.object({
      shirtId: z.enum(['onyx', 'meadow', 'blossom', 'sky']),
      size: z.enum(['S', 'M', 'L', 'XL', '2XL', 'Youth S', 'Youth M', 'Youth L']),
      color: z.enum(['Onyx', 'Meadow', 'Blossom', 'Sky']),
      email: z.string().email().optional().or(z.literal('')),
      name: z.string().max(255).optional().default(''),
      continueMonthly: z.boolean().optional().default(false),
      ref_code: z.string().max(50).optional().default(''),
      // Promo code is server-validated against the SAME helper the
      // cart context uses. Rejection (e.g. shirt-only code on a
      // shirt+monthly purchase) silently falls back to full price.
      promo_code: z.string().max(50).optional().default(''),
    });

    const parsed = shirtSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { shirtId, size, color, email, name, continueMonthly, ref_code, promo_code } = parsed.data;
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    const shirt = SHIRTS[shirtId]!;

    // Normalize the opt-in to a strict boolean. Default false — the shirt
    // always works on its own and we never start a subscription by accident.
    const optIn = continueMonthly === true;
    const orderType = optIn ? 'shirt_plus_monthly' : 'shirt';

    // Server-side promo validation. Same rule as cart endpoint —
    // shirt-only codes don&rsquo;t apply when the buyer is opting into
    // monthly, because we can&rsquo;t split a recurring line item into
    // &ldquo;shirt today&rdquo; + &ldquo;monthly forever.&rdquo; The cart context already
    // told the user this; here we just enforce.
    const promoResult = promo_code
      ? canApplyPromoToCart(promo_code, { hasMonthly: optIn })
      : null;
    const appliedPromo =
      promoResult && promoResult.ok ? promoResult.code : null;
    const shirtUnitAmount = appliedPromo
      ? discountedAmountCents(SHIRT_PRICE * 100, appliedPromo.percentOff)
      : SHIRT_PRICE * 100;

    // Shared metadata so the webhook can handle both variants the same way.
    // The webhook branches on `order_type` and will assign a child, then
    // backfill child_id onto the subscription's metadata (for the opt-in
    // path) once assignment lands.
    const sharedMetadata: Record<string, string> = {
      order_type: orderType,
      shirt_id: shirtId,
      shirt_name: shirt.name,
      shirt_color: color,
      shirt_size: size,
      customer_name: name || '',
      continue_monthly: optIn ? 'true' : 'false',
      ...(ref_code ? { ref_code } : {}),
      // Audit trail for promo redemption — what code, how much off.
      ...(appliedPromo
        ? {
            promo_code: appliedPromo.code,
            promo_percent_off: String(appliedPromo.percentOff),
          }
        : {}),
    };

    // --- One-time shirt purchase (default) ---------------------------------
    //
    // Even though this is a one-time payment, we ALWAYS create a Stripe
    // Customer and save the payment method off-session. This is the
    // Stripe object-model continuity that memo §2 depends on: when the
    // shirt arrives and the buyer comes to /[number] to meet their child,
    // the "Will you stay with [child]?" CTA can offer one-tap recurring
    // confirm via Stripe Link / Apple Pay / Google Pay against the saved
    // card. Without customer_creation:'always' + setup_future_usage:
    // 'off_session', the one-tap UI breaks and forces re-entry.
    if (!optIn) {
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
              unit_amount: shirtUnitAmount,
            },
            quantity: 1,
          },
        ],
        // Default $5 flat shipping; swapped for $0 if the
        // FREE_SHIPPING_UNTIL env-var window is currently active.
        shipping_options: shippingOptionsWithWindow([
          { shipping_rate_data: { type: 'fixed_amount' as const, fixed_amount: { amount: 500, currency: 'usd' }, display_name: 'Standard shipping (USPS)' } },
        ]),
        mode: 'payment',
        customer_creation: 'always',
        // Stripe-native promotion codes (e.g. legacy-sponsor free-shirt codes
        // created via /ops/legacy-shirt-promo). The inline promo_code system
        // in @/lib/promo-codes covers the shirt-price-only discounts (WIN10,
        // etc.); this flag turns on the "Add promotion code" field at
        // Stripe's checkout UI so customer-bound single-use codes managed in
        // Stripe can also be entered. Payment-mode only — subscription-mode
        // (shirt+monthly) intentionally omits it to avoid month-1 discounts
        // colliding with the fixed $25/mo product framing.
        allow_promotion_codes: true,
        payment_intent_data: {
          setup_future_usage: 'off_session',
          metadata: sharedMetadata,
        },
        success_url: `${origin}/shirts/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/shirts#${shirtId}`,
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
        metadata: sharedMetadata,
      });

      return NextResponse.json({ sessionId: session.id, url: session.url });
    }

    // --- Shirt + monthly sponsorship (opted in) ----------------------------
    //
    // Two line items in one subscription-mode session:
    //   1) one-time $25 shirt (charged today, ships)
    //   2) recurring $25/mo sponsorship with trial_period_days: 30 so
    //      the first sponsorship invoice lands 30 days after checkout
    //
    // The buyer pays $25 today (for the shirt) and $25/mo starting on
    // day 30. Same total over time as the previous &ldquo;today is month
    // one&rdquo; framing, but Stripe can now cleanly attach shipping to the
    // one-time line. The previous shape had a single recurring line
    // with an inline product (price_data.product_data, not a persistent
    // Product object) — Stripe treats inline products as non-shippable
    // by default and rejects shipping on a recurring line it can&rsquo;t
    // verify is shippable. That surfaced to Ronna Whitaker on
    // June 16, 2026 as a shipping error popup mid-checkout.
    //
    // Shirt metadata rides on both the session AND subscription so:
    //   - the webhook can find shirt specs on checkout.session.completed
    //   - the sponsor portal can show shirt info later by reading subscription metadata
    //
    // child_id is left empty here; the webhook backfills it after running
    // assignNextShirtChild() so the subscription is linked to the specific
    // child who got this shirt number.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      line_items: [
        // One-time shirt — charged today, ships.
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${shirt.name} tee · ${size}`,
              description:
                'The shirt is how you meet them. Hand screen-printed. Open the bag, find the number, meet your kid.',
            },
            unit_amount: shirtUnitAmount,
          },
          quantity: 1,
        },
        // Recurring sponsorship — first invoice 30 days from checkout
        // via subscription_data.trial_period_days below.
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Monthly Sponsorship',
              description:
                "$25 a month is how you stay. Letters, photos, report cards — for the kid behind your number. First charge 30 days from today. Cancel anytime.",
            },
            unit_amount: SHIRT_PRICE * 100,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      // shipping_options is intentionally NOT set on this
      // subscription-mode session. Per Stripe&rsquo;s docs: &ldquo;Only
      // Checkout Sessions in payment mode support shipping options.&rdquo;
      // This was the cause of Ronna Whitaker&rsquo;s blocked checkout on
      // June 16, 2026 — passing shipping_options in subscription
      // mode either fails at session-create or surfaces a shipping
      // error in Stripe&rsquo;s hosted checkout UI. Shirt+monthly buyers
      // get free shipping by policy; address still collected for
      // fulfillment via shipping_address_collection below.
      mode: 'subscription',
      success_url: `${origin}/shirts/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shirts#${shirtId}`,
      customer_email: email || undefined,
      shipping_address_collection: { allowed_countries: ['US'] },
      billing_address_collection: 'required',
      custom_fields: [
        {
          key: 'referral',
          label: { type: 'custom', custom: 'How did you hear about us?' },
          type: 'text',
          optional: true,
        },
      ],
      metadata: sharedMetadata,
      subscription_data: {
        description: `Monthly sponsorship started with ${shirt.name} (${color}, ${size}).`,
        // 30-day trial so the recurring $25/mo first charges on day 30,
        // not today. Today's $25 is the shirt one-time line above.
        trial_period_days: 30,
        metadata: {
          ...sharedMetadata,
          // referring_shirt_session_id, child_id, child_record_id,
          // child_display_name are backfilled by the webhook once the checkout
          // session id is known and the next child is assigned. Stripe does
          // not substitute {CHECKOUT_SESSION_ID} in metadata (only in URLs),
          // so we cannot set it here at session-create time.
        },
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('[Shirt Checkout] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
