/**
 * One-off cleanup: eliminate duplicate children rows so roster updates
 * propagate to every shirt number that maps to a kid via the Batches
 * cycle math.
 *
 * Background
 * ──────────
 * Historically the children table had extra rows in the > 53 range
 * that were full copies of a canonical kid's row (e.g. Marvin at #2
 * AND #106). /children/[N] used to try a direct row lookup first, so
 * visits to #106 read the STALE duplicate row rather than resolving
 * via Batches → canonical Marvin. Simon's edits + Kevin's approvals
 * wrote to the canonical row, never to the duplicate — so the duplicate
 * shirt-number pages served frozen snapshots.
 *
 * What this script does
 * ─────────────────────
 * For every "duplicate" (a children row whose displayName matches a
 * lower-numbered canonical row, both within/past the canonical range):
 *
 *   1. Migrate every FK pointing at the duplicate → point at canonical.
 *      Tables migrated:
 *        - sponsorships.child_id
 *        - donation_children.child_id
 *        - child_updates.child_id
 *   2. Delete the duplicate row.
 *
 * After this cleanup + the accompanying code change (getChildByShirtNumber
 * prefers cycle math for shirt_number > canonical_max), updates to a
 * canonical kid automatically show up on every shirt number that maps
 * to them.
 *
 * Usage
 * ─────
 *   tsx scripts/fix-roster-propagation.ts          # dry-run
 *   tsx scripts/fix-roster-propagation.ts --apply  # write
 *
 * Idempotent — re-running after --apply finds nothing to do.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db/client';

const APPLY = process.argv.includes('--apply');

interface DuplicateRow {
  dupe_id: string;
  dupe_shirt_number: number;
  canonical_id: string;
  canonical_shirt_number: number;
  display_name: string;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write to Postgres)' : 'DRY RUN (no writes)'}\n`);

  // 1. Find every duplicate. A "canonical" row is the one with the
  //    lowest shirt_number for a given displayName. Every other row
  //    with the same name is a duplicate.
  const dupes = (await db.execute(sql`
    WITH canonicals AS (
      SELECT DISTINCT ON (display_name)
        id AS canonical_id,
        display_name,
        shirt_number AS canonical_shirt
      FROM children
      WHERE display_name IS NOT NULL
        AND shirt_number IS NOT NULL
      ORDER BY display_name, shirt_number
    )
    SELECT
      d.id::text AS dupe_id,
      d.shirt_number AS dupe_shirt_number,
      c.canonical_id::text AS canonical_id,
      c.canonical_shirt AS canonical_shirt_number,
      d.display_name
    FROM children d
    JOIN canonicals c ON c.display_name = d.display_name
    WHERE d.id <> c.canonical_id
      AND d.shirt_number IS NOT NULL
    ORDER BY d.display_name, d.shirt_number
  `)) as unknown as DuplicateRow[];

  console.log(`Found ${dupes.length} duplicate rows to clean up.\n`);

  if (dupes.length === 0) {
    console.log('Nothing to do — canonical roster is clean. Done.');
    process.exit(0);
  }

  // 2. For each duplicate, count FKs pointing at it in each table.
  let totalSponsorships = 0;
  let totalDonationLinks = 0;
  let totalChildUpdates = 0;

  console.log('Per-duplicate plan:');
  console.log('  #dupe → #canonical  name                       sponsorships  donation_links  child_updates');
  for (const d of dupes) {
    const [{ n: spCount }] = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM sponsorships WHERE child_id = ${d.dupe_id}::uuid
    `)) as any;
    const [{ n: dcCount }] = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM donation_children WHERE child_id = ${d.dupe_id}::uuid
    `)) as any;
    const [{ n: cuCount }] = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM child_updates WHERE child_id = ${d.dupe_id}::uuid
    `)) as any;

    totalSponsorships += spCount;
    totalDonationLinks += dcCount;
    totalChildUpdates += cuCount;

    console.log(
      `  #${String(d.dupe_shirt_number).padStart(3)} → #${String(d.canonical_shirt_number).padStart(3)}  ` +
      `${d.display_name.padEnd(28)} ${String(spCount).padStart(3)}           ${String(dcCount).padStart(3)}            ${String(cuCount).padStart(3)}`
    );
  }

  console.log(`\nTotals to migrate:`);
  console.log(`  sponsorships:     ${totalSponsorships}`);
  console.log(`  donation_children: ${totalDonationLinks}`);
  console.log(`  child_updates:    ${totalChildUpdates}`);
  console.log(`  rows to delete:   ${dupes.length}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to commit.');
    process.exit(0);
  }

  console.log('\nApplying...');

  // 3. Wrap the entire migration in a transaction so it's all-or-nothing.
  await db.transaction(async tx => {
    for (const d of dupes) {
      // 3a. Migrate sponsorships FK
      await tx.execute(sql`
        UPDATE sponsorships
        SET child_id = ${d.canonical_id}::uuid, updated_at = now()
        WHERE child_id = ${d.dupe_id}::uuid
      `);
      // 3b. Migrate donation_children FK
      //     donation_children has a UNIQUE (donation_id, child_id) constraint
      //     so we need onConflictDoNothing behavior. Postgres UPSERT would
      //     be more elegant; here we DELETE any that would collide, then UPDATE.
      await tx.execute(sql`
        DELETE FROM donation_children
        WHERE child_id = ${d.dupe_id}::uuid
          AND donation_id IN (
            SELECT donation_id FROM donation_children WHERE child_id = ${d.canonical_id}::uuid
          )
      `);
      await tx.execute(sql`
        UPDATE donation_children
        SET child_id = ${d.canonical_id}::uuid
        WHERE child_id = ${d.dupe_id}::uuid
      `);
      // 3c. Migrate child_updates FK (updates belong to the person, not the row)
      await tx.execute(sql`
        UPDATE child_updates
        SET child_id = ${d.canonical_id}::uuid, updated_at = now()
        WHERE child_id = ${d.dupe_id}::uuid
      `);
      // 3d. Delete the duplicate row
      await tx.execute(sql`
        DELETE FROM children WHERE id = ${d.dupe_id}::uuid
      `);
    }
  });

  console.log(`✓ Migrated ${totalSponsorships} sponsorships, ${totalDonationLinks} donation links, ${totalChildUpdates} child updates`);
  console.log(`✓ Deleted ${dupes.length} duplicate children rows`);
  console.log(`\nRoster is now canonical. Cycle math will resolve every shirt number > 53 to a live canonical row.`);

  // 4. Verify — no duplicates should remain
  const [{ n: remaining }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT display_name FROM children
      WHERE shirt_number IS NOT NULL AND display_name IS NOT NULL
      GROUP BY display_name HAVING COUNT(*) > 1
    ) x
  `)) as any;
  console.log(`\nVerification: ${remaining} duplicate names remain in children table (should be 0).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
