/**
 * Gift checkout (memo §11).
 *
 * Creates a Stripe Checkout Session for a $25 one-time gift. The gifter
 * pays; the gift email goes out to the recipient after the webhook
 * processes the payment.
 *
 * Phase 1 (this file): "sponsorship" kind only — digital gift, no shirt.
 * The recipient gets matched to a child and receives an email with their
 * number + a link to /children/[number]?gift=true&from=[gifter]. They
 * meet the child and decide whether to continue at $25/month from there.
 *
 * Phase 2 (follow-up): "shirt" kind — same flow but with a physical
 * shirt shipped to the recipient.
 */
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';

const GIFT_AMOUNT = 25;

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Gift Checkout] STRIPE_SECRET_KEY is not set');
    throw new Error('Payment system configuration error. Please contact support.');
  }
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
}

const giftSchema = z.object({
  kind: z.enum(['sponsorship']),
  gifterName: z.string().max(120).optional().default(''),
  recipientName: z.string().min(1, 'Recipient name is required.').max(120),
  recipientEmail: z.string().email('Valid recipient email is required.').max(255),
  giftMessage: z.string().max(500).optional().default(''),
});

export async function POST(request: NextRequest) {
  try {
    const stripe = await getStripe();
    const parsed = giftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { kind, gifterName, recipientName, recipientEmail, giftMessage } = parsed.data;

    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    const metadata: Record<string, string> = {
      order_type: kind === 'sponsorship' ? 'gift_sponsorship' : 'gift_shirt',
      gifter_name: gifterName || '',
      recipient_name: recipientName,
      recipient_email: recipientEmail.toLowerCase().trim(),
      gift_message: giftMessage || '',
    };

    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Gift sponsorship for ${recipientName}`,
              description:
                `One-time $${GIFT_AMOUNT} gift to Be A Number, International. ` +
                `Sponsors a child for their first month at the campus in Northern Uganda. ` +
                `Your recipient meets the specific kid whose number they carry and decides whether to continue at $25/month.`,
            },
            unit_amount: GIFT_AMOUNT * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // Always create the gifter as a Stripe Customer and save their
      // payment method off-session. This enables the gift-to-gifter
      // conversion loop (memo §6/§12): after their recipient meets the
      // child, the gifter is the warmest possible lead for their own
      // sponsorship and we want one-tap conversion for them too.
      customer_creation: 'always',
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata,
      },
      success_url: `${origin}/gift/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/gift/sponsorship`,
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
  } catch (error: any) {
    console.error('[Gift Checkout] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create gift checkout' },
      { status: 500 }
    );
  }
}
