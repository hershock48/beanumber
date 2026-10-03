/**
 * Signed kid-page links for penpal emails.
 *
 * The "A penpal letter from {kid}" and "Your note reached {kid}"
 * emails used to link to a bare /children/[N]. That page only shows
 * the letter thread to a signed-in sponsor or holder, and the
 * sponsor_session cookie is per browser. A sponsor who opens the
 * email on their phone, in a different browser, or after the cookie
 * expired lands on the public kid page with no letter anywhere on it
 * (Leslie, 2026-10-03: "When I click the link to read Elvis's letter,
 * I do not see it").
 *
 * The newsletter solved the same problem in May: mint an HMAC token
 * for the sponsor's row and route the click through
 * /api/sponsor/recover/callback, which drops the cookie and redirects
 * to the kid page signed in. This helper does that for the penpal
 * emails and carries the #note-<id> anchor through the redirect so
 * the browser still lands on the letter itself.
 *
 * Falls back to the bare link when there is no sponsorship row to
 * sign (shouldn't happen for a note that reached the queue, but the
 * email must still go out) or when CRON_SECRET is unset outside prod.
 */

import {
  findSponsorshipForEmailAndChild,
  getMostRecentSponsorshipForEmail,
} from '@/lib/db/queries';
import { makeRecoveryToken } from '@/lib/recovery-tokens';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

// Same 30-day window the newsletter links use. People open these
// emails days later; a dead link here is the exact failure this file
// exists to remove.
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function signedKidPageUrl(args: {
  sponsorEmail: string;
  child: { id: string | null; childId: string | null; shirtNumber: number | null };
  /** DOM id on the kid page to land on, e.g. `note-<uuid>`. */
  anchor?: string | null;
}): Promise<string> {
  const { sponsorEmail, child, anchor } = args;
  const hash = anchor && /^[A-Za-z0-9_-]{1,80}$/.test(anchor) ? `#${anchor}` : '';
  const bare = child.shirtNumber
    ? `${SITE_URL}/children/${child.shirtNumber}${hash}`
    : `${SITE_URL}/me`;

  let sponsorCode: string | null = null;
  let landingNumber: number | null = child.shirtNumber;
  try {
    // This kid's own row first (canonical uuid OR legacy id), then
    // any row the email owns. A cycle-number holder (#70 for a kid
    // whose canonical number is #36) only matches the second path,
    // and their claimed number is the one they should land on.
    const own = await findSponsorshipForEmailAndChild(sponsorEmail, {
      id: child.id ?? '',
      childId: child.childId ?? '',
    });
    if (own) {
      sponsorCode = own.sponsorCode;
      landingNumber = own.claimedShirtNumber ?? child.shirtNumber;
    } else {
      const any = await getMostRecentSponsorshipForEmail(sponsorEmail);
      if (any) {
        sponsorCode = any.sponsorCode;
        landingNumber = child.shirtNumber ?? any.shirtNumber ?? null;
      }
    }
  } catch (err) {
    console.warn(
      '[penpal-links] sponsorship lookup failed, sending bare link:',
      err instanceof Error ? err.message : String(err)
    );
  }
  if (!sponsorCode) return bare;

  try {
    const token = makeRecoveryToken(sponsorCode, landingNumber, TOKEN_TTL_SECONDS);
    const a = hash ? `&a=${encodeURIComponent(hash.slice(1))}` : '';
    return `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}${a}`;
  } catch (err) {
    // CRON_SECRET missing (local / preview). Bare link still works
    // for anyone whose cookie is alive.
    console.warn(
      '[penpal-links] token signing unavailable, sending bare link:',
      err instanceof Error ? err.message : String(err)
    );
    return bare;
  }
}
