/**
 * Typed query helpers — the read side of the data-access layer.
 *
 * Every public-site page that needs data goes through here, not
 * directly to Airtable or Drizzle. This is the seam that makes the
 * Airtable → Postgres swap possible without page-level rewrites.
 *
 * Conventions:
 *   - Functions return plain objects (Drizzle row types), nullable
 *     when the lookup might miss.
 *   - All errors throw; callers handle. The cron job catches them
 *     at the call site; pages let Next.js boundary handle them.
 *   - SQL is constructed via Drizzle's typed builder, not raw
 *     strings.
 */

import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { db } from './client';
import {
  children,
  childUpdates,
  newsletters,
  sponsorships,
  donors,
  subscriptions,
  batches,
} from './schema';

// ─── Children ────────────────────────────────────────────────────

/**
 * Look up a kid by their shirt number — the primary public path
 * (/children/[N]). Returns null if no kid has that number assigned.
 */
export async function getChildByShirtNumber(shirtNumber: number) {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.shirtNumber, shirtNumber))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Look up a kid by their Postgres UUID — used on /meet/[id]
 * (where the URL carries the record id) and from internal
 * references between tables.
 */
export async function getChildByRecordId(id: string) {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Look up a kid by the legacy ChildID string (e.g. "HSP/BAN-005").
 * Useful during the transition window where some join keys still
 * carry the legacy ChildID instead of the new UUID.
 */
export async function getChildByChildId(childIdLegacy: string) {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.childId, childIdLegacy))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Every kid currently on the campus. Optionally filtered to those
 * with a profile photo (homepage carousel only shows photo-having
 * kids; /me digest does too).
 */
export async function listAllChildren(
  opts: { onlyWithPhoto?: boolean } = {}
) {
  const conditions = [
    or(
      eq(children.status, 'Active'),
      eq(children.status, 'active'),
      eq(children.status, 'New')
    ),
    sql`${children.departedAt} IS NULL`,
  ];
  if (opts.onlyWithPhoto) {
    conditions.push(isNotNull(children.profilePhotoUrl));
  }
  return db
    .select()
    .from(children)
    .where(and(...conditions))
    .orderBy(children.shirtNumber);
}

// ─── Sponsorships ────────────────────────────────────────────────

export type SponsorshipKind = 'sponsor' | 'holder';

export interface ViewerSponsorshipSummary {
  kind: SponsorshipKind;
  sponsorCode: string;
  monthlyAmount: number;
  sponsorshipStartDate: string | null;
  childRevealedAt: string | null;
}

/**
 * Returns the viewer&rsquo;s active sponsorship of a specific kid (or
 * null). Used on /[N] and /meet/[id] to decide which CTA card to
 * render (Sponsor / Holder / Cold).
 *
 * The lookup matches BOTH on the new UUID FK and on the legacy
 * ChildID string, so we don&rsquo;t miss rows during the migration
 * window where some sponsorships still carry only the legacy ID.
 */
export async function getViewerSponsorshipForChild(
  viewerEmail: string,
  child: { id: string; childId: string }
): Promise<ViewerSponsorshipSummary | null> {
  if (!viewerEmail || !child.id) return null;
  const emailLower = viewerEmail.toLowerCase();
  const rows = await db
    .select({
      status: sponsorships.status,
      sponsorCode: sponsorships.sponsorCode,
      monthlyAmount: sponsorships.monthlyAmount,
      sponsorshipStartDate: sponsorships.sponsorshipStartDate,
      childRevealedAt: sponsorships.childRevealedAt,
      createdAt: sponsorships.createdAt,
    })
    .from(sponsorships)
    .where(
      and(
        sql`lower(${sponsorships.sponsorEmail}) = ${emailLower}`,
        or(
          eq(sponsorships.status, 'Active'),
          eq(sponsorships.status, 'Holder')
        ),
        or(
          eq(sponsorships.childId, child.id),
          eq(sponsorships.childIdLegacy, child.childId)
        )
      )
    )
    // Prefer Active over Holder if a user has both rows for the same
    // kid (rare but real during a Holder→Active claim transition).
    // Then newest first.
    .orderBy(
      sql`case when ${sponsorships.status} = 'Active' then 0 else 1 end`,
      desc(sponsorships.createdAt)
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const amount = Number(row.monthlyAmount ?? 0);
  return {
    kind: row.status === 'Active' && amount > 0 ? 'sponsor' : 'holder',
    sponsorCode: row.sponsorCode ?? '',
    monthlyAmount: amount,
    sponsorshipStartDate: row.sponsorshipStartDate ?? null,
    childRevealedAt: row.childRevealedAt
      ? new Date(row.childRevealedAt).toISOString()
      : null,
  };
}

/**
 * All sponsorships owned by a given email — the /me dashboard. Both
 * Active and Holder rows. Hydrated with the linked child basics so
 * the dashboard can render without N+1 joins from the page.
 */
export async function getViewerSponsorships(viewerEmail: string) {
  if (!viewerEmail) return [];
  const emailLower = viewerEmail.toLowerCase();
  // LEFT JOIN on children.id (UUID) catches sponsorships with a
  // resolved FK. We COALESCE in a second left-join via legacy ChildID
  // text so transition-state rows (legacy populated, UUID NULL)
  // still render the kid card. SQL is hand-rolled because Drizzle
  // doesn&rsquo;t support COALESCE across two joins ergonomically.
  return db
    .select({
      sponsorshipId: sponsorships.id,
      sponsorCode: sponsorships.sponsorCode,
      status: sponsorships.status,
      monthlyAmount: sponsorships.monthlyAmount,
      sponsorshipStartDate: sponsorships.sponsorshipStartDate,
      stripeSubscriptionId: sponsorships.stripeSubscriptionId,
      childRevealedAt: sponsorships.childRevealedAt,
      childRecordId: sql<string | null>`coalesce(${children.id}, child_legacy.id)`,
      childIdLegacy: sql<string | null>`coalesce(${children.childId}, child_legacy.child_id)`,
      childFirstName: sql<string | null>`coalesce(${children.firstName}, child_legacy.first_name)`,
      childDisplayName: sql<string | null>`coalesce(${children.displayName}, child_legacy.display_name)`,
      childPhotoUrl: sql<string | null>`coalesce(${children.profilePhotoUrl}, child_legacy.profile_photo_url)`,
      childShirtNumber: sql<number | null>`coalesce(${children.shirtNumber}, child_legacy.shirt_number)`,
      childDepartedAt: sql<Date | null>`coalesce(${children.departedAt}, child_legacy.departed_at)`,
    })
    .from(sponsorships)
    .leftJoin(children, eq(children.id, sponsorships.childId))
    .leftJoin(
      sql`children as child_legacy`,
      sql`child_legacy.child_id = ${sponsorships.childIdLegacy}`
    )
    .where(
      and(
        sql`lower(${sponsorships.sponsorEmail}) = ${emailLower}`,
        or(
          eq(sponsorships.status, 'Active'),
          eq(sponsorships.status, 'Holder')
        )
      )
    );
}

/**
 * All sponsorships pointing at a given child — admin tools (
 * reassignment, audit views) and the auto-reveal logic.
 */
export async function getSponsorshipsForKid(childRecordId: string) {
  return db
    .select()
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.childId, childRecordId),
        or(
          eq(sponsorships.status, 'Active'),
          eq(sponsorships.status, 'Holder'),
          eq(sponsorships.status, 'Awaiting Sponsor')
        )
      )
    );
}

