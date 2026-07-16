/**
 * Backfill sponsorships.claimed_shirt_number (migration 0017).
 *
 * Claims moved from per-kid to per-number. Existing rows predate the
 * column, so this script decides which rows actually OWN a number:
 *
 *   1. Rows whose child_id_legacy encodes a cycle number
 *      (HSP/BAN-0NN with NN past the canonical roster) own that
 *      number by construction — only the claim paths ever write
 *      those ids. (None expected today; cycle claims were broken.)
 *   2. For each canonical kid, rows linked to that kid compete for
 *      the kid's shirt_number. The EARLIEST-created Active/Holder
 *      row wins — the first person to claim/buy is the shirt-holder;
 *      later rows are co-sponsors added via /meet and hold no number.
 *
 * Rows that win get claimed_shirt_number stamped; everyone else stays
 * NULL. Idempotent: rows that already have claimed_shirt_number are
 * left untouched, and re-running produces the same winners.
 *
 * DRY RUN by default — prints the full decision table (including the
 * multi-email kids where the earliest-row rule is a judgment call)
 * and writes nothing. Pass --apply to execute.
 *
 *   npx tsx scripts/backfill-claimed-shirt-numbers.ts          # dry run
 *   npx tsx scripts/backfill-claimed-shirt-numbers.ts --apply  # write
 *
 * If the earliest-row rule picks the wrong holder for a kid (manual
 * relinks like Amanda's can reorder history), fix it afterwards with
 * two UPDATEs swapping claimed_shirt_number between the two rows —
 * the script won't fight you on re-runs because both rows will be
 * non-NULL/decided.
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'fs';

const CANONICAL_ROSTER_MAX = 53;
const APPLY = process.argv.includes('--apply');

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .find(l => l.startsWith('DATABASE_URL='));
    if (line) {
      return line.replace(/^DATABASE_URL=/, '').replace(/^"|"$/g, '');
    }
  }
  throw new Error('DATABASE_URL not found in env, .env.local, or .env');
}

interface Row {
  id: string;
  sponsor_code: string;
  sponsor_email: string;
  status: string;
  monthly_amount: string;
  created_at: Date;
  child_id_legacy: string | null;
  claimed_shirt_number: number | null;
  kid_shirt_number: number | null;
  kid_name: string | null;
}

async function main() {
  const sql = postgres(loadDatabaseUrl(), {
    prepare: false,
    max: 1,
    idle_timeout: 10,
  });

  const rawRows = (await sql`
    select s.id, s.sponsor_code, s.sponsor_email, s.status,
           s.monthly_amount, s.created_at, s.child_id_legacy,
           s.claimed_shirt_number,
           c.shirt_number as kid_shirt_number,
           coalesce(c.display_name, c.first_name) as kid_name
    from sponsorships s
    left join children c
      on c.id = s.child_id or c.child_id = s.child_id_legacy
    where s.status in ('Active', 'Holder')
    order by s.created_at asc
  `) as unknown as Row[];

  // A sponsorship whose child_id (UUID) and child_id_legacy point at
  // DIFFERENT children rows (historical mislinks existed — see the
  // Amanda incident in known_gotchas.md) joins twice and would
  // otherwise compete for two numbers. Keep the first occurrence
  // (UUID-join order) and flag the conflict for manual review.
  const seenIds = new Set<string>();
  const rows: Row[] = [];
  const dualJoined: string[] = [];
  for (const r of rawRows) {
    if (seenIds.has(r.id)) {
      dualJoined.push(
        `${r.sponsor_code} joins a SECOND kid (#${r.kid_shirt_number} ${r.kid_name}) — dual-key mismatch, REVIEW MANUALLY`
      );
      continue;
    }
    seenIds.add(r.id);
    rows.push(r);
  }

  const decisions: Array<{
    id: string;
    code: string;
    email: string;
    number: number;
    kid: string;
    reason: string;
    contested: boolean;
  }> = [];
  const skipped: string[] = [];
  const takenNumbers = new Set<number>();
  const kidWinners = new Map<number, string>(); // shirt number -> row id

  for (const r of rows) {
    if (r.claimed_shirt_number != null) {
      takenNumbers.add(r.claimed_shirt_number);
      skipped.push(`${r.sponsor_code} already has #${r.claimed_shirt_number}`);
      continue;
    }

    // Case 1: synthetic cycle-number legacy id.
    const m = r.child_id_legacy?.match(/^HSP\/BAN-(\d{3,})$/);
    const legacyNum = m ? parseInt(m[1], 10) : null;
    if (legacyNum && legacyNum > CANONICAL_ROSTER_MAX) {
      if (takenNumbers.has(legacyNum)) {
        skipped.push(
          `${r.sponsor_code} cycle #${legacyNum} already taken — REVIEW MANUALLY`
        );
        continue;
      }
      takenNumbers.add(legacyNum);
      decisions.push({
        id: r.id,
        code: r.sponsor_code,
        email: r.sponsor_email,
        number: legacyNum,
        kid: r.kid_name ?? '(cycle record)',
        reason: 'cycle legacy id',
        contested: false,
      });
      continue;
    }

    // Case 2: canonical kid — earliest row wins the kid's number.
    const n = r.kid_shirt_number;
    if (typeof n !== 'number' || n < 1) {
      skipped.push(`${r.sponsor_code} childless / no kid number — stays NULL`);
      continue;
    }
    if (kidWinners.has(n) || takenNumbers.has(n)) {
      skipped.push(
        `${r.sponsor_code} (${r.sponsor_email}) — #${n} already won by an earlier row; co-sponsor, stays NULL`
      );
      continue;
    }
    kidWinners.set(n, r.id);
    takenNumbers.add(n);
    // Contested = a DIFFERENT person (distinct email, case-folded)
    // also has a live row on this kid. Same-email duplicate rows are
    // duplicates, not contention.
    const otherEmails = new Set(
      rows
        .filter(
          o =>
            o.id !== r.id &&
            o.kid_shirt_number === n &&
            o.claimed_shirt_number == null &&
            o.sponsor_email.toLowerCase() !== r.sponsor_email.toLowerCase()
        )
        .map(o => o.sponsor_email.toLowerCase())
    );
    decisions.push({
      id: r.id,
      code: r.sponsor_code,
      email: r.sponsor_email,
      number: n,
      kid: r.kid_name ?? '(unknown)',
      reason: 'earliest row on kid',
      contested: otherEmails.size > 0,
    });
  }

  console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — ${decisions.length} rows get a number, ${skipped.length} stay NULL/untouched\n`);
  console.log('WINNERS (● = contested kid, other emails exist — review):');
  for (const d of decisions) {
    console.log(
      `  ${d.contested ? '●' : ' '} #${String(d.number).padStart(3)}  ${d.kid.padEnd(28)} ${d.email.padEnd(36)} ${d.code}  [${d.reason}]`
    );
  }
  console.log('\nSTAYING NULL / SKIPPED:');
  for (const s of skipped) console.log(`    ${s}`);
  if (dualJoined.length) {
    console.log('\nDUAL-KEY MISMATCHES (sponsorship points at two different kids):');
    for (const s of dualJoined) console.log(`    ${s}`);
  }

  if (APPLY) {
    let written = 0;
    for (const d of decisions) {
      await sql`
        update sponsorships
        set claimed_shirt_number = ${d.number}, updated_at = now()
        where id = ${d.id} and claimed_shirt_number is null
      `;
      await sql`
        insert into audit_log (table_name, record_id, action, changed_fields, actor_type)
        values ('sponsorships', ${d.id}, 'UPDATE',
                ${sql.json({ claimed_shirt_number: { to: d.number, via: 'backfill-0017', reason: d.reason } })},
                'migration')
      `;
      written++;
    }
    console.log(`\nWrote ${written} rows (audited as actor_type=migration).`);
  } else {
    console.log('\nDry run only. Re-run with --apply to write.');
  }

  await sql.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
