/**
 * mobile_users lookup / upsert helpers for the auth endpoints.
 *
 * The rule: mobile users are keyed by identity-provider sub (apple or
 * google). Email is the linkage into the sponsorships table — it
 * lower-cases to `linked_sponsor_email` when we find a match.
 *
 * `hasSponsorships` in the response is a boolean the client uses to
 * choose the post-sign-in destination — "your kids" surface vs.
 * "meet a kid" fallback. It's a fast count, not a full row load.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from './db/client';
import { mobileUsers, sponsorships, type MobileUser } from './db/schema';

export type ProviderSub =
  | { provider: 'apple'; sub: string }
  | { provider: 'google'; sub: string };

/**
 * Given a verified identity token, upsert the mobile_users row and
 * return `{ user, hasSponsorships }`.
 *
 * Race note: we hit a UNIQUE constraint on (apple_sub) / (google_sub).
 * The select-then-insert can race with a parallel sign-in from the
 * same device — the ON CONFLICT DO UPDATE handles that cleanly.
 */
export async function findOrCreateMobileUser(
  identity: ProviderSub & { email: string }
): Promise<{ user: MobileUser; hasSponsorships: boolean }> {
  const emailLower = identity.email.toLowerCase();

  // Look for a matching Active/Holder sponsorship at this email so we
  // can stamp linked_sponsor_email.
  const matchedRows = await db
    .select({ email: sponsorships.sponsorEmail })
    .from(sponsorships)
    .where(sql`lower(${sponsorships.sponsorEmail}) = ${emailLower}`)
    .limit(1);
  const linkedSponsorEmail = matchedRows[0]?.email ?? null;

  const now = new Date();

  if (identity.provider === 'apple') {
    const [row] = await db
      .insert(mobileUsers)
      .values({
        email: identity.email,
        appleSub: identity.sub,
        linkedSponsorEmail,
        createdAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: mobileUsers.appleSub,
        set: {
          email: identity.email,
          linkedSponsorEmail,
          lastSeenAt: now,
        },
      })
      .returning();
    return {
      user: row,
      hasSponsorships: linkedSponsorEmail !== null,
    };
  }

  // Google
  const [row] = await db
    .insert(mobileUsers)
    .values({
      email: identity.email,
      googleSub: identity.sub,
      linkedSponsorEmail,
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: mobileUsers.googleSub,
      set: {
        email: identity.email,
        linkedSponsorEmail,
        lastSeenAt: now,
      },
    })
    .returning();
  return {
    user: row,
    hasSponsorships: linkedSponsorEmail !== null,
  };
}

export interface MobileAuthResponse {
  accessToken: string;
  user: {
    userId: string;
    email: string;
    hasSponsorships: boolean;
  };
}
