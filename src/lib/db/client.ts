/**
 * Drizzle + Postgres client.
 *
 * One module-level connection per Node/serverless function instance.
 * Vercel cold starts share this client across requests, so we don't
 * pay the connection cost per request. The Supabase pooler
 * (port 6543, "Transaction" mode) handles connection multiplexing
 * on the database side.
 *
 * Why `postgres` (the npm package) rather than `pg`: smaller binary,
 * faster cold starts on serverless, native TypeScript types, no
 * adapter glue needed by Drizzle. Drizzle's recommended driver for
 * Postgres in Vercel-deployed Next.js.
 *
 * Lazy initialization: the client is created on first access, not
 * at module load. This matters during the cutover window where
 * `DATABASE_URL` may not be set in production yet. If we threw at
 * module-import time, the webhook (which imports the bridge which
 * imports this file) would crash on every request rather than just
 * silently failing the dual-write mirror call. With lazy init, the
 * webhook's Airtable path stays healthy and only the mirror calls
 * see the missing-env error.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDb() {
  if (_db) return _db;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Add it in Vercel env vars (or .env.local for dev).'
    );
  }

  _client = postgres(DATABASE_URL, {
    prepare: false, // Supabase transaction-mode pooler can't prepare.
    // Pool size per serverless instance. Was 1, which meant every
    // Promise.all-style parallel query (e.g. the 7 admin home cards)
    // actually serialized on a single connection, adding hundreds of
    // ms of latency per admin load. 5 lets the parallel queries run
    // parallel while staying well within Supabase pooler limits
    // (default 60 client conns; even with 10 warm Lambdas that's 50).
    max: 5,
    idle_timeout: 20, // seconds — close idle conns so pooler doesn't hold them
    connect_timeout: 10, // fail fast on cold-start rather than hang past Vercel's 10s cap
  });
  _db = drizzle(_client, { schema });
  return _db;
}

/**
 * The typed Drizzle client. Use this in queries and mutations.
 *
 *   import { db } from '@/lib/db/client';
 *   import { children } from '@/lib/db/schema';
 *
 *   const kid = await db.select().from(children).where(eq(children.shirtNumber, 99)).limit(1);
 *
 * Implementation note: `db` is a Proxy that initializes the real
 * Drizzle client on first method access. This defers the missing-
 * env-var error from import time to first query — important so
 * other code paths that just *import* the bridge don't crash when
 * DATABASE_URL isn't configured.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;
