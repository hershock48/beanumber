/**
 * Sponsor recovery callback — clicked from the magic-link email.
 *
 * Validates the signed token, resolves the sponsor's email from
 * Airtable (so the cookie we drop matches the format the rest of the
 * app expects), sets a 30-day sponsor_session cookie, and redirects
 * the user back to /children/[number] in authenticated mode.
 *
 * Failure modes — bad signature, expired token, missing sponsorship —
 * all redirect to /sponsor/login with a soft error, so a user with a
 * dead link still has a clear way back in.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';
import { verifyRecoveryToken } from '@/lib/recovery-tokens';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function resolveSponsorshipEmail(sponsorCode: string): Promise<string | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  try {
    // Look up the email for an Active sponsor OR a Holder (shirt-only
    // owner). Previously this only checked Status=Active, which meant
    // first-time claimers (Status=Holder) failed verification and got
    // bounced to /sponsor/login with no error visible to them.
    const formula = encodeURIComponent(
      `AND({SponsorCode}="${sponsorCode.replace(/"/g, '\\"')}", OR({Status}="Active",{Status}="Holder"))`
    );
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}?filterByFormula=${formula}&maxRecords=1`,
      { headers: atHeaders(), cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const email = data.records?.[0]?.fields?.SponsorEmail;
    return typeof email === 'string' ? email : null;
  } catch (err) {
    console.warn('[Recovery] Email resolve failed', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('t');

  const verified = verifyRecoveryToken(token);
  if (!verified) {
    return NextResponse.redirect(
      `${SITE_URL}/signin?error=expired`
    );
  }
  const { sponsorCode, shirtNumber } = verified;

  const email = await resolveSponsorshipEmail(sponsorCode);
  if (!email) {
    // Token was valid but the underlying Sponsorship has gone away —
    // canceled, archived, or the sponsor code rotated. Bounce to
    // /signin with a generic message rather than 500'ing.
    return NextResponse.redirect(`${SITE_URL}/signin?error=unavailable`);
  }

  // Drop the sponsor_session cookie in the same JSON shape that
  // /api/sponsor/verify uses, so all existing reads continue to work.
  const cookieStore = await cookies();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  cookieStore.set(
    SESSION.COOKIE_NAME,
    JSON.stringify({
      email,
      sponsorCode,
      expires: expires.toISOString(),
    }),
    {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expires,
      path: '/',
    }
  );

  return NextResponse.redirect(`${SITE_URL}/children/${shirtNumber}`);
}
