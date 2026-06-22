/**
 * Sponsor portal &mdash; "Shop Your Number" repeat purchase (memo §5).
 *
 * Active sponsors can order additional shirts that carry their existing
 * shirt number, not a newly-assigned one. This endpoint creates a
 * payment-mode Stripe Checkout Session with the existing number in
 * metadata; the webhook branches on `order_type=portal_repeat` to skip
 * the new-child-assignment logic and write the order to Fulfillment
 * with the existing number stamped.
 *
 * Auth: sponsor session cookie (same as /api/sponsor/updates).
 * Gating: sponsorship must be Active (anything else 403s). This makes
 * Shop Your Number a quiet retention lever &mdash; lapsed sponsors keep
 * their relationship but lose the order surface, per memo §7.
 *
 * Data layer: all reads go through src/lib/db/queries.ts (Postgres via
 * Drizzle). The Donation row for this purchase is created by the Stripe
 * webhook on `checkout.session.completed`, NOT here &mdash; this endpoint
 * is purely a checkout-session factory.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION } from '@/lib/constants';
import {
  getChildByChildId,
  getChildByRecordId,
  getDonorByEmail,
  getSponsorshipBySponsorCode,
} from '@/lib/db/queries';

const SHIRTS: Record<string, { name: string }> = {
  onyx: { name: 'Onyx' },
  meadow: { name: 'Meadow' },
  blossom: { name: 'Blossom' },
  sky: { name: 'Sky' },
};

const SHIRT_PRICE = 25;

const purchaseSchema = z.object({
  sponsorCode: z.string().min(1).max(64),
  shirtId: z.enum(['onyx', 'meadow', 'blossom', 'sky']),
  size: z.enum(['S', 'M', 'L', 'XL', '2XL']),
  color: z.enum(['Onyx', 'Meadow', 'Blossom', 'Sky']),
});

async function verifySession(sponsorCode: string): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION.COOKIE_NAME);
  if (!sessionCookie) return false;
  try {
    const session = JSON.parse(sessionCookie.value);
    if (new Date(session.expires) < new Date()) return false;
    return session.sponsorCode === sponsorCode;
  } catch {
    return false;
  }
}

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Portal Purchase] STRIPE_SECRET_KEY is not set');
    throw new Error('Payment system configuration error.');
  }
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
}

export async function POST(request: NextRequest) {
  try {
    const parsed = purchaseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { sponsorCode, shirtId, size, color } = parsed.data;

    if (!(await verifySession(sponsorCode))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Look up the sponsorship row to check Active status + grab the
    //    kid linkage and sponsor identity.
    const sponsorship = await getSponsorshipBySponsorCode(sponsorCode);
    if (!sponsorship) {
      return NextResponse.json({ error: 'Sponsorship not found' }, { status: 404 });
    }
    if (sponsorship.status !== 'Active') {
      // Memo §5 + §7: lapsed sponsors lose the order surface, but their
      // number and matched child are preserved. The relationship outlasts
      // the billing relationship.
      return NextResponse.json(
        { error: 'Shop Your Number is available for active sponsors only.' },
        { status: 403 }
      );
    }

    const sponsorEmail = sponsorship.sponsorEmail || '';
    const sponsorName = sponsorship.sponsorName || '';
    const childDisplayName = sponsorship.childDisplayName || '';

    // 2. Resolve the kid via UUID FK first, legacy ChildID text as
    //    fallback (transition-window pattern).
    let child = sponsorship.childId
      ? await getChildByRecordId(sponsorship.childId)
      : null;
    if (!child && sponsorship.childIdLegacy) {
      child = await getChildByChildId(sponsorship.childIdLegacy);
    }
    if (!child) {
      return NextResponse.json(
        { error: 'No child match found on this sponsorship.' },
        { status: 400 }
      );
    }
    const shirtNumber = child.shirtNumber;
    if (typeof shirtNumber !== 'number') {
      return NextResponse.json(
        { error: 'No shirt number on the matched child record.' },
        { status: 400 }
      );
    }

    // 3. Best-effort: look up the donor's existing Stripe Customer ID
    //    so the new Checkout Session can use saved payment methods (the
    //    one-tap promise of memo §2). If the donor record doesn't have
    //    one (older shirt-only buyers before sprint 2's customer-object
    //    continuity fix), we fall back to customer_email and Stripe
    //    creates one.
    let stripeCustomerId: string | null = null;
    if (sponsorEmail) {
      try {
        const donor = await getDonorByEmail(sponsorEmail);
        stripeCustomerId = donor?.stripeCustomerId ?? null;
      } catch (err) {
        console.warn('[Portal Purchase] Donor lookup failed, continuing without customer_id', err);
      }
    }

    const shirt = SHIRTS[shirtId]!;
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    // 4. Build the Stripe Checkout Session. Payment mode (no new
    //    subscription &mdash; the existing sponsorship is doing that work).
    //    Free shipping for repeat orders.
    const stripe = await getStripe();

    const childIdLegacy = sponsorship.childIdLegacy || child.childId || '';
    const metadata: Record<string, string> = {
      order_type: 'portal_repeat',
      shirt_id: shirtId,
      shirt_name: shirt.name,
      shirt_color: color,
      shirt_size: size,
      sponsor_code: sponsorCode,
      sponsor_email: sponsorEmail,
      sponsor_name: sponsorName,
      existing_shirt_number: String(shirtNumber),
      child_id: childIdLegacy,
      child_record_id: child.id,
      child_display_name: childDisplayName,
      customer_name: sponsorName,
    };

    const sessionParams: any = {
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${shirt.name} tee · ${size} — Sponsor reorder #${shirtNumber}`,
              description: `Repeat order for ${sponsorName || 'an active sponsor'}. Ships with #${shirtNumber} pressed on the back of the shirt — the same number as the original.`,
            },
            unit_amount: SHIRT_PRICE * 100,
          },
          quantity: 1,
        },
      ],
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount' as const,
            fixed_amount: { amount: 0, currency: 'usd' },
            display_name: 'Free shipping',
          },
        },
      ],
      mode: 'payment',
      success_url: `${origin}/sponsor?repeat_order=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/sponsor`,
      shipping_address_collection: { allowed_countries: ['US'] },
      metadata,
      // Always save the payment method so future portal purchases stay
      // one-tap.
      payment_intent_data: {
        setup_future_usage: 'off_session' as const,
        metadata,
      },
    };

    // Attach to existing Customer if we have one; otherwise let Stripe
    // create one via customer_creation.
    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    } else {
      sessionParams.customer_creation = 'always';
      if (sponsorEmail) sessionParams.customer_email = sponsorEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('[Portal Purchase] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create portal purchase' },
      { status: 500 }
    );
  }
}
