/**
 * Deprecated manual sign-in form. The current sign-in path is the
 * magic-link flow (`/api/sponsor/recover/send-link` → callback) which
 * doesn't require the user to remember their sponsor code. This
 * endpoint is kept around so any lingering bookmark or legacy email
 * link still works.
 *
 * Verifies an `{ email, sponsorCode }` pair against Postgres and, if
 * the row is Active + visible, drops the same `sponsor_session` cookie
 * the magic-link callback uses.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { and, eq, sql } from 'drizzle-orm';
import { SESSION } from '@/lib/constants';
import { db } from '@/lib/db/client';
import { sponsorships } from '@/lib/db/schema';

interface SponsorData {
  sponsorCode: string;
  email: string;
  name: string;
}

async function verifySponsor(
  email: string,
  sponsorCode: string
): Promise<SponsorData | null> {
  // Case-insensitive email match. The sponsor_code is stored
  // exact-case (BAN-YYYY-NNN) so the eq() match is fine.
  const rows = await db
    .select({
      sponsorCode: sponsorships.sponsorCode,
      sponsorEmail: sponsorships.sponsorEmail,
      sponsorName: sponsorships.sponsorName,
      authStatus: sponsorships.authStatus,
      visibleToSponsor: sponsorships.visibleToSponsor,
    })
    .from(sponsorships)
    .where(
      and(
        sql`lower(${sponsorships.sponsorEmail}) = ${email.toLowerCase()}`,
        eq(sponsorships.sponsorCode, sponsorCode)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    console.log('[Verify] No sponsorship for', email, sponsorCode);
    return null;
  }

  // Mirror the legacy checks (AuthStatus=Active AND VisibleToSponsor).
  if (row.authStatus !== 'Active') {
    console.log('[Verify] AuthStatus not Active:', row.authStatus);
    return null;
  }
  if (row.visibleToSponsor !== true) {
    console.log('[Verify] VisibleToSponsor not true:', row.visibleToSponsor);
    return null;
  }

  return {
    sponsorCode: row.sponsorCode,
    email: row.sponsorEmail,
    name: row.sponsorName ?? '',
  };
}

export async function POST(request: NextRequest) {
  try {
    const { email, sponsorCode } = await request.json();

    if (!email || !sponsorCode) {
      return NextResponse.json(
        { error: 'Email and sponsor code are required' },
        { status: 400 }
      );
    }

    const sponsor = await verifySponsor(email, sponsorCode);

    if (!sponsor) {
      return NextResponse.json(
        { error: 'Invalid email or sponsor code, or sponsorship is not active' },
        { status: 401 }
      );
    }

    // Create session cookie (lifetime from SESSION.MAX_AGE_DAYS — 365)
    const cookieStore = await cookies();
    const expires = new Date();
    expires.setDate(expires.getDate() + SESSION.MAX_AGE_DAYS);

    const cookieValue = JSON.stringify({
      email: sponsor.email,
      sponsorCode: sponsor.sponsorCode,
      expires: expires.toISOString(),
    });

    cookieStore.set(SESSION.COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: true, // Always true for HTTPS (beanumber.org)
      sameSite: 'lax',
      expires,
      path: '/',
      // Do NOT set domain - let it default to current domain
    });

    console.log('[Verify] Session cookie set:', {
      email: sponsor.email,
      sponsorCode: sponsor.sponsorCode,
      expires: expires.toISOString(),
    });

    return NextResponse.json({
      success: true,
      sponsorCode: sponsor.sponsorCode,
      name: sponsor.name,
    });
  } catch (error: any) {
    console.error('[Sponsor Verify] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify sponsor' },
      { status: 500 }
    );
  }
}
