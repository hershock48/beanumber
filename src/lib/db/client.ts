/**
 * Drizzle + Postgres client.
 *
 * One module-level connection per Node/serverless function instance.
 * Vercel cold starts share this client across requests, so we don&rsquo;t
 * pay the connection cost per request. The Supabase pooler
 * (port 6543, &ldquo;Transaction&rdquo; mode) handles connection multiplexing
 * on the database side.
 *
 * Why `postgres` (the npm package) rather than `pg`: smaller binary,
 * faster cold starts on serverless, native TypeScript types, no
 * adapter glue needed by Drizzle. Drizzle&rsquo;s recommended driver for
 * Postgres in Vercel-deployed Next.js.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Add it in Vercel env vars (or .env.local for dev).'
  );
}

/**
 * The raw postgres-js client. Exported in case a query needs to drop
 * down past Drizzle (rare). Most callers should use `db` below.
 *
 * - `prepare: false` because Supabase&rsquo;s transaction-mode pooler
 *   doesn&rsquo;t support prepared statements. Required.
 * - `max: 1` keeps the connection pool small per serverless instance
 *   so we don&rsquo;t blow past Supabase&rsquo;s connection limit when many
 *   functions warm at once. The pooler on the Supabase side handles
 *   the actual multiplexing.
 */
const client = postgres(DATABASE_URL, {
  prepare: false,
  max: 1,
});

/**
 * The typed Drizzle client. Import this in queries and mutations.
 *
 *   import { db } from '@/lib/db/client';
 *   import { children } from '@/lib/db/schema';
 *
 *   const kid = await db.select().from(children).where(eq(children.shirtNumber, 99)).limit(1);
 */
export const db = drizzle(client, { schema });

export type DbClient = typeof db;
