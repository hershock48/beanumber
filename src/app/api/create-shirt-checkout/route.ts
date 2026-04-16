import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

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
  flagship: { name: 'The Flagship' },
  'thank-you': { name: 'Thank you.' },
  'do-not-fear': { name: 'Do Not Fear.' },
  peacemaker: { name: 'Peacemaker.' },
  'everything-hallelujah': { name: 'Everything Hallelujah.' },
  nigeria: { name: 'Nigeria.' },
};

const VALID_SIZES = ['S', 'M', 'L', 'XL', '2XL'];
const VALID_COLORS = ['Black', 'White', 'Grey', 'Pink', 'Yellow'];
const SHIRT_PRICE = 25; // $25 per shirt (and per month when opted in)

export async function POST(request: NextRequest) {
  try {
    const stripe = await getStripe();
    const { shirtId, size, color, email, name, continueMonthly } = await request.json();
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    // Validate shirt
    const shirt = SHIRTS[shirtId];
    if (!shirt) {
      return NextResponse.json({ error: 'Invalid shirt selection.' }, { status: 400 });
    }

    // Validate size
    if (!size || !VALID_SIZES.includes(size)) {
      return NextResponse.json({ error: 'Please select a valid size.' }, { status: 400 });
    }

    // Validate color
    if (!color || !VALID_COLORS.includes(color)) {
      return NextResponse.json({ error: 'Please select a valid color.' }, { status: 400 });
    }

    // Normalize the opt-in to a strict boolean. Default false — the shirt
    // always works on its own and we never start a subscription by accident.
    const optIn = continueMonthly === true;
    const orderType = optIn ? 'shirt_plus_monthly' : 'shirt';

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
    };

    // --- One-time shirt purchase (default) ---------------------------------
    if (!optIn) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${shirt.name} / ${color} / ${size}`,
                description:
                  'Be A Number heavyweight tee. Your shirt number connects you to a real child. $25 covers the shirt and their first month of sponsorship.',
              },
              unit_amount: SHIRT_PRICE * 100,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
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
    // Single Stripe subscription from day one. The $25 today IS month one
    // (and funds the shirt as a thank-you). Month two onward is $25/month.
    //
    // Shirt metadata rides on both the session AND subscription so:
    //   - the webhook can find shirt specs on checkout.session.completed
    //   - the sponsor portal can show shirt info later by reading subscription metadata
    //
    // child_id is left empty here; the webhook backfills it after running
    // assignNextShirtChild() so the subscription is linked to the specific
    // child who got this shirt number.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${shirt.name} / ${color} / ${size} + Monthly Sponsorship`,
              description:
                "Your shirt plus ongoing $25/month sponsorship. Today's $25 covers month one and ships your shirt. Cancel anytime.",
            },
            unit_amount: SHIRT_PRICE * 100,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
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
