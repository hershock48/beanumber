/**
 * Sponsor recovery callback — clicked from the magic-link email.
 *
 * Validates the signed token, resolves the sponsor's email from
 * Postgres (so the cookie we drop matches the format the rest of the
 * app expects), sets a 365-day sponsor_session cookie (length lives in
 * SESSION.MAX_AGE_DAYS), and lands the user directly on their kid's
 * page, signed in.
 *
 * Failure modes — bad signature, expired token, missing sponsorship —
 * all redirect to /signin with a soft error, so a user with a dead
 * link still has a clear way back in.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';
import { verifyRecoveryToken } from '@/lib/recovery-tokens';
import { getSponsorshipEmailByCode } from '@/lib/db/queries';
import { advanceDripOnClaim } from '@/lib/db/mutations';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('t');

  const verified = verifyRecoveryToken(token);
  if (!verified) {
    return NextResponse.redirect(`${SITE_URL}/signin?error=expired`);
  }
  const { sponsorCode, shirtNumber } = verified;

  const email = await getSponsorshipEmailByCode(sponsorCode);
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
  expires.setDate(expires.getDate() + SESSION.MAX_AGE_DAYS);
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

  // Re-stage the donor's drip pipeline now that they've engaged.
  // Fire-and-forget — never block the redirect on the mutation.
  advanceDripOnClaim(email).catch(err => {
    console.warn('[Recovery] advanceDripOnClaim threw:', err);
  });

  // If the token carries a real shirt number, deep-link STRAIGHT to
  // the kid's page, signed in. The email button promises "Open
  // {Kid}'s page" — for a while this redirect landed on the homepage
  // with the Number prefilled instead (the "gateway ritual"), which
  // meant two extra taps after an email round-trip and a button that
  // didn't do what it said. The ritual is right for organic entry
  // (typing the number off the shirt at the homepage); after a
  // magic-link click it's friction. just_signed_in=1 drives the kid
  // page's "Welcome / #N is yours" viewer-state strip.
  //
  // shirtNumber === 0 is the "no landing kid yet" sentinel — used
  // for backfilled Holder rows whose stockpile shirt hasn't been
  // reconciled to a specific kid number. Send those users to /me
  // so they land in a valid signed-in state (their kid card will
  // appear there once Kevin assigns a number to their fulfillment).
  if (!shirtNumber || shirtNumber <= 0) {
    return NextResponse.redirect(`${SITE_URL}/me?welcome=1`);
  }
  return NextResponse.redirect(
    `${SITE_URL}/children/${shirtNumber}?just_signed_in=1`
  );
}
