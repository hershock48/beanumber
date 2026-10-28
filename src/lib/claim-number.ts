/**
 * Bind-or-create for a web claim: the write half of "this email now
 * owns this number." Shared by the send-link claim path and the
 * confirm-claim callback so the two can never drift.
 *
 * Order of operations (unchanged from the send-link route this was
 * lifted out of on 2026-10-28):
 *
 *   1. BIND. Checkout creates cart+monthly / Shirt + Stay sponsorships
 *      with a blank child link (core_model.md §0: the buyer claims,
 *      nobody matches). If this email has one of those rows, THIS
 *      claim is the moment it gets its kid. Binding keeps status,
 *      monthly amount, and the Stripe sub on one row. Creating a
 *      Holder row here instead is how paying sponsors were ending
 *      up rendered as $0 Holders on their own kid.
 *   2. CREATE. No childless row: mint a Holder row for the number.
 *
 * A bind failure (row raced away, concurrent claim, DB error) logs
 * and falls through to create: a duplicate row is recoverable by
 * hand; a user with no way in is not. A create failure throws; the
 * caller decides what the user sees.
 *
 * Callers are responsible for the checks BEFORE this runs: the number
 * is not already held by this email (that is sign-in, not a claim),
 * it is not claimed by another email, and the second-claim guard
 * (src/lib/claim-guard.ts) has either passed or been confirmed from
 * the inbox.
 */
import type { ClaimIdentity } from '@/lib/claim-resolve';
import { findChildlessSponsorshipForEmail } from '@/lib/db/queries';
import { bindSponsorshipToChild, createSponsorship } from '@/lib/db/mutations';
import { generateUniqueSponsorCode } from '@/lib/sponsor-codes';

export interface ClaimWriteResult {
  sponsorCode: string;
  via: 'bind' | 'create';
}

export async function bindOrCreateHolderClaim(
  email: string,
  identity: ClaimIdentity,
  logPrefix = '[Recovery]'
): Promise<ClaimWriteResult> {
  const shirtNumber = identity.shirtNumber;

  // 1. BIND PATH.
  try {
    const childless = await findChildlessSponsorshipForEmail(email);
    if (childless) {
      const bound = await bindSponsorshipToChild({
        sponsorshipId: childless.id,
        childId: identity.childUuid,
        childIdLegacy: identity.childIdLegacy,
        childDisplayName: identity.displayName,
        claimedShirtNumber: shirtNumber,
        actorType: 'sponsor',
      });
      console.log(
        `${logPrefix} Bound childless ${childless.status} sponsorship`,
        bound.sponsorCode,
        `to #${shirtNumber} for`,
        email
      );
      return { sponsorCode: bound.sponsorCode, via: 'bind' };
    }
  } catch (err) {
    console.error(
      `${logPrefix} Childless-bind failed for ${email} on #${shirtNumber}, falling back to Holder create:`,
      err
    );
  }

  // 2. CREATE PATH.
  const created = await createSponsorship({
    sponsorCode: await generateUniqueSponsorCode(),
    sponsorEmail: email,
    childId: identity.childUuid,
    childIdLegacy: identity.childIdLegacy,
    childDisplayName: identity.displayName,
    monthlyAmount: 0,
    status: 'Holder',
    sponsorshipStartDate: new Date().toISOString().slice(0, 10),
    claimedShirtNumber: shirtNumber,
    actorType: 'sponsor',
  });
  // The legacy Airtable Holder row set AuthStatus=Active so the
  // deprecated email+code verify path still recognized it. The
  // createSponsorship helper doesn't take authStatus directly; patch
  // it in a follow-up. Non-fatal on failure: the magic-link sign-in
  // path doesn't check authStatus.
  try {
    const { db } = await import('@/lib/db/client');
    const { sponsorships } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    await db
      .update(sponsorships)
      .set({ authStatus: 'Active', updatedAt: new Date() })
      .where(eq(sponsorships.id, created.id));
  } catch (patchErr) {
    console.warn(
      `${logPrefix} Holder authStatus patch failed (non-fatal):`,
      patchErr
    );
  }
  console.log(
    `${logPrefix} Created Holder sponsorship:`,
    created.sponsorCode,
    'for',
    email
  );
  return { sponsorCode: created.sponsorCode, via: 'create' };
}