export async function getSponsorshipBySponsorCode(code: string) {
  const rows = await db
    .select()
    .from(sponsorships)
    .where(eq(sponsorships.sponsorCode, code))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Newsletters ─────────────────────────────────────────────────

export interface CampusNewsletterEntry {
  id: string;
  title: string;
  subject: string;
  bodyHtml: string;
  heroPhotoUrl?: string;
  publishedAt?: string;
}

/**
 * Recent published campus newsletters, newest first. Same shape
 * as the existing newsletter-feed.ts function it replaces.
 */
export async function getRecentCampusNewsletters(
  limit = 12
): Promise<CampusNewsletterEntry[]> {
  const rows = await db
    .select({
      id: newsletters.id,
      title: newsletters.title,
      subject: newsletters.subject,
      bodyHtml: newsletters.bodyHtml,
      heroPhotoUrl: newsletters.heroPhotoUrl,
      publishedAt: newsletters.publishedAt,
      status: newsletters.status,
    })
    .from(newsletters)
    .where(
      or(
        eq(newsletters.status, 'Sent'),
        isNotNull(newsletters.publishedAt)
      )
    )
    .orderBy(desc(newsletters.publishedAt))
    .limit(limit);
  return rows.map(r => ({
    id: r.id,
    title: r.title ?? '',
    subject: r.subject ?? '',
    bodyHtml: r.bodyHtml ?? '',
    heroPhotoUrl: r.heroPhotoUrl ?? undefined,
    publishedAt: r.publishedAt
      ? new Date(r.publishedAt).toISOString()
      : undefined,
  }));
}

// ─── Child Updates ───────────────────────────────────────────────

export interface ChildUpdateSnapshot {
  title: string;
  publishedAt: string;
  photoUrl?: string;
}

/**
 * Most recent published, sponsor-visible update for a given kid.
 * Used by /me to surface a digest line per kid.
 */
export async function getLatestUpdateForChild(
  child: { id: string; childId: string }
): Promise<ChildUpdateSnapshot | null> {
  if (!child.id && !child.childId) return null;
  const rows = await db
    .select({
      title: childUpdates.title,
      summary: childUpdates.summary,
      positiveHighlight: childUpdates.positiveHighlight,
      publishedAt: childUpdates.publishedAt,
      photoUrls: childUpdates.photoUrls,
    })
    .from(childUpdates)
    .where(
      and(
        eq(childUpdates.visibleToSponsor, true),
        isNotNull(childUpdates.publishedAt),
        or(
          eq(childUpdates.childId, child.id),
          eq(childUpdates.childIdLegacy, child.childId)
        )
      )
    )
    .orderBy(desc(childUpdates.publishedAt))
    .limit(1);
  const row = rows[0];
  if (!row || !row.publishedAt) return null;
  const title =
    row.title || row.positiveHighlight || row.summary || 'A note from the campus';
  const photos = row.photoUrls as string[] | null;
  return {
    title,
    publishedAt: new Date(row.publishedAt).toISOString(),
    photoUrl: photos?.[0],
  };
}

// ─── Donors ──────────────────────────────────────────────────────

export async function getDonorByEmail(email: string) {
  const lowered = email.toLowerCase();
  const rows = await db
    .select()
    .from(donors)
    .where(sql`lower(${donors.email}) = ${lowered}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function getDonorByStripeCustomerId(stripeCustomerId: string) {
  const rows = await db
    .select()
    .from(donors)
    .where(eq(donors.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Subscriptions ───────────────────────────────────────────────

export async function getSubscriptionByStripeId(stripeSubscriptionId: string) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Batches (cycle math) ────────────────────────────────────────

export async function listBatches() {
  return db
    .select()
    .from(batches)
    .orderBy(batches.startShirtNumber);
}
