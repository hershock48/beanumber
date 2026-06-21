import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle config — generates migrations from src/lib/db/schema.ts and
 * applies them to the Postgres connection at DATABASE_URL.
 *
 * Usage:
 *   npx drizzle-kit generate   # produce SQL migration files in drizzle/
 *   npx drizzle-kit migrate    # apply unapplied migrations to the DB
 *   npx drizzle-kit studio     # local UI to browse the DB
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
