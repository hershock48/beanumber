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
      // Memo §2 one-tap: when /children/[number] resolves the visitor as
      // a known shirt buyer (via the ban_buyer_session cookie tied to a
      // Donation matched to this same child), the page passes the existing
      // Stripe Customer ID and buyer email so we attach the saved
      // payment method to the new subscription session.
      existingCustomerId: z.string().optional(),
      buyerEmail: z.string().email().optional().or(z.literal('')),
      // Path the user should land on if they cancel out of Stripe.
      // Set by callers that have meaningful context to preserve
      // (MeetSponsorButton sends /meet/[childId] so the user lands
      // back on the kid they were about to sponsor instead of the
      // generic browse grid). Must be a same-origin path — we
      // validate before using.
      //
      // Regex rejects:
      //   - protocol-relative paths like "//evil.com/x" (would be
      //     safe after origin prepending but defensive belt-and-
      //     suspenders against future code changes that drop the
      //     origin)
      //   - paths with whitespace (URL injection cleanup)
      //   - non-/ start
      returnPath: z
        .string()
        .max(200)
        .regex(/^\/[^/\s][^\s]*$|^\/$/, 'returnPath must be an absolute same-origin path')
        .optional(),
    });

    const parsed = sponsorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { childRecordId, childId, childDisplayName, email, name, referringShirtSessionId, existingCustomerId, buyerEmail, returnPath } = parsed.data;

    // Attribution breadcrumb. When a sponsor arrives via the shirt success
    // page, we thread the original shirt checkout session id here so the
    // retention dashboard can tie the subscription back to the exact shirt
    // purchase that led to it (not just customer id or email, which are
    // unreliable when buyers use guest checkout or different emails).
    const shirtSessionRef = referringShirtSessionId.startsWith('cs_')
      ? referringShirtSessionId
      : '';

    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    // Memo §2 one-tap: prefer attaching the existing Stripe Customer
    // (saved payment method + Link session) over a fresh customer_email
    // entry. Stripe rejects sessions that set BOTH `customer` and
    // `customer_email`, so the two are mutually exclusive.
    const hasExistingCustomer = Boolean(existingCustomerId && existingCustomerId.startsWith('cus_'));
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Sponsor ${childDisplayName || 'a child'} / Be A Number`,
              description: `Monthly sponsorship of ${childDisplayName || 'a child in Northern Uganda'}. Supports school, meals, medical care, and mentorship at the YDO campus. Cancel anytime.`,
            },
            unit_amount: SPONSORSHIP_AMOUNT * 100,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/sponsor/welcome?session_id={CHECKOUT_SESSION_ID}`,
      // Cancel returns to the caller's preserved context (e.g.
      // /meet/[childId]) when provided, otherwise the generic
      // sponsorship browse page. Schema validation already ensured
      // returnPath is a same-origin absolute path.
      cancel_url: `${origin}${returnPath || '/campus'}`,
      ...(hasExistingCustomer
        ? { customer: existingCustomerId as string }
        : { customer_email: email || buyerEmail || undefined }),
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
