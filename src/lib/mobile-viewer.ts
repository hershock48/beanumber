/**
 * Mobile viewer identity — the email SET.
 *
 * A mobile user can legitimately own sponsorships under two emails:
 *
 *   1. The identity-provider email they signed in with (Apple/Google —
 *      possibly a private-relay address that matches nothing).
 *   2. `linked_sponsor_email` — the purchase/sponsorship email they
 *      proved ownership of via the magic-link flow
 *      (/api/mobile/v1/link/*), or that matched automatically at
 *      sign-in time.
 *
 * Every mobile route that answers "which kids are yours / what may
 * you see" must match sponsorships against BOTH. This helper is the
 * one place that set gets built, so no route can drift to
 * single-email matching again.
 *
 * Always returns at least [viewer.email]. Lowercased, deduped,
 * order-stable: linked email first when present (it's the one most
 * likely to own the actual sponsorship rows — the provider email is
 * often a private relay).
 */
import { eq } from 'drizzle-orm';
import { db } from './db/client';
import { mobileUsers } from './db/schema';

export async function getViewerEmails(viewer: {
  userId: string;
  email: string;
}): Promise<string[]> {
  const emails: string[] = [];
  try {
    const rows = await db
      .select({ linkedSponsorEmail: mobileUsers.linkedSponsorEmail })
      .from(mobileUsers)
      .where(eq(mobileUsers.id, viewer.userId))
      .limit(1);
    const linked = rows[0]?.linkedSponsorEmail?.trim().toLowerCase();
    if (linked) emails.push(linked);
  } catch {
    // Non-fatal — worst case we match on the provider email only,
    // which is the pre-linking behavior, not an error state.
  }
  const provider = viewer.email.trim().toLowerCase();
  if (provider && !emails.includes(provider)) emails.push(provider);
  if (emails.length === 0) emails.push(provider);
  return emails;
}
