/**
 * Shirt-holder "one letter included with the shirt" enforcement.
 *
 * The letter template we ship in the shirt bag promises:
 *   "One letter out. One letter back. Included with the shirt.
 *    $25/month keeps you writing."
 *
 * Source of truth
 * ───────────────
 * The gate reads the kid_messages table directly, not a stamped
 * column on sponsorships. A holder is "available" to write iff they
 * have ZERO non-declined sponsor_to_kid messages for this kid.
 *
 * Why not a stamped column
 * ────────────────────────
 * The previous design (2026-07-10 morning) stamped
 * `sponsorships.included_letter_sent_at` on delivery. That created a
 * race: between the holder posting letter A and Simon marking it
 * delivered, the column stayed null, and a second POST during that
 * window would pass the gate. The 'one pending at a time' limiter
 * caught the fast-double-post case, but the moment A hit 'delivered'
 * a second POST could still slip in before the stamp write committed.
 * Kevin's rule: "no extra free letters. work perfectly."
 *
 * The message row itself is the atomic unit. Its insert is either
 * committed or not — no coordination window between "note exists"
 * and "cycle consumed."
 *
 * The `sponsorships.included_letter_sent_at` column is retained as an
 * audit trail (first delivery time). It is NOT read by the gate and
 * NOT used to make write decisions. It's fine if it lags or misses.
 *
 * Declined notes don't burn the cycle
 * ───────────────────────────────────
 * `direction = 'sponsor_to_kid' AND status != 'declined'` is the gate
 * predicate. If Simon declines a note, its row still exists but no
 * longer counts, so the holder can try again. This matches the
 * original design intent: the buyer isn't cheated by a decline.
 *
 * Public API
 * ──────────
 *   getViewerWriteStatus({sponsorEmail, childRecordId, childIdLegacy})
 *     — read-side, called from /children/[N] to decide UI branch.
 *
 *   stampHolderFirstLetterCycle({sponsorEmail, childRecordId, now})
 *     — write-side, called on 'delivered' transitions. Fills the
 *       audit column. Non-fatal, idempotent, does NOT gate.
 */

import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  sponsorships,
  children,
  kidMessages,
} from '@/lib/db/schema';

/**
 * Returns the sponsor's status against this kid, for gating:
 *   - 'monthly' — monthly sponsor of this kid (unlimited writing)
 *   - 'holder_available' — shirt-holder, has zero non-declined
 *     sponsor_to_kid messages for this kid.
 *   - 'holder_used' — shirt-holder, has at least one non-declined
 *     sponsor_to_kid message for this kid (pending / translated /
 *     delivered — all count against the free cycle).
 *   - 'none' — not a monthly sponsor, not a holder.
 *
 * Accepts either the kid's UUID (children.id) OR their legacy id
 * (children.child_id) — the sponsorships table has rows keyed by
 * either historically, so we OR both.
 */
export type ViewerWriteStatus =
  | 'monthly'
  | 'holder_available'
  | 'holder_used'
  | 'none';

export async function getViewerWriteStatus(args: {
  sponsorEmail: string;
  childRecordId: string;
  childIdLegacy?: string | null;
}): Promise<ViewerWriteStatus> {
  const email = args.sponsorEmail.trim().toLowerCase();
  if (!email) return 'none';

  const rows = await db
    .select({
      monthlyAmount: sponsorships.monthlyAmount,
      childRevealedAt: sponsorships.childRevealedAt,
      status: sponsorships.status,
    })
    .from(sponsorships)
    .where(
      and(
        sql`lower(${sponsorships.sponsorEmail}) = ${email}`,
        // Include both 'Active' and 'Holder' statuses. Fresh shirt
        // buyers get status='Holder' from webhook-bridge.ts:225 (no
        // monthly amount → 'Holder'; monthly amount → 'Active').
        // Missing 'Holder' here meant the entire included-letter
        // feature never fired for its target audience. Fixed after
        // audit 2026-07-10. Legacy $0-Active rows still work.
        inArray(sponsorships.status, ['Active', 'Holder']),
        or(
          eq(sponsorships.childId, args.childRecordId),
          args.childIdLegacy
            ? eq(sponsorships.childIdLegacy, args.childIdLegacy)
            : sql`false`
        )
      )
    );

  if (rows.length === 0) return 'none';

  // Monthly wins — if any row has a positive monthly amount, they're
  // a monthly sponsor and the cycle column is irrelevant.
  if (rows.some(r => Number(r.monthlyAmount ?? 0) > 0)) return 'monthly';

  // No monthly row. Check for a holder row (childRevealedAt set).
  if (!rows.some(r => !!r.childRevealedAt)) return 'none';

  // Holder — check if they've already used the cycle by looking at
  // kid_messages directly. Any non-declined sponsor_to_kid message
  // means the free cycle is spent.
  const used = await db
    .select({ id: kidMessages.id })
    .from(kidMessages)
    .where(
      and(
        sql`lower(${kidMessages.sponsorEmail}) = ${email}`,
        eq(kidMessages.childId, args.childRecordId),
        eq(kidMessages.direction, 'sponsor_to_kid'),
        ne(kidMessages.status, 'declined')
      )
    )
    .limit(1);

  return used.length > 0 ? 'holder_used' : 'holder_available';
}

