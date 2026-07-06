/**
 * GET /api/me/updates-digest
 *
 * For the signed-in viewer, returns the latest campus-activity
 * timestamp per kid they sponsor or hold. Powers the "there's
 * something new" indicators on the Your Kids nav tab and the
 * per-card NEW pill on /me.
 *
 * Shape:
 *   {
 *     items: [
 *       { childIdLegacy: "HSP/BAN-017", latestPublishedAt: "2026-07-06T..." },
 *       ...
 *     ]
 *   }
 *
 * "Latest campus activity" combines two signals:
 *   1. A published, sponsor-visible personal child update
 *      (child_updates.publishedAt)
 *   2. A kid-to-sponsor reply delivered to THIS viewer's email
 *      (kid_messages.deliveredAt where sponsor_email matches the
 *      viewer and direction is kid_to_sponsor)
 * The client uses a single localStorage seen-key per kid, so both
 * signals get cleared together when the viewer visits the kid page.
 *
 * Notes
 * ─────
 *   - Newsletters are their own signal (their own UnreadNewsletterPill
 *     with its own storage key). They do NOT drive the per-kid dot.
 *   - Kids with zero published updates AND zero replies are omitted —
 *     the client treats a missing kid as "nothing to be unread about."
 *   - Not signed in → 200 with empty items so the client can call
 *     unconditionally.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { childUpdates, kidMessages } from '@/lib/db/schema';
import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { SESSION } from '@/lib/constants';
import { getViewerSponsorships } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getViewerEmail(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return null;
    const session = JSON.parse(raw.value);
    if (new Date(session.expires) < new Date()) return null;
    const email = (session.email as string | undefined)?.trim().toLowerCase();
    return email && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const email = await getViewerEmail();
  if (!email) return NextResponse.json({ items: [] });

  const sponsorships = await getViewerSponsorships(email);
  if (sponsorships.length === 0) return NextResponse.json({ items: [] });

  // Collect both identifiers per sponsorship. A sponsorship carries a
  // UUID FK to children AND the legacy HSP/BAN-XXX text id — updates
  // are written against either or (typically) both. The client keys
  // on legacy id, so at the end we ALWAYS emit legacy-keyed rows,
  // even for updates that were only tagged with a UUID.
  const uuids = sponsorships
    .map(s => s.childRecordId)
    .filter((v): v is string => !!v);
  const legacies = sponsorships
    .map(s => s.childIdLegacy)
    .filter((v): v is string => !!v);

  // Map each UUID → its legacy id (via the sponsorship join we already
  // have in memory) so a UUID-only update can be surfaced under the
  // legacy id the client uses as its localStorage key.
  const uuidToLegacy = new Map<string, string>();
  for (const s of sponsorships) {
    if (s.childRecordId && s.childIdLegacy) {
      uuidToLegacy.set(s.childRecordId, s.childIdLegacy);
    }
  }

  // Run the two source queries in parallel — updates (any published
  // update for any kid the viewer sponsors) and replies (any kid-to-
  // sponsor delivery keyed on THIS viewer's email).
  const [updateRows, replyRows] = await Promise.all([
    db
      .select({
        childId: childUpdates.childId,
        childIdLegacy: childUpdates.childIdLegacy,
        publishedAt: childUpdates.publishedAt,
      })
      .from(childUpdates)
      .where(
        and(
          eq(childUpdates.status, 'Published'),
          eq(childUpdates.visibleToSponsor, true),
          or(
            uuids.length > 0
              ? inArray(childUpdates.childId, uuids)
              : sql`false`,
            legacies.length > 0
              ? inArray(childUpdates.childIdLegacy, legacies)
              : sql`false`
          )
        )
      )
      .orderBy(desc(childUpdates.publishedAt)),
    db
      .select({
        childId: kidMessages.childId,
        deliveredAt: kidMessages.deliveredAt,
      })
      .from(kidMessages)
      .where(
        and(
          eq(kidMessages.direction, 'kid_to_sponsor'),
          sql`lower(${kidMessages.sponsorEmail}) = ${email}`,
          isNotNull(kidMessages.deliveredAt),
          uuids.length > 0
            ? inArray(kidMessages.childId, uuids)
            : sql`false`
        )
      )
      .orderBy(desc(kidMessages.deliveredAt)),
  ]);

  // Reduce to max(activity) per legacy id. Two-pass: first pass
  // ingests updates (which carry both identifiers), second pass
  // ingests replies (which carry only the UUID and need lookup).
  const latestByLegacy = new Map<string, Date>();
  const bumpLegacy = (legacy: string, at: Date) => {
    const existing = latestByLegacy.get(legacy);
    if (!existing || existing < at) latestByLegacy.set(legacy, at);
  };
  for (const r of updateRows) {
    if (!r.publishedAt) continue;
    const legacy =
      r.childIdLegacy || (r.childId ? uuidToLegacy.get(r.childId) : undefined);
    if (!legacy) continue;
    bumpLegacy(legacy, r.publishedAt);
  }
  for (const r of replyRows) {
    if (!r.deliveredAt || !r.childId) continue;
    const legacy = uuidToLegacy.get(r.childId);
    if (!legacy) continue;
    bumpLegacy(legacy, r.deliveredAt);
  }

  const items = Array.from(latestByLegacy.entries())
    .map(([childIdLegacy, at]) => ({
      childIdLegacy,
      latestPublishedAt: new Date(at).toISOString(),
    }))
    // Newest first so a client with a hard cap on how many it inspects
    // still sees the most recent activity.
    .sort((a, b) => b.latestPublishedAt.localeCompare(a.latestPublishedAt));

  return NextResponse.json({ items });
}
