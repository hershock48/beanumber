/**
 * Sponsor-to-kid message.
 *
 * A signed-in sponsor types a short note to their kid. We log it as a
 * `communications` row with `email_type='Sponsor Message'` and the
 * sponsorCode prefixed onto the subject line so the timeline endpoint
 * can surface every message a given sponsor has sent.
 *
 * Idempotency: a double-tap with the same body in the same UTC day
 * resolves to the same Communications row (see recordSponsorMessage).
 * Returns success in both cases.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';
import {
  getChildByChildId,
  getChildByRecordId,
  getDonorByEmail,
  getSponsorshipBySponsorCode,
} from '@/lib/db/queries';
import { recordSponsorMessage } from '@/lib/db/mutations';

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
    const { sponsorCode, email, message } = await request.json();

    if (!sponsorCode || !email || !message) {
      return NextResponse.json(
        { error: 'Sponsor code, email, and message are required' },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: 'Message is too long. Please keep it under 2000 characters.' },
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

    // 1. Load the sponsorship + resolve the kid &mdash; not strictly
    //    required for the write, but the original Airtable flow
    //    refused to log a message if the kid linkage was missing,
    //    treating it as a misconfigured sponsorship. We keep that
    //    safeguard.
    const sponsorship = await getSponsorshipBySponsorCode(sponsorCode);
    if (!sponsorship) {
      return NextResponse.json(
        { error: 'Sponsorship not found' },
        { status: 404 }
      );
    }

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

    // 2. Resolve the donor for relational tagging (best-effort).
    let donorId: string | null = null;
    if (sponsorship.sponsorEmail) {
      try {
        const donor = await getDonorByEmail(sponsorship.sponsorEmail);
        donorId = donor?.id ?? null;
      } catch (err) {
        console.warn('[Send Message] Donor lookup failed (non-fatal):', err);
      }
    }

    // 3. Write the message. Idempotent on same-day duplicates.
    await recordSponsorMessage({
      sponsorCode,
      sponsorEmail: email,
      childDisplayName: sponsorship.childDisplayName || child.displayName || null,
      message,
      relatedDonorId: donorId,
    });

    return NextResponse.json({
      success: true,
      message: 'Message sent successfully',
    });
  } catch (error: any) {
    console.error('[Send Message] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}
