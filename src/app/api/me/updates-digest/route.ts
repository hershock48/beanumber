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

  // Collect the two kid identifiers each sponsorship carries.
  const uuids = sponsorships
    .map(s => s.childRecordId)
    .filter((v): v is string => !!v);
  const legacies = sponsorships
    .map(s => s.childIdLegacy)
    .filter((v): v is string => !!v);

  // Pull every published child update whose kid matches one of the
  // viewer's sponsorships, on either identifier. Group and take max
  // publishedAt per legacy id in one round-trip.
  const rows = await db
    .select({
      childIdLegacy: sql<string>`coalesce(${childUpdates.childIdLegacy}, '')`,
      latestPublishedAt: sql<Date>`max(${childUpdates.publishedAt})`,
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
    .groupBy(childUpdates.childIdLegacy)
    .orderBy(desc(sql`max(${childUpdates.publishedAt})`));

  const items = rows
    .filter(r => !!r.childIdLegacy && !!r.latestPublishedAt)
    .map(r => ({
      childIdLegacy: r.childIdLegacy,
      latestPublishedAt: new Date(r.latestPublishedAt).toISOString(),
    }));

  return NextResponse.json({ items });
}
