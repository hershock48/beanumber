import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle config. Used for `npx drizzle-kit studio` (a local UI over
 * the database at DATABASE_URL) and for drizzle-orm's type inference.
 *
 * Do NOT run `drizzle-kit generate` or `drizzle-kit migrate` here.
 * Schema changes are hand-written, idempotent SQL files in drizzle/
 * that Kevin applies in the Supabase SQL editor (CLAUDE.md, "Where the
 * data lives"). drizzle/meta only knows about 0000 and 0001, so
 * generate would write a second 0002 file beside 0002_low_retro_girl.sql,
 * overwrite meta/0002_snapshot.json and emit non-idempotent CREATE and
 * ALTER statements for everything already live; migrate would replay
 * 0000 and 0001 against production. Both npm scripts were removed on
 * 2026-10-28 for that reason. See docs/audit-2026-10.md.
 *
 * DATABASE_URL points at the Supabase Postgres pooler (transaction
 * mode) — see docs/claude/postgres_migration.md for the full URL
 * shape.
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Keep migration files in the repo as the audit trail for every
  // schema change. Reviewable in PRs.
  verbose: true,
  strict: true,
});
