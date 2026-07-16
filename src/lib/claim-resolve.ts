/**
 * Shirt-number → claim-identity resolver, shared by every CLAIM path
 * (send-link first-time claim, claim-match cookie path).
 *
 * Why this exists: the claim endpoints used to call
 * getChildByShirtNumber() — a direct children.shirt_number row match.
 * Postgres has exactly one row per CANONICAL kid (numbers 1..53); the
 * Airtable-era per-number "cycle records" for 54+ never migrated. So
 * the kid PAGE happily rendered /children/230 via cycle math while
 * the claim path found no row and silently no-op'd behind the privacy
 * response. Every number past the canonical roster was unclaimable.
 *
 * This resolver mirrors the kid page's resolution exactly
 * (src/app/children/[number]/page.tsx):
 *
 *   1. n <= CANONICAL_ROSTER_MAX → direct row lookup. The row IS the
 *      kid; identity carries the real UUID + the row's legacy ChildID.
 *   2. n > CANONICAL_ROSTER_MAX → Batches cycle math
 *      (lib/cycle.resolveShirtToKid, snapshot entries are legacy
 *      ChildIDs) with the hardcoded era formula as a safety net —
 *      same fallback order as the page. The canonical kid supplies
 *      DISPLAY fields only; the claim identity is the synthetic
 *      per-number legacy id `HSP/BAN-0NN` with NO UUID, matching the
 *      page's synthesized cycle rows ("the privacy boundary: a
 *      sponsor of Isaiah (#15) must not be recognized on every cycle
 *      shirt that maps to #15").
 *
 * The returned identity is what gets written onto the sponsorship row
 * at claim time and what the kid page matches against at render time.
 */
import { CANONICAL_ROSTER_MAX } from '@/lib/roster-config';
import { resolveShirtToKid } from '@/lib/cycle';
import { canonicalShirtNumber } from '@/lib/mobile/shirt-cycle';
import { getChildByChildId, getChildByShirtNumber } from '@/lib/db/queries';

export interface ClaimIdentity {
  /** The shirt number being claimed — always the number the user typed. */
  shirtNumber: number;
  /** Children row UUID for canonical numbers; null for cycle numbers
   *  (no row exists — identity lives in the legacy id). */
  childUuid: string | null;
  /** Per-number legacy id. Canonical: the row's real ChildID.
   *  Cycle: synthetic `HSP/BAN-0NN`, same scheme the kid page uses
   *  for its synthesized cycle rows. */
  childIdLegacy: string;
  /** Display fields from the canonical kid (works for both paths). */
  displayName: string;
  firstName: string;
  /** True when the kid page would refuse this claim too. */
  reservedForAuction: boolean;
  /** The canonical children row backing the display fields. */
  canonicalRow: NonNullable<Awaited<ReturnType<typeof getChildByShirtNumber>>>;
}

/** Synthetic per-number legacy id — must match the kid page's
 *  synthesized `HSP/BAN-${pad3(N)}` cycle-row scheme exactly. */
export function legacyIdForShirtNumber(n: number): string {
  return `HSP/BAN-${String(n).padStart(3, '0')}`;
}

export async function resolveShirtNumberForClaim(
  shirtNumber: number
): Promise<ClaimIdentity | null> {
  if (!Number.isFinite(shirtNumber) || shirtNumber < 1) return null;

  // Canonical numbers: the row is the kid, claim carries the UUID.
  if (shirtNumber <= CANONICAL_ROSTER_MAX) {
    const row = await getChildByShirtNumber(shirtNumber);
    if (!row) return null;
    const displayName =
      row.displayName ||
      `${row.firstName || 'Child'} ${row.lastInitial || ''}`.trim();
    return {
      shirtNumber,
      childUuid: row.id,
      childIdLegacy: row.childId,
      displayName,
      firstName: row.firstName || displayName.split(' ')[0] || 'them',
      reservedForAuction: Boolean(row.reservedForAuction),
      canonicalRow: row,
    };
  }

  // Cycle numbers: Batches table first (source of truth, same as the
  // page), hardcoded era formula as the safety net.
  let canonical: Awaited<ReturnType<typeof getChildByChildId>> | null = null;
  try {
    const resolved = await resolveShirtToKid(shirtNumber);
    if (resolved?.childRecordId) {
      canonical = await getChildByChildId(resolved.childRecordId);
    }
  } catch (err) {
    console.warn('[claim-resolve] Batches resolver failed:', err);
  }
  if (!canonical) {
    const canonicalNum = canonicalShirtNumber(shirtNumber);
    if (canonicalNum) {
      canonical = await getChildByShirtNumber(canonicalNum);
    }
  }
  if (!canonical) return null;

  const displayName =
    canonical.displayName ||
    `${canonical.firstName || 'Child'} ${canonical.lastInitial || ''}`.trim();
  return {
    shirtNumber,
    childUuid: null,
    childIdLegacy: legacyIdForShirtNumber(shirtNumber),
    displayName,
    firstName: canonical.firstName || displayName.split(' ')[0] || 'them',
    reservedForAuction: Boolean(canonical.reservedForAuction),
    canonicalRow: canonical,
  };
}
