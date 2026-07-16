/**
 * Persist the buyer-session cookie server-side.
 *
 * The /shirts/success page used to set `ban_buyer_session` with
 * `document.cookie` and a 90-day max-age. That worked everywhere
 * except the browser most shirt buyers actually use: Safari's ITP
 * caps any cookie written from JavaScript at 7 DAYS, regardless of
 * the max-age you ask for. Shirts take longer than a week to press
 * and ship, so by the time an iPhone buyer came back to claim their
 * number, the cookie tying their browser to the purchase was gone —
 * which silently killed the one-tap ClaimMatchCard and the saved-
 * payment-method sponsor checkout for the whole iOS cohort.
 *
 * Cookies set via an HTTP response (this route) are not subject to
 * that cap. The success page now POSTs the Stripe Checkout Session ID
 * here and we set the cookie properly: httpOnly (every consumer reads
 * it server-side via cookies() — no client JS ever needs it), secure,
 * lax, 90 days.
 *
 * Security posture is unchanged from the document.cookie version: the
 * session ID is a bearer-ish reference, not a credential. The
 * claim-match endpoint independently verifies it resolves to a real
 * Donation of the right shape before trusting it. Validating the
 * `cs_` prefix + charset here keeps junk out of the cookie jar.
 */
import { NextRequest, NextResponse } from 'next/server';

const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  let sessionId: unknown;
  try {
    const body = await request.json();
    sessionId = body?.sessionId;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (
    typeof sessionId !== 'string' ||
    !/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)
  ) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('ban_buyer_session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: NINETY_DAYS_SECONDS,
    path: '/',
  });
  return response;
}
