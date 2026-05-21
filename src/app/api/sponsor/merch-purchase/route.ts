/**
 * Sponsor merch checkout — Number Collection.
 *
 * Active sponsors of a specific child can buy a hoodie, hat, or
 * sticker pack with that child's shirt number on it. This is the
 * retention surface that turns the /[number] sponsor view into a
 * one-tap merchandise flow: tap "I want a hoodie," see Stripe
 * Checkout pre-filled with your saved card, confirm, done.
 *
 * Unlike shirt orders, merch items don't get a Fulfillment row —
 * they're low enough volume that Kevin makes each by hand on demand.
 * The webhook records the Donation and emails Kevin the order
 * details (item, sponsor's number, shipping address). Kevin packs
 * and ships.
 *
 * Auth: sponsor_session cookie (same as /api/sponsor/portal-purchase).
 * Gating: sponsorship must be Active. The merch only makes sense for
 * sponsors with a known number, so we require both.
 *
 * Pricing is server-defined to prevent client tampering. Adjust here
 * if Kevin changes prices.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const AIRTABLE_DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';

// Merch catalog — single source of truth. Display names and prices live
// here so the client UI and the Stripe Checkout line items stay in sync
// without trusting client-side input.
const MERCH_CATALOG: Record<
  string,
  { name: string; description: string; priceCents: number; needsSize: boolean }
> = {
  hoodie: {
    name: 'Number Hoodie',
    description: 'Heavyweight hoodie, hand-pressed with your child’s number on the back.',
    priceCents: 4500,
    needsSize: true,
  },
  hat: {
    name: 'Number Hat',
    description: 'Embroidered cap with your child’s number front and center.',
    priceCents: 3000,
    needsSize: false,
  },
  stickers: {
    name: 'Number Sticker Pack',
    description: 'A small pack of stickers featuring your child’s number.',
    priceCents: 1000,
    needsSize: false,
  },
};

const purchaseSchema = z.object({
  sponsorCode: z.string().min(1).max(64),
  merchType: z.enum(['hoodie', 'hat', 'stickers']),
  // Sizes apply to hoodies. Hat is one-size, stickers don't have a size.
  size: z.enum(['S', 'M', 'L', 'XL', '2XL']).optional(),
});

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

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
    throw new Error('Payment system configuration error.');
  }
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
}

export async function POST(request: NextRequest) {
  try {
    const parsed = purchaseSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { sponsorCode, merchType, size } = parsed.data;
    const item = MERCH_CATALOG[merchType];
    if (!item) {
      return NextResponse.json({ error: 'Unknown merch item.' }, { status: 400 });
    }
    if (item.needsSize && !size) {
      return NextResponse.json({ error: 'Size is required for this item.' }, { status: 400 });
    }

    if (!(await verifySession(sponsorCode))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('[Merch] Airtable credentials missing');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // 1. Load the active Sponsorship for this code.
    const sponsorshipFormula = `AND({SponsorCode} = "${sponsorCode}", {Status} = "Active")`;
    const sponsorshipRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(sponsorshipFormula)}&maxRecords=1`,
      { headers: atHeaders() }
    );
    if (!sponsorshipRes.ok) {
      console.error('[Merch] Sponsorship lookup failed', sponsorshipRes.status);
      return NextResponse.json({ error: 'Sponsorship lookup failed' }, { status: 500 });
    }
    const sponsorshipData = await sponsorshipRes.json();
    const sponsorship = sponsorshipData.records?.[0];
    if (!sponsorship) {
      return NextResponse.json(
        { error: 'Active sponsorship not found.' },
        { status: 404 }
      );
    }
    const f = sponsorship.fields;
    const sponsorEmail = (f['SponsorEmail'] as string | undefined) || '';
    const sponsorName = (f['SponsorName'] as string | undefined) || '';
    const childDisplayName = (f['ChildDisplayName'] as string | undefined) || '';
    const childID = (f['ChildID'] as string | undefined) || '';

    if (!childID) {
      return NextResponse.json(
        { error: 'Sponsorship has no child link.' },
        { status: 400 }
      );
    }

    // 2. Resolve the shirt number from the linked Child record. We use
    //    Child.ShirtNumber as the source of truth — it's what gets
    //    pressed on the merch item.
    const childFormula = `{ChildID} = "${childID}"`;
    const childRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}?filterByFormula=${encodeURIComponent(childFormula)}&maxRecords=1`,
      { headers: atHeaders() }
    );
    if (!childRes.ok) {
      console.error('[Merch] Child lookup failed', childRes.status);
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

    // 3. Best-effort: look up the donor's Stripe Customer ID so checkout
    //    uses saved payment methods (true one-tap retention purchase).
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
          stripeCustomerId =
            donorData.records?.[0]?.fields?.['Stripe Customer ID'] || null;
        }
      } catch (err) {
        console.warn('[Merch] Donor lookup failed, continuing without customer_id', err);
      }
    }

    // 4. Build the Stripe Checkout Session. Payment mode (one-off purchase),
    //    free shipping (merch volume is small and Kevin wants frictionless
    //    retention buys), Stripe collects shipping address.
    const stripe = await getStripe();
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    const sizeSuffix = size ? ` (Size ${size})` : '';
    const productName = `${item.name}${sizeSuffix} · #${shirtNumber}`;
    const productDescription =
      `${item.description} Pressed/embroidered with #${shirtNumber} — the same number on the back of ${sponsorName || 'your'} shirt, matched to ${childDisplayName || 'your child'}.`;

    const metadata: Record<string, string> = {
      order_type: 'merch_purchase',
      merch_type: merchType,
      merch_name: item.name,
      shirt_number: String(shirtNumber),
      sponsor_code: sponsorCode,
      sponsor_email: sponsorEmail,
      sponsor_name: sponsorName,
      child_id: childID,
      child_display_name: childDisplayName,
      customer_name: sponsorName,
    };
    if (size) metadata.size = size;

    const sessionParams: any = {
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: item.priceCents,
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
      success_url: `${origin}/children/${shirtNumber}?merch=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/children/${shirtNumber}`,
      shipping_address_collection: { allowed_countries: ['US'] },
      metadata,
      // Keep payment method saved for the next merch purchase or shirt
      // reorder — retention compounds when the second tap is also one tap.
      payment_intent_data: {
        setup_future_usage: 'off_session' as const,
        metadata,
      },
    };

    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    } else {
      sessionParams.customer_creation = 'always';
      if (sponsorEmail) sessionParams.customer_email = sponsorEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('[Merch] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create merch purchase' },
      { status: 500 }
    );
  }
}
