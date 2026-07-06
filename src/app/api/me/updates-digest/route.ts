/**
 * GET /api/me/updates-digest
 *
 * For the signed-in viewer, returns the latest published personal
 * update timestamp per kid they sponsor or hold. Powers the "there's
 * something new" indicators on the Your Kids nav tab and (later, if
 * we surface it that way) any other client widget that needs to know
 * whether the viewer has unread updates.
 *
 * Shape:
 *   {
 *     items: [
 *       { childIdLegacy: "HSP/BAN-017", latestPublishedAt: "2026-07-06T..." },
 *       ...
 *     ]
 *   }
 *
 * Notes
 * ─────
 *   - Only PERSONAL updates count. Newsletters are their own signal
 *     and go through /news; they don't drive the per-kid dot.
 *   - Kids with zero published updates are omitted (client treats
 *     missing kid as "nothing to be unread about").
 *   - Not signed in → 200 with empty items. That way the nav dot
 *     component can call this unconditionally without needing to
 *     branch on auth state.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { childUpdates } from '@/lib/db/schema';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
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

  // Pull the raw publishedAt per update, keyed by BOTH identifiers,
  // and merge in code. This avoids the previous group-by-legacy-only
  // trap that would silently drop UUID-only updates.
  const rows = await db
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
          uuids.length > 0 ? inArray(childUpdates.childId, uuids) : sql`false`,
          legacies.length > 0
            ? inArray(childUpdates.childIdLegacy, legacies)
            : sql`false`
        )
      )
    )
    .orderBy(desc(childUpdates.publishedAt));

  // Reduce to max(publishedAt) per legacy id. Prefer the update's own
  // legacy; fall back to the sponsorship-derived legacy for UUID-only
  // rows.
  const latestByLegacy = new Map<string, Date>();
  for (const r of rows) {
    if (!r.publishedAt) continue;
    const legacy =
      r.childIdLegacy || (r.childId ? uuidToLegacy.get(r.childId) : undefined);
    if (!legacy) continue;
    const existing = latestByLegacy.get(legacy);
    if (!existing || existing < r.publishedAt) {
      latestByLegacy.set(legacy, r.publishedAt);
    }
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
