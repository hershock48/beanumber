import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type Stripe from 'stripe';
import { z } from 'zod';
import { SESSION } from '@/lib/constants';
import { getViewerEmail } from '@/lib/sponsor-relationship';

/**
 * Gate per the Number-is-identity model: every sponsorship must
 * trace back to a Number. The caller is either (a) a signed-in
 * sponsor (sponsor_session cookie present and valid), or
 * (b) a freshly-finished shirt buyer in the §2 one-tap conversion
 * window (existingCustomerId + buyerEmail handed across by the
 * /[N] page). Cold-direct sponsorship without a Number is no
 * longer supported — see core_model.md §0b.
 */
async function hasSponsorSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return false;
    const session = JSON.parse(raw.value);
    if (!session?.email) return false;
    if (new Date(session.expires) < new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

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
      // The shirt number of the /children/[N] page the sponsor button
      // was pressed on. Two jobs (Kevin, 2026-08-02 — "cant we take
      // them to the payment page and use the email they enter to
      // claim the number?"):
      //   1. AUTH: presence of a number-page context satisfies the
      //      shirt-first rule for anonymous checkout — the visitor is
      //      standing on a Number, which is the thing sponsorships
      //      must trace to. Cold-direct (no session, no number) still
      //      401s to /shirts.
      //   2. CLAIM: rides checkout metadata; the Stripe webhook uses
      //      the email the payer enters at checkout to claim this
      //      number (guarded server-side against numbers already
      //      claimed by a different email — those payers become
      //      co-sponsors of the kid, and the number stays exclusive).
      shirtNumber: z.number().int().positive().optional(),
    });

    const parsed = sponsorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { childRecordId, childId, childDisplayName, email, name, referringShirtSessionId, existingCustomerId, buyerEmail, returnPath, shirtNumber } = parsed.data;

    // Number-is-identity gate. A sponsor-checkout request must carry
    // one of three proofs it traces to a Number:
    //   (a) a signed-in sponsor session,
    //   (b) the §2 one-tap shirt-buyer context, or
    //   (c) a shirtNumber — the caller is a kid page /children/[N],
    //       and the webhook will claim that number with the payer's
    //       checkout email (Kevin's 2026-08-02 direct-pay funnel; the
    //       page IS the number, so the trace-to-a-Number rule holds).
    // Cold-direct with none of the three still 401s to /shirts.
    const oneTapContext =
      Boolean(existingCustomerId && existingCustomerId.startsWith('cus_')) &&
      Boolean(buyerEmail && buyerEmail.length > 0);
    // Signed-in viewer's email — also used below to lock Stripe's
    // email field to the session identity, so the webhook files the
    // sponsorship under the same email the site knows them by.
    const sessionEmail = await getViewerEmail();
    if (!oneTapContext && !sessionEmail && !shirtNumber) {
      return NextResponse.json(
        {
          error:
            'Sponsorships must be attached to a Number. Get a Shirt or sign in with the email tied to your Number first.',
          redirect: '/shirts',
        },
        { status: 401 }
      );
    }

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
              description: `Monthly sponsorship of ${childDisplayName || 'a child in Northern Uganda'}. Supports school, meals, medical care, and mentorship at the campus. Cancel anytime.`,
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
      cancel_url: `${origin}${returnPath || '/shirts'}`,
      ...(hasExistingCustomer
        ? { customer: existingCustomerId as string }
        : {
            // Signed-in viewers get their session email locked into
            // Stripe (customer_email renders read-only) so the
            // webhook can't file the sponsorship under a second
            // identity. Anonymous number-page payers enter their
            // email at Stripe — that entry IS their identity, and
            // the webhook claims the number with it.
            customer_email:
              email || buyerEmail || sessionEmail || undefined,
          }),
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
        // Webhook claims this number with the payer's email (guarded
        // against numbers already claimed by another email).
        claim_shirt_number: shirtNumber ? String(shirtNumber) : '',
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
