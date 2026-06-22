/**
 * GET /api/sponsor/updates?sponsorCode=BAN-YYYY-NNN
 *
 * The sponsor portal data hook. Returns:
 *   - childInfo:           kid card data (only present when reveal has fired).
 *   - childRevealed:       boolean reveal gate.
 *   - revealedAt:          ISO timestamp the reveal fired.
 *   - sponsorship:         stats block (startDate, monthsActive, status,
 *                          monthlyAmount). Used for impact math.
 *   - updates:             published, sponsor-visible child_updates rows
 *                          for this kid, newest first.
 *   - sponsorMessages:     every Sponsor Message this sponsor has sent
 *                          (source: communications table).
 *   - nextRequestEligibleAt: throttle date for the next update request.
 *
 * Auth: sponsor_session cookie must match sponsorCode.
 * Reveal gate: childInfo + updates + sponsorMessages all stay null/[]
 * until `childRevealedAt` is set on the Sponsorship row. The Stripe
 * webhook (and the magic-link callback for Holder claims) flip this.
 *
 * Data source: Postgres only. Airtable is no longer involved.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';
import {
  getChildByChildId,
  getChildByRecordId,
  getPublishedUpdatesForChild,
  getSponsorMessagesByCode,
  getSponsorshipBySponsorCode,
} from '@/lib/db/queries';

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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sponsorCode = searchParams.get('sponsorCode');

    if (!sponsorCode) {
      return NextResponse.json(
        { error: 'Sponsor code is required' },
        { status: 400 }
      );
    }

    if (!(await verifySession(sponsorCode))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ---------------------------------------------------------------
    // 1. Sponsorship row.
    // ---------------------------------------------------------------
    const sponsorship = await getSponsorshipBySponsorCode(sponsorCode);

    let childInfo: any = null;
    let childRevealed = false;
    let revealedAt: string | null = null;
    let nextRequestEligibleAt: string | null = null;
    let sponsorshipStats: {
      startDate: string | null;
      totalPaid: number;
      monthlyAmount: number;
      monthsActive: number;
      status: string | null;
    } = {
      startDate: null,
      totalPaid: 0,
      monthlyAmount: 25,
      monthsActive: 0,
      status: null,
    };

    let updates: any[] = [];
    let sponsorMessages: any[] = [];

    if (sponsorship) {
      revealedAt = sponsorship.childRevealedAt
        ? new Date(sponsorship.childRevealedAt).toISOString()
        : null;
      childRevealed = !!revealedAt;
      nextRequestEligibleAt = sponsorship.nextRequestEligibleAt
        ? new Date(sponsorship.nextRequestEligibleAt).toISOString()
        : null;

      const startDate = sponsorship.sponsorshipStartDate || null;
      const monthlyAmount = Number(sponsorship.monthlyAmount ?? 25);

      let monthsActive = 0;
      if (startDate) {
        const start = new Date(startDate);
        const now = new Date();
        monthsActive = Math.max(
          0,
          (now.getFullYear() - start.getFullYear()) * 12 +
            (now.getMonth() - start.getMonth()) +
            (now.getDate() >= start.getDate() ? 0 : -1)
        );
        // At minimum 1 month if they&rsquo;ve started.
        if (monthsActive === 0 && now >= start) monthsActive = 1;
      }

      sponsorshipStats = {
        startDate,
        // Total Paid was an Airtable rollup; we don't have a Postgres
        // equivalent denormalized on the Sponsorship row. The portal
        // computes it from monthsActive * monthlyAmount.
        totalPaid: monthsActive * monthlyAmount,
        monthlyAmount,
        monthsActive,
        status: sponsorship.status ?? null,
      };

      // -------------------------------------------------------------
      // 2. Resolve the kid (UUID FK first, legacy ChildID fallback).
      // -------------------------------------------------------------
      let child = sponsorship.childId
        ? await getChildByRecordId(sponsorship.childId)
        : null;
      if (!child && sponsorship.childIdLegacy) {
        child = await getChildByChildId(sponsorship.childIdLegacy);
      }

      if (childRevealed && child) {
        childInfo = {
          name:
            sponsorship.childDisplayName ||
            child.displayName ||
            child.firstName ||
            '',
          firstName: child.firstName || undefined,
          photo: child.profilePhotoUrl || undefined,
          age: sponsorship.childAge || undefined,
          location: sponsorship.childLocation || undefined,
          sponsorshipStartDate: startDate || undefined,
          birthday: child.dateOfBirth || undefined,
          homeVillage: child.homeVillage || undefined,
          familyContext: child.familyContext || undefined,
          loves: child.loves || undefined,
          childQuote: child.childQuote || undefined,
          teacherName: child.teacherName || undefined,
          teacherQuote: child.teacherQuote || undefined,
          notes: child.notes || undefined,
          // Shop Your Number (memo §5) needs the shirt number on the
          // sponsor's matched child so the portal can carry it forward
          // to repeat orders.
          shirtNumber:
            typeof child.shirtNumber === 'number' ? child.shirtNumber : null,
        };

        // -----------------------------------------------------------
        // 3. Published updates for this kid (reveal-gated).
        // -----------------------------------------------------------
        const updateRows = await getPublishedUpdatesForChild({
          id: child.id,
          childId: child.childId || sponsorship.childIdLegacy || '',
        });
        updates = updateRows.map(row => ({
          id: row.id,
          date: row.publishedAt
            ? new Date(row.publishedAt).toISOString()
            : row.requestedAt
              ? new Date(row.requestedAt).toISOString()
              : '',
          type: row.updateType || 'Progress Report',
          title: row.title || '',
          content: row.content || row.summary || '',
          photos: Array.isArray(row.photoUrls) ? row.photoUrls : [],
        }));
      }

      // -------------------------------------------------------------
      // 4. Sponsor messages (reveal-gated &mdash; matches old behavior).
      //    Source moved from Child Updates to Communications table per
      //    Postgres migration.
      // -------------------------------------------------------------
      if (childRevealed) {
        const msgRows = await getSponsorMessagesByCode(sponsorCode);
        sponsorMessages = msgRows.map(row => ({
          id: row.id,
          date: row.createdAt
            ? new Date(row.createdAt).toISOString()
            : row.sendDate
              ? new Date(row.sendDate).toISOString()
              : '',
          // The subject is `[sponsorCode] <preview>` &mdash; strip the
          // bracketed prefix for display so the UI shows the message
          // body, not the routing tag.
          content: (row.subject || '').replace(
            new RegExp(`^\\[${sponsorCode}\\]\\s*`),
            ''
          ),
          status: row.status || 'Sent',
        }));
      }
    }

    return NextResponse.json({
      updates,
      sponsorMessages,
      childInfo,
      childRevealed,
      revealedAt,
      sponsorship: sponsorshipStats,
      nextRequestEligibleAt,
    });
  } catch (error: any) {
    console.error('[Sponsor Updates] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load updates' },
      { status: 500 }
    );
  }
}
