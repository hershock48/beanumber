/**
 * One-off migration runner for drizzle/0007_push.sql.
 *
 * Usage: `npx tsx scripts/apply-push-migration.ts`
 *
 * Reads DATABASE_URL from the environment (defaults to `.env.local`
 * via `dotenv/config`) and applies the raw SQL to Supabase. Safe to
 * re-run — every statement uses IF NOT EXISTS.
 *
 * Mirrors the pattern used for previous ad-hoc migrations (grade
 * codes, mobile auth) — we don't have `drizzle-kit push` wired up
 * in CI, so the actual production apply is a scripted one-shot from
 * Kevin's machine.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.');
    process.exit(1);
  }

  const sqlPath = resolve(__dirname, '../drizzle/0007_push.sql');
  const sqlText = readFileSync(sqlPath, 'utf8');
  console.log(`[push-migration] Applying ${sqlPath}`);

  const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('[push-migration] Done.');
  } catch (err) {
    console.error('[push-migration] Failed:', err);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
