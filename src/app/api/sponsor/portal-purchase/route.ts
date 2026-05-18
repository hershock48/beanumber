/**
 * Sponsor portal — "Shop Your Number" repeat purchase (memo §5).
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
 * Shop Your Number a quiet retention lever — lapsed sponsors keep
 * their relationship but lose the order surface, per memo §7.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const AIRTABLE_DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';

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

const atHeaders = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
});

async function verifySession(sponsorCode: string): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('sponsor_session');
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

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('[Portal Purchase] Airtable credentials missing');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // 1. Look up the sponsorship to get status, child link, email.
    const sponsorshipFormula = `{SponsorCode} = "${sponsorCode}"`;
    const sponsorshipRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(sponsorshipFormula)}&maxRecords=1`,
      { headers: atHeaders() }
    );
    if (!sponsorshipRes.ok) {
      console.error('[Portal Purchase] Sponsorship lookup failed', sponsorshipRes.status);
      return NextResponse.json({ error: 'Sponsorship lookup failed' }, { status: 500 });
    }
    const sponsorshipData = await sponsorshipRes.json();
    const sponsorship = sponsorshipData.records?.[0];
    if (!sponsorship) {
      return NextResponse.json({ error: 'Sponsorship not found' }, { status: 404 });
    }

    const f = sponsorship.fields;
    const status = f['Status'] as string | undefined;
    if (status !== 'Active') {
      // Memo §5 + §7: lapsed sponsors lose the order surface, but their
      // number and matched child are preserved. The relationship outlasts
      // the billing relationship.
      return NextResponse.json(
        { error: 'Shop Your Number is available for active sponsors only.' },
        { status: 403 }
      );
    }

    const childID = f['ChildID'] as string | undefined;
    const sponsorEmail = (f['SponsorEmail'] as string | undefined) || '';
    const sponsorName = (f['SponsorName'] as string | undefined) || '';
    const childDisplayName = (f['ChildDisplayName'] as string | undefined) || '';

    if (!childID) {
      return NextResponse.json(
        { error: 'No child match found on this sponsorship.' },
        { status: 400 }
      );
    }

    // 2. Look up the child to get the shirt number.
    const childFormula = `{ChildID} = "${childID}"`;
    const childRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}?filterByFormula=${encodeURIComponent(childFormula)}&maxRecords=1`,
      { headers: atHeaders() }
    );
    if (!childRes.ok) {
      console.error('[Portal Purchase] Child lookup failed', childRes.status);
      return NextResponse.json({ error: 'Child lookup failed' }, { status: 500 });
    }
    const childData = await childRes.json();
    const childRecord = childData.records?.[0];
    if (!childRecord) {
      return NextResponse.json({ error: 'Child record missing' }, { status: 404 });
    }
    const shirtNumber = childRecord.fields['ShirtNumber'];
    if (typeof shirtNumber !== 'number') {
      return NextResponse.json(
        { error: 'No shirt number on the matched child record.' },
        { status: 400 }
      );
    }

    // 3. Best-effort: look up the donor's existing Stripe Customer ID so
    // the new Checkout Session can use saved payment methods (the one-tap
    // promise of memo §2). If the donor record doesn't have one (older
    // shirt-only buyers before sprint 2's customer-object continuity fix),
    // we fall back to customer_email and Stripe creates one.
    let stripeCustomerId: string | null = null;
    if (sponsorEmail) {
      try {
        const donorFormula = `LOWER({Email Address}) = "${sponsorEmail.toLowerCase()}"`;
        const donorRes = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(donorFormula)}&maxRecords=1`,
          { headers: atHeaders() }
        );
        if (donorRes.ok) {
          const donorData = await donorRes.json();
          stripeCustomerId = donorData.records?.[0]?.fields?.['Stripe Customer ID'] || null;
        }
      } catch (err) {
        console.warn('[Portal Purchase] Donor lookup failed, continuing without customer_id', err);
      }
    }

    const shirt = SHIRTS[shirtId]!;
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    // 4. Build the Stripe Checkout Session. Payment mode (no new
    // subscription — the existing sponsorship is doing that work).
    // Free shipping for repeat orders.
    const stripe = await getStripe();

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
      child_id: childID,
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
              description: `Repeat order for ${sponsorName || 'an active sponsor'}. Ships with #${shirtNumber} stamped on the inside collar — the same number as the original shirt.`,
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
