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
const DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Recategorize-on-claim. When a user signs in via magic link they&rsquo;ve
 * just engaged with their kid&rsquo;s page — they obviously received the
 * shirt, found the number, and went through the claim flow. Whatever
 * stage of the drip they were on, the "did it arrive?" and "have
 * you met your kid yet?" emails are now obsolete.
 *
 * Rule:
 *   shirt_nurture or shirt_sponsor at stage 0 or 1 → bump to stage 2
 *     (the sponsorship-pitch / sponsor-onboarding email)
 *   no pipeline (Donorbox import, manual donor, etc.) → enroll in
 *     shirt_nurture at stage 2 directly. The sign-in event proves
 *     they&rsquo;re a shirt buyer who&rsquo;s past the early touches.
 *   sponsor_onboard / donor_convert / monthly_donor → no change,
 *     their sequence doesn&rsquo;t have pre-claim touches to skip.
 *
 * DripNextSend gets reset to today + 5 so we don&rsquo;t hit them with the
 * pitch right after sign-in. Quiet space, then the ask.
 *
 * Fire-and-forget: we never block the redirect on this PATCH. Sign-in
 * UX comes first; if Airtable is slow we&rsquo;d rather miss a re-stage
 * than leave the user staring at a spinner.
 */
async function advanceDripOnClaim(email: string): Promise<void> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return;
  try {
    const safeEmail = email.toLowerCase().replace(/"/g, '\\"');
    const formula = encodeURIComponent(`LOWER({Email Address})="${safeEmail}"`);
    const lookupRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        DONORS_TABLE
      )}?filterByFormula=${formula}&maxRecords=1`,
      { headers: atHeaders(), cache: 'no-store' }
    );
    if (!lookupRes.ok) return;
    const data = await lookupRes.json();
    const donor = data.records?.[0];
    if (!donor) return;

    const pipeline = (donor.fields?.DripPipeline as string) || '';
    const stage = (donor.fields?.DripStage as number | undefined) ?? 0;

    // Decide the patch.
    const patchFields: Record<string, unknown> = {};
    if (!pipeline) {
      patchFields.DripPipeline = 'shirt_nurture';
      patchFields.DripStage = 2;
    } else if (
      (pipeline === 'shirt_nurture' || pipeline === 'shirt_sponsor') &&
      stage < 2
    ) {
      patchFields.DripStage = 2;
    } else {
      // Already past the pre-claim touches, or in a pipeline whose
      // touches are still relevant. No change.
      return;
    }

    // Give them 5 days of quiet before the next email. They just
    // engaged; no need to immediately ask them for more.
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 5);
    patchFields.DripNextSend = next.toISOString().split('T')[0];

    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        DONORS_TABLE
      )}/${donor.id}`,
      {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({ fields: patchFields }),
      }
    );
  } catch (err) {
    console.warn('[Recovery] Drip advance failed (non-fatal):', err);
  }
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

  // Re-stage the donor's drip pipeline now that they've engaged.
  // Fire-and-forget — never block the redirect on this PATCH.
  advanceDripOnClaim(email).catch(err => {
    console.warn('[Recovery] advanceDripOnClaim threw:', err);
  });

  // ?just_signed_in=1 lets the kid page distinguish "first sign-in"
  // from "returning visit." First-time claimers see "You own #N now";
  // returning sponsors see "Welcome back." The kid page reads the
  // param and renders accordingly.
  return NextResponse.redirect(
    `${SITE_URL}/children/${shirtNumber}?just_signed_in=1`
  );
}
