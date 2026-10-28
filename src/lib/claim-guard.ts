/**
 * Second-claim guard for the number-supplied claim path.
 *
 * The question this answers: an email that ALREADY holds a shirt
 * number has typed a DIFFERENT number into sign-in. Is that a second
 * shirt, or a typo?
 *
 * Why it exists (2026-09-23): a sponsor who holds #230 signed in with
 * a typed number and the site minted a second Holder row on #260 for
 * her email, with no purchase behind it. That row made email-only
 * sign-in land her on the wrong kid, and it would have blocked the
 * real holder of #260 from claiming (number_claimed).
 *
 * What stays open on purpose (CLAUDE.md non-negotiable 1: the buyer
 * claims, Kevin never assigns; holders are real):
 *
 *   - FIRST claim from an email that holds nothing. Gift shirts, a
 *     spouse's email, found shirts, pre-cutover buyers. No guard.
 *   - A second shirt with a PURCHASE TRAIL: a fulfillment under this
 *     email whose order_number is the typed number. No guard.
 *   - A second shirt WITHOUT a trail (order_number not stamped yet,
 *     bought under another email). Not blocked. The route sends a
 *     confirmation email instead of minting; the owner of the inbox
 *     taps "yes, claim it" and the claim goes through.
 *
 * Only the last case changes: the row is minted after an explicit
 * tap from the inbox instead of on the first keystroke. A typo'd
 * number never becomes a row, and the browser response stays the
 * same { success: true } so nothing leaks about the email.
 *
 * Pure function, no imports: testable without a database.
 */

export interface SecondClaimInput {
  /** The number the person typed. */
  typedNumber: number;
  /** claimed_shirt_number on every Active/Holder row for this email.
   *  Co-sponsor rows (added via /meet) carry NULL there and must NOT
   *  be passed; holding a relationship is not holding a number. */
  heldNumbers: number[];
  /** fulfillments.order_number for every shirt bought under this
   *  email. NULL entries are unreconciled shirts and prove nothing
   *  about which number they carry. */
  fulfillmentNumbers: Array<number | null | undefined>;
  /** True only on the confirm-claim callback, after the inbox tap. */
  confirmed: boolean;
}

export type SecondClaimDecision =
  | {
      outcome: 'proceed';
      reason: 'first_claim' | 'already_held' | 'purchase_trail' | 'confirmed';
    }
  | { outcome: 'confirm'; reason: 'held_other_number' };

export function decideSecondClaim(input: SecondClaimInput): SecondClaimDecision {
  const typed = input.typedNumber;
  const held = input.heldNumbers.filter(
    n => typeof n === 'number' && Number.isFinite(n) && n > 0
  );

  if (held.length === 0) {
    return { outcome: 'proceed', reason: 'first_claim' };
  }
  if (held.includes(typed)) {
    // Sign-in, not a claim. The route's fast path normally catches
    // this before we are called; harmless to answer it again.
    return { outcome: 'proceed', reason: 'already_held' };
  }
  if (input.confirmed) {
    return { outcome: 'proceed', reason: 'confirmed' };
  }
  const hasTrail = input.fulfillmentNumbers.some(
    n => typeof n === 'number' && n === typed
  );
  if (hasTrail) {
    return { outcome: 'proceed', reason: 'purchase_trail' };
  }
  return { outcome: 'confirm', reason: 'held_other_number' };
}
