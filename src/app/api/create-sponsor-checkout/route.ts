import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Sponsor Checkout] STRIPE_SECRET_KEY is not set');
    throw new Error('Payment system configuration error. Please contact support.');
  }
  return new StripeModule(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
}

const SPONSORSHIP_AMOUNT = 25; // $25/month per child

export async function POST(request: NextRequest) {
  try {
    const stripe = await getStripe();

    const sponsorSchema = z.object({
      childRecordId: z.string().min(1, 'Missing child identifier.'),
      childId: z.string().optional().default(''),
      childDisplayName: z.string().max(255).optional().default(''),
      email: z.string().email().optional().or(z.literal('')),
      name: z.string().max(255).optional().default(''),
      referringShirtSessionId: z.string().optional().default(''),
    });

    const parsed = sponsorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { childRecordId, childId, childDisplayName, email, name, referringShirtSessionId } = parsed.data;

    // Attribution breadcrumb. When a sponsor arrives via the shirt success
    // page, we thread the original shirt checkout session id here so the
    // retention dashboard can tie the subscription back to the exact shirt
    // purchase that led to it (not just customer id or email, which are
    // unreliable when buyers use guest checkout or different emails).
    const shirtSessionRef = referringShirtSessionId.startsWith('cs_')
      ? referringShirtSessionId
      : '';

    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Sponsor ${childDisplayName || 'a child'} / Be A Number`,
              description: `Monthly sponsorship of ${childDisplayName || 'a child in Northern Uganda'}. Education, meals, medical care, and mentorship. Cancel anytime.`,
            },
            unit_amount: SPONSORSHIP_AMOUNT * 100,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/sponsor/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/sponsorship`,
      customer_email: email || undefined,
      billing_address_collection: 'required',
      custom_fields: [
        {
          key: 'organization',
          label: {
            type: 'custom',
            custom: 'Organization Name (if applicable)',
          },
          type: 'text',
          optional: true,
        },
        {
          key: 'referral',
          label: {
            type: 'custom',
            custom: 'How did you hear about us?',
          },
          type: 'text',
          optional: true,
        },
      ],
      metadata: {
        order_type: 'sponsorship',
        child_record_id: childRecordId,
        child_id: childId || '',
        child_display_name: childDisplayName || '',
        sponsor_name: name || '',
        donation_type: 'monthly',
        referring_shirt_session_id: shirtSessionRef,
      },
      subscription_data: {
        metadata: {
          order_type: 'sponsorship',
          child_record_id: childRecordId,
          child_id: childId || '',
          child_display_name: childDisplayName || '',
          donation_type: 'monthly',
          amount: SPONSORSHIP_AMOUNT.toString(),
          referring_shirt_session_id: shirtSessionRef,
        },
      },
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('[Sponsor Checkout] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
