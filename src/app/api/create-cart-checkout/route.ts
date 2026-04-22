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
  flagship: { name: 'The Flagship' },
  'thank-you': { name: 'Thank you.' },
  'do-not-fear': { name: 'Do Not Fear.' },
  peacemaker: { name: 'Peacemaker.' },
  'everything-hallelujah': { name: 'Everything Hallelujah.' },
  nigeria: { name: 'Nigeria.' },
};

const SHIRT_PRICE = 25;

const cartItemSchema = z.object({
  shirtId: z.enum(['flagship', 'thank-you', 'do-not-fear', 'peacemaker', 'everything-hallelujah', 'nigeria']),
  size: z.enum(['S', 'M', 'L', 'XL', '2XL']),
  color: z.enum(['Black', 'White', 'Grey', 'Pink', 'Yellow']),
  continueMonthly: z.boolean().optional().default(false),
});

const cartSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(10),
  email: z.string().email().optional().or(z.literal('')),
  name: z.string().max(255).optional().default(''),
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

    const { items, email, name } = parsed.data;
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    // Build Stripe line items — one per cart item, all payment mode.
    // Monthly sponsorship items are handled post-payment by the webhook
    // which creates subscriptions programmatically.
    const lineItems = items.map((item, index) => {
      const shirt = SHIRTS[item.shirtId]!;
      const monthlyLabel = item.continueMonthly ? ' + Monthly Sponsorship' : '';
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${shirt.name} / ${item.color} / ${item.size}${monthlyLabel}`,
            description: item.continueMonthly
              ? '$25 covers the shirt + month one. Monthly sponsorship ($25/mo) starts in 30 days.'
              : 'Be A Number heavyweight tee. Your shirt number connects you to a real child.',
          },
          unit_amount: SHIRT_PRICE * 100,
        },
        quantity: 1,
      };
    });

    // Encode per-item details into metadata so the webhook can process
    // each shirt individually (assign children, create subscriptions).
    // Stripe metadata values are strings, max 500 chars each, max 50 keys.
    // We serialize items as a compact JSON array under one key.
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

    const metadata: Record<string, string> = {
      order_type: 'cart',
      item_count: String(items.length),
      monthly_count: String(monthlyCount),
      items_json: JSON.stringify(itemsMeta),
      customer_name: name || '',
    };

    // Create a single payment-mode checkout session for ALL items.
    // If any items have monthly opt-in, we save the payment method
    // so the webhook can create subscriptions after payment.
    const sessionParams: Record<string, any> = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
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
    };

    // When any item has monthly sponsorship, save the payment method
    // so we can create subscriptions after the initial payment.
    if (hasMonthly) {
      sessionParams.payment_intent_data = {
        setup_future_usage: 'off_session',
        metadata,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('[Cart Checkout] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
