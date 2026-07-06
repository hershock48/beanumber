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
  communications,
  newsletters,
  sponsorships,
  donors,
  donations,
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
      // Date of birth — needed by /me's milestone computation
      // (birthday-today / -upcoming / -recent banners). Null when
      // the YDO intake form for this kid hasn't been filled out yet,
      // which is fine: milestones layer returns null too.
      childDateOfBirth: sql<Date | null>`coalesce(${children.dateOfBirth}, child_legacy.date_of_birth)`,
      // Current SOTM state (used by /me's milestone banner + the kid
      // card badge on public surfaces). Both fields nullable; when
      // studentOfMonthMonth is set, the kid is currently SOTM.
      childSotmMonth: sql<string | null>`coalesce(${children.studentOfMonthMonth}, child_legacy.student_of_month_month)`,
      childSotmReason: sql<string | null>`coalesce(${children.studentOfMonthReason}, child_legacy.student_of_month_reason)`,
      childGradeClass: sql<string | null>`coalesce(${children.gradeClass}, child_legacy.grade_class)`,
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

/**
 * Find the sponsorship row that owns a given Stripe subscription. Used
 * by the claim-match flow for idempotency &mdash; if a Sponsorship already
 * exists for this subscription (because the user double-tapped or
 * Kevin already created one by hand), we return it instead of
 * inserting a duplicate.
 */
