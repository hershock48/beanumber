import { NextRequest, NextResponse } from 'next/server';

// Never cache. This endpoint is polled by the success page and must reflect
// the webhook's assignment as soon as it lands.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

interface OrderStatusResponse {
  shirt: {
    name: string;
    color: string;
    size: string;
  } | null;
  child: {
    childId: string;
    firstName: string;
    displayName: string;
    age: string | null;
    shirtNumber: number;
    photoUrl: string | null;
    funFact: string | null;
    location: string;
  } | null;
  // True when the buyer checked "Keep sponsoring after this shirt" at
  // checkout. The success page uses this to swap the "Sponsor $25/mo" CTA
  // for a "You're already sponsoring {name}. Welcome." confirmation.
  alreadySponsoring: boolean;
  status: 'pending' | 'ready' | 'unavailable';
}

/**
 * GET /api/shirts/order-status?session_id=cs_...
 *
 * Returns the shirt order metadata (always, from Stripe) and the assigned
 * child (when the webhook has completed the assignment). The success page
 * polls this endpoint and reveals the child once `status === 'ready'`.
 *
 * Status values:
 *   - 'pending'     Webhook hasn't created the donation yet. Keep polling.
 *   - 'ready'       Child is assigned. Stop polling, reveal.
 *   - 'unavailable' Order is valid but no child could be assigned (all
 *                   children already matched). Fall back to generic copy.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    // Fetch the Stripe session to get shirt metadata. This is the source of
    // truth for what the buyer ordered, independent of the webhook.
    const StripeModule = (await import('stripe')).default;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: 'Payment system not configured' },
        { status: 500 }
      );
    }
    const stripe = new StripeModule(secretKey, {
      apiVersion: '2025-12-15.clover',
    });

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Gate by order_type so this endpoint can't be used to probe non-shirt sessions.
    // Accept both pure shirt orders and shirt+monthly opt-ins.
    const orderType = session.metadata?.order_type;
    if (orderType !== 'shirt' && orderType !== 'shirt_plus_monthly') {
      return NextResponse.json(
        { error: 'Not a shirt order' },
        { status: 400 }
      );
    }

    const shirt = {
      name: session.metadata?.shirt_name || 'Be A Number shirt',
      color: session.metadata?.shirt_color || '',
      size: session.metadata?.shirt_size || '',
    };

    // alreadySponsoring drives the success-page copy swap. True only when
    // the buyer actively opted in at checkout (not just any subscription
    // that happens to have shirt metadata).
    const alreadySponsoring = orderType === 'shirt_plus_monthly';

    // Look up the Donation row the webhook created. If it doesn't exist yet,
    // the webhook hasn't fired — tell the client to keep polling.
    const child = await lookupAssignedChild(sessionId);

    const response: OrderStatusResponse = {
      shirt,
      child,
      alreadySponsoring,
      status: child ? 'ready' : 'pending',
    };

    return NextResponse.json(response, {
      headers: {
        // Never cache. The client is polling and we need fresh reads.
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Order Status] Error:', message);
    return NextResponse.json(
      { error: 'Failed to fetch order status' },
      { status: 500 }
    );
  }
}

/**
 * Look up the donation row for this checkout session and follow its Child
 * link. Returns null if no donation exists yet (webhook pending) OR the
 * donation exists without a Child link (no child was available at the time).
 *
 * The caller decides how to present each case.
 */
async function lookupAssignedChild(
  sessionId: string
): Promise<OrderStatusResponse['child']> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[Order Status] Airtable not configured');
    return null;
  }

  const donationFormula = `{Stripe Checkout Session ID} = "${sessionId}"`;
  const donationsUrl =
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_DONATIONS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(donationFormula)}&maxRecords=1`;

  const donationRes = await fetch(donationsUrl, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!donationRes.ok) {
    console.warn('[Order Status] Donation lookup failed', donationRes.status);
    return null;
  }

  const donationData = await donationRes.json();
  const donation = donationData.records?.[0];
  if (!donation) {
    // Webhook hasn't run yet. Client should keep polling.
    return null;
  }

  const childLinks = donation.fields?.['Child'];
  if (!Array.isArray(childLinks) || childLinks.length === 0) {
    // Donation exists but no child was assigned (e.g. all children matched).
    return null;
  }

  const childRecordId = childLinks[0];

  const childUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_CHILDREN_TABLE)}/${childRecordId}`;
  const childRes = await fetch(childUrl, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!childRes.ok) {
    console.warn('[Order Status] Child fetch failed', childRes.status);
    return null;
  }

  const childRecord = await childRes.json();
  const fields = childRecord.fields || {};

  const firstName = fields.FirstName || 'Your child';
  const lastInitial = fields.LastInitial || '';
  const displayName =
    fields.DisplayName ||
    `${firstName}${lastInitial ? ' ' + lastInitial : ''}`.trim();

  // Age: prefer DateOfBirth math; leave null if not available.
  let age: string | null = null;
  if (fields.DateOfBirth) {
    const birth = new Date(fields.DateOfBirth);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      years -= 1;
    }
    if (years >= 0 && years < 100) age = String(years);
  }

  const photoUrl =
    Array.isArray(fields.ProfilePhoto) && fields.ProfilePhoto[0]?.url
      ? (fields.ProfilePhoto[0].url as string)
      : null;

  const shirtNumber = Number(fields.ShirtNumber);
  const childId = fields.ChildID || childRecordId;

  return {
    childId,
    firstName,
    displayName,
    age,
    shirtNumber: Number.isFinite(shirtNumber) ? shirtNumber : 0,
    photoUrl,
    funFact: fields.Notes || null,
    location: 'Gulu, Northern Uganda',
  };
}
