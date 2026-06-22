/**
 * Sponsor-requested kid update.
 *
 * A signed-in sponsor taps "Ask for an update" on the portal. We:
 *   1. Verify the session cookie matches the sponsorCode.
 *   2. Throttle: one request per kid per 90 days, enforced by the
 *      Sponsorship `NextRequestEligibleAt` field.
 *   3. Insert a `child_updates` row tagged `RequestedBySponsor=true`
 *      and `Status='Pending Review'`. The YDO team sees it in admin
 *      and publishes when they have something to share.
 *   4. Stamp the Sponsorship's `LastRequestAt` / `NextRequestEligibleAt`
 *      so the throttle holds until the quarter rolls.
 *
 * Idempotency: same-day double-tap is collapsed to a single
 * `child_updates` row by `createUpdateRequest`. Caller still gets a
 * 200 either way.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';
import {
  getChildByChildId,
  getChildByRecordId,
  getSponsorshipBySponsorCode,
} from '@/lib/db/queries';
import {
  createUpdateRequest,
  markSponsorshipUpdateRequested,
} from '@/lib/db/mutations';

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

export async function POST(request: NextRequest) {
  try {
    const { sponsorCode, email } = await request.json();

    if (!sponsorCode || !email) {
      return NextResponse.json(
        { error: 'Sponsor code and email are required' },
        { status: 400 }
      );
    }

    // Verify session
    if (!(await verifySession(sponsorCode))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 1. Load the sponsorship to check the throttle and pull the child
    //    linkage.
    const sponsorship = await getSponsorshipBySponsorCode(sponsorCode);
    if (!sponsorship) {
      return NextResponse.json(
        { error: 'Sponsorship not found' },
        { status: 404 }
      );
    }

    // 2. Throttle check via NextRequestEligibleAt (Postgres timestamp).
    if (sponsorship.nextRequestEligibleAt) {
      const eligibleDate = new Date(sponsorship.nextRequestEligibleAt);
      const now = new Date();
      if (now < eligibleDate) {
        const daysUntil = Math.ceil(
          (eligibleDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        return NextResponse.json(
          { error: `You can request your next update in ${daysUntil} days. Updates are limited to once per quarter.` },
          { status: 429 }
        );
      }
    }

    // 3. Resolve the kid &mdash; UUID FK first, legacy ChildID text as
    //    fallback (transition window).
    let child = sponsorship.childId
      ? await getChildByRecordId(sponsorship.childId)
      : null;
    if (!child && sponsorship.childIdLegacy) {
      child = await getChildByChildId(sponsorship.childIdLegacy);
    }
    if (!child) {
      return NextResponse.json(
        { error: 'Child ID not found for this sponsorship' },
        { status: 404 }
      );
    }

    // 4. Write the request + stamp the throttle. Idempotent on
    //    repeated same-day taps via createUpdateRequest.
    await createUpdateRequest({
      sponsorCode,
      sponsorEmail: email,
      childId: child.id,
      childIdLegacy: child.childId || sponsorship.childIdLegacy || null,
    });

    await markSponsorshipUpdateRequested(sponsorship.id);

    return NextResponse.json({
      success: true,
      message: 'Update request submitted successfully',
    });
  } catch (error: any) {
    console.error('[Request Update] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit update request' },
      { status: 500 }
    );
  }
}
