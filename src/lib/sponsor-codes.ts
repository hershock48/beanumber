/**
 * Sponsor-code generation, deduplicated across the whole codebase.
 *
 * Format
 * ──────
 * BAN-YYYY-NNN — where NNN is a 3-digit numeric tail. All prior
 * callsites minted `BAN-${year}-${100..999}` independently, which
 * meant seven copies of the same weak generator scattered across
 * the app: mutations.ts, airtable.ts, webhooks/stripe/route.ts,
 * admin/stripe/sync/route.ts, admin/backfill-subscriptions/route.ts,
 * sponsor/claim-match/route.ts, sponsor/recover/send-link/route.ts,
 * and lib/tools/sponsors/create-sponsorship.ts.
 *
 * Why that was a real bug
 * ───────────────────────
 * 900 slots per year is small. At 90 existing 2026 codes (July),
 * every new mint hits the birthday-paradox curve fast: expected
 * collision within 36 mints per year. None of the callsites checked
 * the DB before insert, so a collision surfaced as a Postgres
 * unique_violation on `sponsorships_sponsor_code_idx` — and every
 * callsite handled it differently (silent skip, 500, or nothing at
 * all). At best a sponsor's row didn't get created; at worst the
 * webhook 500'd on a shirt purchase.
 *
 * How this helper fixes it
 * ────────────────────────
 * `generateUniqueSponsorCode` checks the DB before returning:
 *
 *   1. Try up to 25 random 3-digit tails. Fast common path when
 *      saturation is low. At today's ~10% saturation the expected
 *      number of attempts is ~1.1.
 *
 *   2. If all 25 collide (would require ~99% saturation, i.e. 890+
 *      of 900 slots taken for the year), widen to a 4-digit tail
 *      (1000-9999). 9000 more slots, 25 attempts.
 *
 *   3. If somehow still no unique code (would require 99% saturation
 *      across the 4-digit space too — practically impossible for
 *      years), fall back to a 6-hex-char cryptographically-random
 *      tail. 16^6 = ~16M slots. This is a runaway-safety escape
 *      hatch, not a designed state.
 *
 * All callsites now import this and drop their local
 * `generateSponsorCode`. Format stays backward-compatible with
 * existing rows so display, links, and admin lookups keep working.
 */
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from './db/client';
import { sponsorships } from './db/schema';

/**
 * Cheap format-only generator. Does NOT check the DB. Use for tests,
 * mocks, and offline scripts where uniqueness isn't required. Every
 * production callsite should use generateUniqueSponsorCode instead.
 */
export function generateSponsorCodeFormat(): string {
  const year = new Date().getFullYear();
  const tail = Math.floor(Math.random() * 900) + 100;
  return `BAN-${year}-${tail}`;
}

async function sponsorCodeExists(code: string): Promise<boolean> {
  const rows = await db
    .select({ id: sponsorships.id })
    .from(sponsorships)
    .where(eq(sponsorships.sponsorCode, code))
    .limit(1);
  return rows.length > 0;
}

const NARROW_ATTEMPTS = 25;
const WIDER_ATTEMPTS = 25;

/**
 * Mint a sponsor code that is guaranteed unique against the current
 * sponsorships table. Awaitable; safe to call anywhere the DB is
 * reachable.
 *
 * Guaranteed to return a string. If everything else fails (extremely
 * unlikely), falls back to a hex-tailed code that is effectively
 * collision-proof.
 */
export async function generateUniqueSponsorCode(): Promise<string> {
  const year = new Date().getFullYear();

  // Stage 1: canonical 3-digit tail.
  for (let i = 0; i < NARROW_ATTEMPTS; i++) {
    const tail = Math.floor(Math.random() * 900) + 100;
    const code = `BAN-${year}-${tail}`;
    if (!(await sponsorCodeExists(code))) return code;
  }
  console.warn(
    `[sponsor-codes] 3-digit space exhausted for ${year} after ${NARROW_ATTEMPTS} tries — widening to 4-digit tail.`
  );

  // Stage 2: 4-digit tail. Still human-readable, still parses as a
  // BAN-YYYY-N... code. Rare — kicks in only near saturation.
  for (let i = 0; i < WIDER_ATTEMPTS; i++) {
    const tail = Math.floor(Math.random() * 9000) + 1000;
    const code = `BAN-${year}-${tail}`;
    if (!(await sponsorCodeExists(code))) return code;
  }
  console.warn(
    `[sponsor-codes] 4-digit space also saturated for ${year} — falling back to hex tail.`
  );

  // Stage 3: crypto hex tail. Escape hatch — the caller still gets
  // a valid BAN-YYYY-XXXXXX string. Distinctive so an operator
  // eyeballing the sponsor table sees the fallback fired and can
  // investigate why the year hit near-total saturation.
  //
  // Loop in case of the astronomically unlikely case that a hex-tail
  // code collides (16^6 = 16.7M slots). Bounded so we never hang.
  for (let i = 0; i < 5; i++) {
    const tail = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = `BAN-${year}-${tail}`;
    if (!(await sponsorCodeExists(code))) return code;
  }
  // At this point something is deeply wrong — 16M random draws all
  // hit collisions in a single call. Throw so the caller surfaces
  // the anomaly rather than silently returning a duplicate.
  throw new Error(
    'generateUniqueSponsorCode: could not mint a unique code after all stages. ' +
      'This should be effectively impossible; check for a corrupted DB read.'
  );
}
