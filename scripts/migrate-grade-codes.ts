/**
 * scripts/migrate-grade-codes.ts
 *
 * One-shot migration: normalize the `children.grade_class` column
 * from the current mixed strings ("Pre-K", "3rd Grade", "TOP Class",
 * "Kindergarten three", nulls, …) into canonical codes:
 *
 *   LK, UK, P1, P2, P3, P4, P5, or null (unknown / needs Simon).
 *
 * After migration, downstream display code translates the code into
 * the right label for the audience (Ugandan for Simon, US for
 * sponsors) via src/lib/grades.ts.
 *
 * Usage:
 *   npx tsx scripts/migrate-grade-codes.ts              # dry run
 *   npx tsx scripts/migrate-grade-codes.ts --apply      # write to DB
 *
 * Dry-run mode prints every row's before → after and does NOT write.
 * Apply mode wraps every update in a single transaction so it's all
 * or nothing.
 *
 * Safe to re-run: canonical codes normalize to themselves, so the
 * second run finds nothing to change.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { normalizeGradeInput, ALL_GRADES } from '../src/lib/grades';

const APPLY = process.argv.includes('--apply');

function loadDatabaseUrl(): string {
  const env = process.env.DATABASE_URL;
  if (env) return env;
  // Fallback: read from .env.local so `npx tsx` works without loading
  // dotenv-cli first.
  const fs = require('node:fs');
  const raw = fs.readFileSync('.env.local', 'utf8') as string;
  const line = raw
    .split('\n')
    .find((l: string) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL missing from env and .env.local');
  return line.split('=').slice(1).join('=').replace(/^["']|["']$/g, '').trim();
}

async function main() {
  const sql = postgres(loadDatabaseUrl(), { prepare: false });

  const rows = await sql<
    { id: string; shirt_number: number | null; first_name: string | null; grade_class: string | null }[]
  >`
    select id, shirt_number, first_name, grade_class
    from children
    where shirt_number between 1 and 53
    order by shirt_number
  `;

  console.log(`Loaded ${rows.length} canonical roster kids.\n`);

  const plan: Array<{
    id: string;
    shirtNumber: number | null;
    firstName: string | null;
    before: string | null;
    after: string | null;
    action: 'unchanged' | 'normalize' | 'clear' | 'flag-null';
  }> = [];

  for (const r of rows) {
    const before = r.grade_class;
    const after = normalizeGradeInput(before);

    let action: (typeof plan)[number]['action'];
    if (before === null) {
      action = 'flag-null';
    } else if (after === null) {
      // Recognized nothing — clear the value so display code stops
      // rendering the junk. Simon will refill in the admin editor.
      action = 'clear';
    } else if (before === after) {
      action = 'unchanged';
    } else {
      action = 'normalize';
    }

    plan.push({
      id: r.id,
      shirtNumber: r.shirt_number,
      firstName: r.first_name,
      before,
      after,
      action,
    });
  }

  // Print the plan.
  const width = 22;
  console.log(
    `  # | ${'name'.padEnd(18)} | ${'before'.padEnd(width)} | ${'after'.padEnd(6)} | action`
  );
  console.log(`  ${'-'.repeat(90)}`);
  const summary: Record<string, number> = {
    unchanged: 0,
    normalize: 0,
    clear: 0,
    'flag-null': 0,
  };
  for (const p of plan) {
    const marker =
      p.action === 'normalize' ? '→'
        : p.action === 'clear' ? '✗'
        : p.action === 'flag-null' ? '?'
        : ' ';
    console.log(
      `  ${String(p.shirtNumber ?? '?').padStart(2)} | ${(p.firstName ?? '').padEnd(18)} | ${(p.before ?? '(null)').padEnd(width)} | ${(p.after ?? '(null)').padEnd(6)} | ${marker} ${p.action}`
    );
    summary[p.action]++;
  }
  console.log('\nSummary:', summary);
  console.log(
    `\nCanonical codes recognized: ${ALL_GRADES.join(', ')}`
  );

  if (!APPLY) {
    console.log(
      '\nDry run only — pass --apply to write these changes to the DB.'
    );
    await sql.end();
    return;
  }

  // Apply.
  const toWrite = plan.filter(p => p.action === 'normalize' || p.action === 'clear');
  if (toWrite.length === 0) {
    console.log('\nNothing to write. DB already normalized.');
    await sql.end();
    return;
  }

  console.log(`\nApplying ${toWrite.length} update(s) in one transaction…`);
  await sql.begin(async trx => {
    for (const p of toWrite) {
      await trx`
        update children
           set grade_class = ${p.after},
               updated_at = now()
         where id = ${p.id}
      `;
    }
  });
  console.log('Done.');
  await sql.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
