/**
 * Christmas gift checkout.
 *
 * One-time payment into the pooled Christmas fund (src/lib/christmas.ts).
 * The kid whose page the giver was on rides along in metadata so the
 * receipt and Kevin's notification can say "from #14's page", but the
 * money is not restricted to that kid. The webhook records it as a
 * plain one-time donation with source 'Christmas {year}'.
 *
 * Amount is one of CHRISTMAS.amounts, picked server-side from the
 * client's choice, so nobody can post their own price.
 */
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { CHRISTMAS, christmasIsOpen, kidsForAmount } from '@/lib/christmas';

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Christmas Checkout] STRIPE_SECRET_KEY is not set');
    throw new Error('Payment system configuration error. Please contact support.');
  }
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
}

const schema = z.object({
  amount: z.number().int(),
  shirtNumber: z.number().int().positive().optional(),
  childFirstName: z.string().max(80).optional().default(''),
});

export async function POST(request: NextRequest) {
  try {
    if (!christmasIsOpen()) {
      return NextResponse.json({ error: 'Christmas gifts are closed for this year.' }, { status: 410 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { amount, shirtNumber, childFirstName } = parsed.data;

    if (!(CHRISTMAS.amounts as readonly number[]).includes(amount)) {
      return NextResponse.json({ error: 'Pick one of the gift amounts.' }, { status: 400 });
    }

    const stripe = await getStripe();
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';
    const kids = kidsForAmount(amount);

    const metadata: Record<string, string> = {
      order_type: 'christmas_gift',
      campaign_year: String(CHRISTMAS.year),
      shirt_number: shirtNumber ? String(shirtNumber) : '',
      child_first_name: childFirstName || '',
      kids_covered: String(kids),
    };

    const cancelPath = shirtNumber ? `/children/${shirtNumber}` : '/donate';

    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Christmas at the campus ${CHRISTMAS.year}`,
              description:
                `One-time $${amount} gift to Be A Number, International. ` +
                `Goes toward ${CHRISTMAS.giftShort} for every one of the ${CHRISTMAS.kidCount} kids at the campus in Northern Uganda. ` +
                `${CHRISTMAS.overflowNote}`,
            },
            unit_amount: amount * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_creation: 'always',
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata,
      },
      success_url: `${origin}/christmas/success?session_id={CHECKOUT_SESSION_ID}${shirtNumber ? `&n=${shirtNumber}` : ''}`,
      cancel_url: `${origin}${cancelPath}`,
      billing_address_collection: 'required',
      custom_fields: [
        {
          key: 'organization',
          label: { type: 'custom', custom: 'Organization Name (if applicable)' },
          type: 'text',
          optional: true,
        },
      ],
      metadata,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('[Christmas Checkout] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout' },
      { status: 500 }
    );
  }
}