/**
 * Audit-trail stamp. Called when a sponsor_to_kid note transitions
 * to 'delivered'. Two things to respect:
 *
 *   1. If the sponsor is a monthly sponsor of this kid, they're past
 *      the gate — nothing to stamp. Return silently.
 *   2. If the sponsor is a holder (childRevealedAt set) AND the column
 *      is currently null, stamp with `now`. Use COALESCE so a concurrent
 *      delivery doesn't clobber an earlier stamp.
 *
 * NOTE: This column is audit-only under the current design. The gate
 * itself reads kid_messages directly (see getViewerWriteStatus above),
 * so a missed stamp does NOT let a holder write a second free letter.
 * Non-fatal, safe to call repeatedly.
 */
export async function stampHolderFirstLetterCycle(args: {
  sponsorEmail: string;
  childRecordId: string;
  now: Date;
}): Promise<void> {
  const email = args.sponsorEmail.trim().toLowerCase();
  if (!email) return;

  try {
    // Look up the kid's legacy id so we can match holder rows keyed
    // by either FK shape (mirrors the pattern used in /api/sponsor/notes).
    const kidRow = (
      await db
        .select({ childId: children.childId })
        .from(children)
        .where(eq(children.id, args.childRecordId))
        .limit(1)
    )[0];
    const legacyId = kidRow?.childId || null;

    // Fetch all Active sponsorship rows for this pair.
    const rows = await db
      .select({
        id: sponsorships.id,
        monthlyAmount: sponsorships.monthlyAmount,
        childRevealedAt: sponsorships.childRevealedAt,
      })
      .from(sponsorships)
      .where(
        and(
          sql`lower(${sponsorships.sponsorEmail}) = ${email}`,
          // Include both 'Active' and 'Holder' statuses. Fresh shirt
        // buyers get status='Holder' from webhook-bridge.ts:225 (no
        // monthly amount → 'Holder'; monthly amount → 'Active').
        // Missing 'Holder' here meant the entire included-letter
        // feature never fired for its target audience. Fixed after
        // audit 2026-07-10. Legacy $0-Active rows still work.
        inArray(sponsorships.status, ['Active', 'Holder']),
          or(
            eq(sponsorships.childId, args.childRecordId),
            legacyId ? eq(sponsorships.childIdLegacy, legacyId) : sql`false`
          )
        )
      );

    if (rows.length === 0) return;

    // Monthly sponsor — nothing to stamp.
    if (rows.some(r => Number(r.monthlyAmount ?? 0) > 0)) return;

    // Find holder row. If missing, nothing to stamp.
    const holderRow = rows.find(r => !!r.childRevealedAt);
    if (!holderRow) return;

    // Idempotent stamp — first delivery wins.
    await db
      .update(sponsorships)
      .set({
        includedLetterSentAt: sql`COALESCE(${sponsorships.includedLetterSentAt}, ${args.now})`,
      })
      .where(eq(sponsorships.id, holderRow.id));
  } catch (err) {
    // Non-fatal — see docstring.
    console.warn(
      '[penpal-cycle] stampHolderFirstLetterCycle failed (non-fatal):',
      err instanceof Error ? err.message : String(err)
    );
  }
}
