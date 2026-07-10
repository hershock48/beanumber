/**
 * Shirt-holder "one letter included with the shirt" enforcement.
 *
 * The letter template we ship in the shirt bag promises:
 *   "One letter out. One letter back. Included with the shirt.
 *    $25/month keeps you writing."
 *
 * This module holds the two moving parts:
 *
 *   1. isHolderCycleAvailable(sponsorEmail, childId)
 *      — read-side check used by /children/[N] to decide whether a
 *        holder viewer should see the composer (cycle available) or
 *        the upgrade card (cycle used).
 *
 *   2. stampHolderFirstLetterCycle(sponsorEmail, childId, now)
 *      — write-side stamp fired when a sponsor's note transitions to
 *        'delivered'. Called from both the Simon "Mark delivered" PATCH
 *        and the reply POST's auto-flip. No-op for monthly sponsors
 *        (they're past the gate; nothing to stamp).
 *
 * Both are idempotent + safe to call repeatedly.
 */

import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sponsorships, children } from '@/lib/db/schema';

/**
 * Returns the sponsor's status against this kid, for gating:
 *   - 'monthly' — monthly sponsor of this kid (unlimited writing)
 *   - 'holder_available' — shirt-holder, hasn't used the free letter yet
 *   - 'holder_used' — shirt-holder, already used the free letter
 *   - 'none' — not a monthly sponsor, not a holder
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
      includedLetterSentAt: sponsorships.includedLetterSentAt,
      status: sponsorships.status,
    })
    .from(sponsorships)
    .where(
      and(
        sql`lower(${sponsorships.sponsorEmail}) = ${email}`,
        eq(sponsorships.status, 'Active'),
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
  const monthly = rows.find(r => Number(r.monthlyAmount ?? 0) > 0);
  if (monthly) return 'monthly';

  // No monthly row. Check for a holder row (childRevealedAt set).
  const holder = rows.find(r => !!r.childRevealedAt);
  if (!holder) return 'none';

  return holder.includedLetterSentAt ? 'holder_used' : 'holder_available';
}

/**
 * Idempotent stamp of the holder's included-letter cycle. Called when
 * a sponsor_to_kid note transitions to 'delivered'. Two things to
 * respect:
 *
 *   1. If the sponsor is a monthly sponsor of this kid, they're past
 *      the gate — nothing to stamp. Return silently.
 *   2. If the sponsor is a holder (childRevealedAt set) AND the column
 *      is currently null, stamp with `now`. Use COALESCE so a concurrent
 *      delivery doesn't clobber an earlier stamp.
 *
 * Never throws — non-fatal. If the DB blip stops the stamp, the worst
 * case is the holder writes a second free letter, which is a small
 * business loss (one extra Simon-hour) that's absorbable.
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
          eq(sponsorships.status, 'Active'),
          or(
            eq(sponsorships.childId, args.childRecordId),
            legacyId ? eq(sponsorships.childIdLegacy, legacyId) : sql`false`
          )
        )
      );

    if (rows.length === 0) return;

    // Monthly sponsor — nothing to stamp.
    if (rows.some(r => Number(r.monthlyAmount ?? 0) > 0)) return;

    // Find holder row. If missing, nothing to stamp (shouldn't happen —
    // a delivered note implies write access was granted, which requires
    // either monthly or holder-with-available-cycle).
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
