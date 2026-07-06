/**
 * One-off: rewrite batch snapshots to replace orphan child_ids with
 * their canonical equivalents.
 *
 * Three orphans across all 3 batches:
 *   HSP/BAN-007 → HSP/BAN-031  (Prossy Ajok's actual child_id — data
 *                               anomaly, she's at shirt #7 but her
 *                               child_id string is BAN-031)
 *   HSP/BAN-047 → HSP/BAN-003  (Asenath — was her duplicate, deleted
 *                               in the July 2026 dedup migration)
 *   HSP/BAN-052 → HSP/BAN-050  (Blessing — same story as Asenath)
 *
 * Without this fix, /children/47 and /children/52 (canonical shirts)
 * plus every cycle number that resolves to them via mod math (e.g.
 * #99, #196, #104, #201) render 'we don't have this yet.'
 *
 * Dry-run by default. --apply to commit.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db/client';

const APPLY = process.argv.includes('--apply');
const REPLACEMENTS: Record<string, string> = {
  'HSP/BAN-007': 'HSP/BAN-031',
  'HSP/BAN-047': 'HSP/BAN-003',
  'HSP/BAN-052': 'HSP/BAN-050',
};

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const batches = (await db.execute(sql`
    SELECT id::text AS id, batch_name, roster_snapshot, start_shirt_number
    FROM batches ORDER BY start_shirt_number
  `)) as any;

  let touched = 0;
  for (const b of batches) {
    const oldSnap = (b.roster_snapshot || '').split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
    let changes = 0;
    const newSnap = oldSnap.map((entry: string, i: number) => {
      if (REPLACEMENTS[entry]) {
        console.log(`  ${b.batch_name}: pos ${i} (shirt #${b.start_shirt_number + i})  ${entry} → ${REPLACEMENTS[entry]}`);
        changes++;
        return REPLACEMENTS[entry];
      }
      return entry;
    });
    if (changes === 0) {
      console.log(`  ${b.batch_name}: no changes`);
      continue;
    }
    touched++;
    if (APPLY) {
      await db.execute(sql`
        UPDATE batches SET roster_snapshot = ${newSnap.join('\n')}, updated_at = now()
        WHERE id = ${b.id}::uuid
      `);
    }
  }
  console.log(`\n${touched} batches ${APPLY ? 'updated' : 'would update'}.`);
  if (!APPLY) console.log('Re-run with --apply to commit.');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
