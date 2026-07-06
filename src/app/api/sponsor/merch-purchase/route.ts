/**
 * Sponsor merch checkout &mdash; Number Collection.
 *
 * Active sponsors of a specific child can buy a hoodie, hat, or
 * sticker pack with that child's shirt number on it. This is the
 * retention surface that turns the /[number] sponsor view into a
 * one-tap merchandise flow: tap "I want a hoodie," see Stripe
 * Checkout pre-filled with your saved card, confirm, done.
 *
 * Unlike shirt orders, merch items don't get a Fulfillment row &mdash;
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
 *
 * Data layer: reads via src/lib/db/queries.ts (Postgres). Donation row
 * for this purchase is created by the Stripe webhook on
 * `checkout.session.completed`, not here.
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

// Merch catalog &mdash; single source of truth. Display names and prices
// live here so the client UI and the Stripe Checkout line items stay
// in sync without trusting client-side input.
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

    // 1. Load the sponsorship and confirm Active.
    const sponsorship = await getSponsorshipBySponsorCode(sponsorCode);
    if (!sponsorship || sponsorship.status !== 'Active') {
      return NextResponse.json(
        { error: 'Active sponsorship not found.' },
        { status: 404 }
      );
    }
    const sponsorEmail = sponsorship.sponsorEmail || '';
    const sponsorName = sponsorship.sponsorName || '';
    const childDisplayName = sponsorship.childDisplayName || '';

    // 2. Resolve the kid &mdash; UUID FK first, legacy ChildID text as
    //    fallback. We use Child.shirtNumber as the source of truth for
    //    what gets pressed on the merch item.
    let child = sponsorship.childId
      ? await getChildByRecordId(sponsorship.childId)
      : null;
    if (!child && sponsorship.childIdLegacy) {
      child = await getChildByChildId(sponsorship.childIdLegacy);
    }
    if (!child) {
      return NextResponse.json(
        { error: 'Sponsorship has no child link.' },
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

    // 3. Best-effort: look up the donor's Stripe Customer ID so checkout
    //    uses saved payment methods (true one-tap retention purchase).
    let stripeCustomerId: string | null = null;
    if (sponsorEmail) {
      try {
        const donor = await getDonorByEmail(sponsorEmail);
        stripeCustomerId = donor?.stripeCustomerId ?? null;
      } catch (err) {
        console.warn('[Merch] Donor lookup failed, continuing without customer_id', err);
      }
    }

    // 4. Build the Stripe Checkout Session. Payment mode (one-off
    //    purchase), free shipping (merch volume is small and Kevin
    //    wants frictionless retention buys), Stripe collects shipping
    //    address.
    const stripe = await getStripe();
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    const sizeSuffix = size ? ` (Size ${size})` : '';
    const productName = `${item.name}${sizeSuffix} · #${shirtNumber}`;
    const productDescription =
      `${item.description} Pressed/embroidered with #${shirtNumber} — the same number on the back of ${sponsorName || 'your'} shirt, connected to ${childDisplayName || 'your kid'}.`;

    const childIdLegacy = sponsorship.childIdLegacy || child.childId || '';
    const metadata: Record<string, string> = {
      order_type: 'merch_purchase',
      merch_type: merchType,
      merch_name: item.name,
      shirt_number: String(shirtNumber),
      sponsor_code: sponsorCode,
      sponsor_email: sponsorEmail,
      sponsor_name: sponsorName,
      child_id: childIdLegacy,
      child_record_id: child.id,
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
      // reorder &mdash; retention compounds when the second tap is also
      // one tap.
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
