/**
 * Admin · App settings key/value store (Postgres edition).
 *
 * Singleton-style storage for things that don't deserve their own
 * table — the Gmail OAuth refresh token, the authorized email, the
 * signature, etc. Each setting is one row in the `settings` table,
 * keyed by a dotted-namespace string.
 *
 * Server-side only. Reads + writes go through Drizzle. Function
 * signatures are preserved from the Airtable-era module so callers
 * (Gmail send path, /admin/connect-gmail page, OAuth callback) don't
 * need to change.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';

export const SETTING_KEYS = {
  gmailRefreshToken: 'gmail.refresh_token',
  gmailAuthorizedEmail: 'gmail.authorized_email',
  gmailSignature: 'gmail.signature',
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(
  key: string,
  value: string,
  notes?: string
): Promise<void> {
  // Postgres upsert via ON CONFLICT on the unique key index. Returns
  // the affected row but we don't need it — callers just want
  // success/failure.
  const now = new Date();
  await db
    .insert(settings)
    .values({
      key,
      value,
      notes: notes ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value,
        notes: notes ?? null,
        updatedAt: now,
      },
    });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}
