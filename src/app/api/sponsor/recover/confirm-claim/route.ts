/**
 * Confirm a SECOND claim from the inbox.
 *
 * send-link holds off minting when an email that already holds a
 * number types a different one with no purchase trail behind it (see
 * src/lib/claim-guard.ts). The confirmation email carries a signed
 * claim token on its "Yes, claim #N" button; that button lands here.
 * The tap from the inbox is the proof that the real owner of the
 * email, shirt in hand, meant the number they typed.
 *
 * Same checks as the send-link claim path, re-run at tap time because
 * up to 24 hours may have passed:
 *
 *   1. Verify the token (signature, kind, expiry).
 *   2. Resolve the number (canonical row <= 53, Batches cycle math
 *      54+); reserved numbers and unknown numbers bounce to /signin.
 *   3. Already theirs (claimed in the meantime, say from the app)?
 *      Sign them in, write nothing.
 *   4. Claimed by someone else in the meantime? Bounce to /signin
 *      with error=number_claimed, write nothing.
 *   5. Otherwise bind a childless checkout row or mint a Holder row
 *      (src/lib/claim-number.ts), same write as send-link.
 *
 * Then hand off to the recovery callback with a fresh recovery token
 * so the cookie, drip re-stage, and landing redirect live in one
 * place. Every outcome is logged with the ATTENTION tag so the
 * guard's warn line in send-link has a matching answer in the logs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { makeRecoveryToken, verifyClaimConfirmToken } from '@/lib/recovery-tokens';
import {
  findSponsorshipForEmailAndChild,
  findSponsorshipForEmailAndClaimedNumber,
  isNumberClaimedByOtherEmail,
} from '@/lib/db/queries';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';
import { bindOrCreateHolderClaim } from '@/lib/claim-number';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
const LOG = '[Recovery:confirm-claim]';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  const verified = verifyClaimConfirmToken(token);
  if (!verified) {
    return NextResponse.redirect(`${SITE_URL}/signin?error=expired`);
  }
  const { email, shirtNumber } = verified;

  try {
    const identity = await resolveShirtNumberForClaim(shirtNumber);
    if (!identity || identity.reservedForAuction) {
      console.warn(
        `${LOG} ATTENTION #${shirtNumber} no longer resolves or is reserved; ${email} bounced.`
      );
      return NextResponse.redirect(`${SITE_URL}/signin?error=unavailable`);
    }
    const childContext = {
      id: identity.childUuid ?? '',
      childId: identity.childIdLegacy,
    };

    const existing =
      (await findSponsorshipForEmailAndClaimedNumber(email, shirtNumber)) ??
      (await findSponsorshipForEmailAndChild(email, childContext));
    let sponsorCode = existing?.sponsorCode ?? null;

    if (!sponsorCode) {
      const alreadyTaken = await isNumberClaimedByOtherEmail(
        shirtNumber,
        identity.childUuid ? null : identity.childIdLegacy,
        email
      );
      if (alreadyTaken) {
        console.warn(
          `${LOG} ATTENTION #${shirtNumber} was claimed by someone else before ${email} confirmed; nothing written.`
        );
        return NextResponse.redirect(
          `${SITE_URL}/signin?error=number_claimed&n=${shirtNumber}`
        );
      }
      const written = await bindOrCreateHolderClaim(email, identity, LOG);
      sponsorCode = written.sponsorCode;
      console.warn(
        `${LOG} ATTENTION second claim CONFIRMED from inbox: ${email} now holds #${shirtNumber} via ${written.via} (${sponsorCode}).`
      );
    } else {
      console.log(
        `${LOG} #${shirtNumber} already belongs to ${email} (${sponsorCode}); signing in.`
      );
    }

    const recovery = makeRecoveryToken(sponsorCode, shirtNumber);
    return NextResponse.redirect(
      `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(recovery)}`
    );
  } catch (err) {
    console.error(`${LOG} ATTENTION failed for ${email} #${shirtNumber}:`, err);
    return NextResponse.redirect(`${SITE_URL}/signin?error=unavailable`);
  }
}