export async function getSponsorshipByStripeSubscriptionId(
  stripeSubscriptionId: string
) {
  if (!stripeSubscriptionId) return null;
  const rows = await db
    .select()
    .from(sponsorships)
    .where(eq(sponsorships.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Find an existing Active or Holder sponsorship for a given email +
 * child. Mirrors the dual-key match (UUID FK OR legacy ChildID) so
 * transition-state rows are caught either way. Used by the recovery
 * send-link path to decide between "send sign-in link" vs "create
 * Holder row + send link."
 */
export async function findSponsorshipForEmailAndChild(
  email: string,
  child: { id: string; childId: string }
) {
  if (!email || (!child.id && !child.childId)) return null;
  const emailLower = email.toLowerCase();
  const rows = await db
    .select()
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
    .orderBy(
      sql`case when ${sponsorships.status} = 'Active' then 0 else 1 end`,
      desc(sponsorships.createdAt)
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Is there an Active or Holder sponsorship on this child from ANY
 * email other than the one given? Used to block fraudulent second-
 * claim attempts on a number that&rsquo;s already been spoken for.
 */
export async function isChildClaimedByOtherEmail(
  child: { id: string; childId: string },
  excludingEmail: string
): Promise<boolean> {
  if (!child.id && !child.childId) return false;
  const emailLower = excludingEmail.toLowerCase();
  const rows = await db
    .select({ id: sponsorships.id })
    .from(sponsorships)
    .where(
      and(
        sql`lower(${sponsorships.sponsorEmail}) <> ${emailLower}`,
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
    .limit(1);
  return rows.length > 0;
}

/**
 * Email-only sign-in fallback. Returns the most recent Active or
 * Holder sponsorship for this email, hydrated with the linked
 * kid&rsquo;s shirt number and first name so the recovery route can
 * mint a magic link without a second round-trip. Returns null if no
 * matching sponsorship resolves to a kid with a shirt number.
 *
 * Mirrors the dual-source kid join used by getViewerSponsorships
 * (UUID FK first, legacy ChildID text second) so transition-state
 * rows still resolve.
 */
export async function getMostRecentSponsorshipForEmail(viewerEmail: string) {
  if (!viewerEmail) return null;
  const emailLower = viewerEmail.toLowerCase();
  const rows = await db
    .select({
      sponsorCode: sponsorships.sponsorCode,
      sponsorshipStartDate: sponsorships.sponsorshipStartDate,
      createdAt: sponsorships.createdAt,
      childShirtNumber: sql<number | null>`coalesce(${children.shirtNumber}, child_legacy.shirt_number)`,
      childFirstName: sql<string | null>`coalesce(${children.firstName}, child_legacy.first_name)`,
      childDisplayName: sql<string | null>`coalesce(${children.displayName}, child_legacy.display_name)`,
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
    )
    .orderBy(
      desc(sponsorships.sponsorshipStartDate),
      desc(sponsorships.createdAt)
    )
    .limit(10);

  for (const row of rows) {
    const shirtNumber = row.childShirtNumber;
    if (typeof shirtNumber !== 'number' || shirtNumber <= 0) continue;
    const firstName =
      row.childFirstName ||
      (row.childDisplayName ? row.childDisplayName.split(' ')[0] : null) ||
      'them';
    return {
      sponsorCode: row.sponsorCode,
      shirtNumber,
      firstName,
    };
  }
  return null;
}

/**
 * Resolve the email tied to a sponsorCode (only when the row is an
 * Active or Holder row, the two states the magic-link callback should
 * trust). Used by the recover callback to populate the sponsor_session
 * cookie after token verification.
 */
export async function getSponsorshipEmailByCode(
  sponsorCode: string
): Promise<string | null> {
  if (!sponsorCode) return null;
  const rows = await db
    .select({ sponsorEmail: sponsorships.sponsorEmail })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.sponsorCode, sponsorCode),
        or(
          eq(sponsorships.status, 'Active'),
          eq(sponsorships.status, 'Holder')
        )
      )
    )
    .limit(1);
  return rows[0]?.sponsorEmail ?? null;
}

/**
 * Hydrate a sponsorship&rsquo;s linked child basics (shirt number, names,
 * photo) by sponsorCode. Used by the reveal endpoint to compare the
 * caller&rsquo;s requested number against the kid the sponsor is actually
 * tied to.
 */
export async function getSponsorshipWithChildBySponsorCode(sponsorCode: string) {
  if (!sponsorCode) return null;
  const rows = await db
    .select({
      sponsorshipId: sponsorships.id,
      sponsorEmail: sponsorships.sponsorEmail,
      sponsorCode: sponsorships.sponsorCode,
      status: sponsorships.status,
      childRevealedAt: sponsorships.childRevealedAt,
      childShirtNumber: sql<number | null>`coalesce(${children.shirtNumber}, child_legacy.shirt_number)`,
      childRecordId: sql<string | null>`coalesce(${children.id}, child_legacy.id)`,
    })
    .from(sponsorships)
    .leftJoin(children, eq(children.id, sponsorships.childId))
    .leftJoin(
      sql`children as child_legacy`,
      sql`child_legacy.child_id = ${sponsorships.childIdLegacy}`
    )
    .where(eq(sponsorships.sponsorCode, sponsorCode))
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

/**
 * Newsletters that are scheduled and due to send. The newsletter
 * cron picks these up daily — `status='Scheduled' AND send_date <= now`.
 * Returns full rows so the caller can pass them to the send tool.
 */
export async function findNewslettersDueToSend(limit = 20) {
  const now = new Date();
  return db
    .select()
    .from(newsletters)
    .where(
      and(
        eq(newsletters.status, 'Scheduled'),
        isNotNull(newsletters.sendDate),
        sql`${newsletters.sendDate} <= ${now}`
      )
    )
    .orderBy(newsletters.sendDate)
    .limit(limit);
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

/**
 * Look up a Donation by Stripe Checkout Session ID and hydrate with
 * the donor&rsquo;s email + name. Used by the claim-match flow to verify
 * a buyer&rsquo;s Shirt + Stay purchase before creating the Sponsorship.
 */
export async function getDonationWithDonorByCheckoutSessionId(
  checkoutSessionId: string
) {
  if (!checkoutSessionId) return null;
  const rows = await db
    .select({
      donationId: donations.id,
      donationSource: donations.donationSource,
      recurringDonation: donations.recurringDonation,
      donationAmount: donations.donationAmount,
      stripeCustomerId: donations.stripeCustomerId,
      donorEmailAtDonation: donations.donorEmailAtDonation,
      donorId: donations.donorId,
      donorEmail: donors.email,
      donorName: donors.name,
    })
    .from(donations)
    .leftJoin(donors, eq(donors.id, donations.donorId))
    .where(eq(donations.stripeCheckoutSessionId, checkoutSessionId))
    .limit(1);
  return rows[0] ?? null;
}

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

// ─── Child updates timeline (sponsor portal) ─────────────────────

/**
 * Published, sponsor-visible updates for a given kid, newest first.
 * Mirrors the Airtable filter `{VisibleToSponsor}=TRUE AND publishedAt
 * IS NOT NULL` against either the new UUID FK or the legacy ChildID
 * text key. Used by the sponsor portal at /api/sponsor/updates.
 */
export async function getPublishedUpdatesForChild(child: {
  id: string;
  childId: string;
}) {
  if (!child.id && !child.childId) return [];
  return db
    .select({
      id: childUpdates.id,
      title: childUpdates.title,
      content: childUpdates.content,
      summary: childUpdates.summary,
      updateType: childUpdates.updateType,
      publishedAt: childUpdates.publishedAt,
      requestedAt: childUpdates.requestedAt,
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
    .orderBy(desc(childUpdates.publishedAt));
}

/**
 * Every Sponsor Message a given sponsor has sent, newest first. Source
 * of truth is the `communications` table (EmailType='Sponsor Message');
 * this powers the "your side of the conversation" panel in the sponsor
 * portal timeline.
 */
export async function getSponsorMessagesByCode(sponsorCode: string) {
  if (!sponsorCode) return [];
  return db
    .select({
      id: communications.id,
      subject: communications.subject,
      status: communications.status,
      sendDate: communications.sendDate,
      createdAt: communications.createdAt,
    })
    .from(communications)
    .where(
      and(
        eq(communications.emailType, 'Sponsor Message'),
        // Subject carries the sponsorCode prefix so we can filter on it
        // without a dedicated column. See recordSponsorMessage().
        sql`${communications.subject} LIKE ${`[${sponsorCode}]%`}`
      )
    )
    .orderBy(desc(communications.createdAt));
}

/**
 * Was a sponsor-update request already submitted today for this code?
 * Used by /api/sponsor/request-update for idempotency — a double-tap
 * within the same UTC day is treated as the same request.
 */
export async function getTodayPendingUpdateRequest(
  sponsorCode: string,
  child: { id: string; childId: string }
) {
  if (!sponsorCode) return null;
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ id: childUpdates.id })
    .from(childUpdates)
    .where(
      and(
        eq(childUpdates.sponsorCode, sponsorCode),
        eq(childUpdates.requestedBySponsor, true),
        or(
          eq(childUpdates.childId, child.id),
          eq(childUpdates.childIdLegacy, child.childId)
        ),
        sql`${childUpdates.requestedAt} >= ${startOfDay}`
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
