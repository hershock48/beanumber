import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  children as childrenTable,
  donations as donationsTable,
  donationChildren as donationChildrenTable,
} from '@/lib/db/schema';

// Never cache. This endpoint is polled by the success page and must reflect
// the webhook's assignment as soon as it lands.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  itemCount: number;
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
    if (orderType !== 'shirt' && orderType !== 'shirt_plus_monthly' && orderType !== 'cart') {
      return NextResponse.json(
        { error: 'Not a shirt order' },
        { status: 400 }
      );
    }

    const isCart = orderType === 'cart';

    // For cart orders, build shirt info from the first item or summarize.
    // For single-shirt orders, use the direct metadata fields.
    let shirt: { name: string; color: string; size: string } | null;
    let alreadySponsoring: boolean;
    let itemCount = 1;

    if (isCart) {
      const monthlyCount = parseInt(session.metadata?.monthly_count || '0', 10);
      itemCount = parseInt(session.metadata?.item_count || '1', 10);
      alreadySponsoring = monthlyCount > 0;

      // Parse items_json for display
      try {
        const itemsMeta = JSON.parse(session.metadata?.items_json || '[]');
        if (itemsMeta.length === 1) {
          shirt = {
            name: itemsMeta[0].n || 'Be A Number shirt',
            color: itemsMeta[0].c || '',
            size: itemsMeta[0].z || '',
          };
        } else {
          shirt = {
            name: `${itemsMeta.length} shirts`,
            color: '',
            size: '',
          };
        }
      } catch {
        shirt = { name: `${itemCount} shirt${itemCount !== 1 ? 's' : ''}`, color: '', size: '' };
      }
    } else {
      shirt = {
        name: session.metadata?.shirt_name || 'Be A Number shirt',
        color: session.metadata?.shirt_color || '',
        size: session.metadata?.shirt_size || '',
      };
      // alreadySponsoring drives the success-page copy swap. True only when
      // the buyer actively opted in at checkout (not just any subscription
      // that happens to have shirt metadata).
      alreadySponsoring = orderType === 'shirt_plus_monthly';
    }

    // Look up the Donation row the webhook created. If it doesn't exist yet,
    // the webhook hasn't fired — tell the client to keep polling.
    const child = await lookupAssignedChild(sessionId);

    const response: OrderStatusResponse = {
      shirt,
      child,
      alreadySponsoring,
      itemCount,
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
 * Look up the donation row for this checkout session and follow its
 * donation_children junction to the linked kid. Returns null if no
 * donation exists yet (webhook pending) OR the donation exists
 * without a child link (no child was available at the time, or this
 * was a non-shirt path).
 *
 * The caller decides how to present each case.
 */
async function lookupAssignedChild(
  sessionId: string
): Promise<OrderStatusResponse['child']> {
  // Find the donation row for this checkout session.
  const donationRows = await db
    .select({ id: donationsTable.id })
    .from(donationsTable)
    .where(eq(donationsTable.stripeCheckoutSessionId, sessionId))
    .limit(1);

  const donation = donationRows[0];
  if (!donation) {
    // Webhook hasn't run yet. Client should keep polling.
    return null;
  }

  // Pick the first linked kid via the donation_children junction.
  const linkRows = await db
    .select({ childId: donationChildrenTable.childId })
    .from(donationChildrenTable)
    .where(eq(donationChildrenTable.donationId, donation.id))
    .limit(1);

  const link = linkRows[0];
  if (!link) {
    // Donation exists but no child was assigned (e.g. all children matched,
    // or this was a donation that didn't get a shirt assignment).
    return null;
  }

  const childRows = await db
    .select()
    .from(childrenTable)
    .where(eq(childrenTable.id, link.childId))
    .limit(1);

  const childRow = childRows[0];
  if (!childRow) return null;

  const firstName = childRow.firstName || 'Your child';
  const lastInitial = childRow.lastInitial || '';
  const displayName =
    childRow.displayName ||
    `${firstName}${lastInitial ? ' ' + lastInitial : ''}`.trim();

  // Age: prefer DateOfBirth math; leave null if not available.
  let age: string | null = null;
  if (childRow.dateOfBirth) {
    const birth = new Date(childRow.dateOfBirth);
    if (!isNaN(birth.getTime())) {
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
        years -= 1;
      }
      if (years >= 0 && years < 100) age = String(years);
    }
  }

  const shirtNumber = childRow.shirtNumber ?? 0;

  return {
    childId: childRow.childId || childRow.id,
    firstName,
    displayName,
    age,
    shirtNumber,
    photoUrl: childRow.profilePhotoUrl ?? null,
    funFact: childRow.notes ?? null,
    location: 'Gulu, Northern Uganda',
  };
}
