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

import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
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
  sotmHistory,
  kidMessages,
  fulfillments,
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

// ─── SOTM history ────────────────────────────────────────────────

/**
 * All Student of the Month awards a kid has earned, newest first.
 * Powers the "Awards from the campus" timeline block on the sponsor-
 * gated view of the kid page.
 *
 * Only returns rows where the archive was written — kids who won
 * SOTM before the sotm_history table existed (i.e. anyone Kevin
 * approved during phase 1 before phase 2 shipped) won't appear here
 * even if the CURRENT children row still has studentOfMonthMonth
 * set. Acceptable seam: the archive is forward-looking from the
 * phase-2 ship.
 */
export interface SotmHistoryEntry {
  id: string;
  gradeCode: string;
  month: string;
  reason: string;
  awardedAt: string;
}

export async function getSotmHistoryForChild(
  childRecordId: string
): Promise<SotmHistoryEntry[]> {
  if (!childRecordId) return [];
  try {
    const rows = await db
      .select({
        id: sotmHistory.id,
        gradeCode: sotmHistory.gradeCode,
        month: sotmHistory.month,
        reason: sotmHistory.reason,
        awardedAt: sotmHistory.awardedAt,
      })
      .from(sotmHistory)
      .where(eq(sotmHistory.childId, childRecordId))
      // Order by month, not awardedAt. awardedAt gets bumped to now()
      // on onConflictDoUpdate — if Kevin corrects an earlier award's
      // reason, that older award's awardedAt jumps forward and outranks
      // newer months in the timeline. month is stable per award and
      // is what "when was this earned" actually means to a sponsor.
      .orderBy(desc(sotmHistory.month));
    return rows.map(r => ({
      id: r.id,
      gradeCode: r.gradeCode,
      month: r.month,
      reason: r.reason,
      awardedAt: new Date(r.awardedAt).toISOString(),
    }));
  } catch {
    return [];
  }
}

// ─── Kid messages / thread view ─────────────────────────────────

export interface NoteThreadEntry {
  id: string;
  direction: 'sponsor_to_kid' | 'kid_to_sponsor';
  bodyEn: string;
  bodyOriginal: string | null;
  status: string;
  createdAt: string;
  deliveredAt: string | null;
  parentMessageId: string | null;
  /**
   * URL of the scanned handwritten reply photo, when this row is a
   * kid_to_sponsor reply that Simon uploaded via the 2026-07-08
   * scanned-reply workflow. Null on:
   *   - sponsor_to_kid rows (always)
   *   - legacy kid_to_sponsor replies recorded before the scan flow
   *     shipped (typed-only)
   * When present, the kid page renders this as the primary content
   * and bodyEn appears below as an italic translation caption.
   */
  replyImageUrl: string | null;
  /**
   * Sponsor-attached photos (2026-07-08). Only populated on
   * sponsor_to_kid rows; null on kid_to_sponsor rows and on
   * pre-migration sponsor notes. Array of public URLs, order-
   * preserved as the sponsor added them. Rendered on the kid page
   * thread as a small strip beneath the sponsor's italic text.
   */
  attachments: string[] | null;
}

/**
 * Every message in the thread between a specific sponsor email and
 * a specific kid, newest first. Includes BOTH sponsor-to-kid rows
 * (the sponsor's notes) and their kid-to-sponsor replies. Rows are
 * fully mixed by timestamp — the kid page renders them chronologically
 * so a sponsor sees each pair together.
 *
 * Used by /children/[N] to surface the "Your thread with [Kid]"
 * section on the sponsor-gated view. Also used by /me later for
 * per-kid thread previews.
 *
 * Returns [] on failure or missing inputs — the caller renders
 * quietly when there's no thread yet.
 */
/**
 * Compact preview of a sponsor's correspondence with one specific
 * kid — powers the "correspondence" block on each /me KidCard.
 *
 * For each kid, returns the SINGLE most recent event (either the
 * sponsor's most recent sent note OR the kid's most recent reply)
 * plus a small count for the "see all N" affordance. Hidden entirely
 * when the sponsor has never written to that kid.
 *
 * Batches every kid into one query — the /me render pattern already
 * has the child UUIDs in memory, so we look them up in a single
 * inArray call and group in code. Zero N+1.
 */
export interface KidCardNotePreview {
  latestKind: 'sent' | 'reply';
  latestDate: string;
  latestBody: string;
  latestStatus: string; // outbound rows carry status; replies default 'delivered'
  latestReplyId: string | null; // for the "reply exists" callout
  outboundCount: number;
  replyCount: number;
  /**
   * When the latest event is a kid_to_sponsor reply with a scanned
   * handwritten photo attached, this is that photo's public URL.
   * Rendered on the /me KidCard as a small thumbnail so the sponsor
   * sees the kid's actual handwriting at a glance. Null on:
   *   - sent (sponsor's own outgoing note is latest)
   *   - legacy typed-only replies
   */
  latestImageUrl: string | null;
  /**
   * When the latest event is the sponsor's OWN outgoing note WITH
   * attached photos, this is the count (0-2). The /me KidCard uses it
   * to render a small "+ N photos" indicator so the sponsor sees at a
   * glance which of their notes carried photos. 0 for text-only
   * outgoing notes and for reply rows (replies use replyImageUrl).
   */
  latestAttachmentCount: number;
}

export async function getNoteThreadPreviewsForSponsor(args: {
  sponsorEmail: string;
  childRecordIds: string[];
}): Promise<Map<string, KidCardNotePreview>> {
  const email = args.sponsorEmail.trim().toLowerCase();
  const uuids = args.childRecordIds.filter(v => !!v);
  const out = new Map<string, KidCardNotePreview>();
  if (!email || uuids.length === 0) return out;
  try {
    const rows = await db
      .select({
        id: kidMessages.id,
        childId: kidMessages.childId,
        direction: kidMessages.direction,
        bodyEn: kidMessages.bodyEn,
        status: kidMessages.status,
        createdAt: kidMessages.createdAt,
        // Every state transition carries its own timestamp so the
        // preview can say "translated 2 hours ago" using the actual
        // translation time, not the write time. Without translatedAt
        // in this SELECT, the "On its way — translated" copy read as
        // the date the SPONSOR wrote it, which was misleading when
        // Simon translated days later.
        translatedAt: kidMessages.translatedAt,
        deliveredAt: kidMessages.deliveredAt,
        parentMessageId: kidMessages.parentMessageId,
        replyImageUrl: kidMessages.replyImageUrl,
        attachments: kidMessages.attachments,
      })
      .from(kidMessages)
      .where(
        and(
          sql`lower(${kidMessages.sponsorEmail}) = ${email}`,
          inArray(kidMessages.childId, uuids),
          // Declined outbound rows are not part of the visible
          // correspondence — same rule the sponsor-facing NotesThread
          // uses on /children/[N]. Kid-to-sponsor rows never carry
          // 'declined' so no special-case needed for them.
          or(
            eq(kidMessages.direction, 'kid_to_sponsor'),
            sql`${kidMessages.status} != 'declined'`
          )
        )
      )
      .orderBy(desc(kidMessages.createdAt));

    // Group per kid, remembering the newest event and running counts.
    interface Bucket {
      newest:
        | typeof rows[number]
        | null;
      outboundCount: number;
      replyCount: number;
    }
    const buckets = new Map<string, Bucket>();
    for (const r of rows) {
      let b = buckets.get(r.childId);
      if (!b) {
        b = { newest: null, outboundCount: 0, replyCount: 0 };
        buckets.set(r.childId, b);
      }
      if (r.direction === 'sponsor_to_kid') b.outboundCount++;
      else if (r.direction === 'kid_to_sponsor') b.replyCount++;
      // rows are already sorted desc by createdAt, so the first row
      // per bucket is the newest.
      if (!b.newest) b.newest = r;
    }

    for (const [childId, b] of buckets) {
      if (!b.newest) continue;
      const isReply = b.newest.direction === 'kid_to_sponsor';
      // Pick the timestamp that MATCHES the status verb the sponsor
      // sees. Replies are always 'delivered' at write time with
      // deliveredAt set, so they're straightforward. Outbound has
      // three visible states, each with its own timestamp — using
      // the wrong one makes copy like "translated 5 days ago" lie
      // about when Simon actually did the work.
      let dateSource: Date | null = null;
      if (isReply) {
        dateSource = b.newest.deliveredAt ?? b.newest.createdAt;
      } else {
        switch (b.newest.status) {
          case 'delivered':
            dateSource =
              b.newest.deliveredAt ?? b.newest.translatedAt ?? b.newest.createdAt;
            break;
          case 'translated':
            dateSource = b.newest.translatedAt ?? b.newest.createdAt;
            break;
          case 'pending':
          default:
            dateSource = b.newest.createdAt;
            break;
        }
      }
      // Attachment count only for latest=sent rows (the sponsor's
      // own outgoing note carrying photos). Replies use
      // replyImageUrl instead. Normalize the jsonb into a length
      // so the preview component doesn't need to parse the shape.
      let latestAttachmentCount = 0;
      if (!isReply) {
        const raw = b.newest.attachments as unknown;
        const arr =
          typeof raw === 'string'
            ? (() => {
                try {
                  return JSON.parse(raw);
                } catch {
                  return null;
                }
              })()
            : raw;
        if (Array.isArray(arr)) latestAttachmentCount = arr.length;
      }
      out.set(childId, {
        latestKind: isReply ? 'reply' : 'sent',
        latestDate: dateSource
          ? new Date(dateSource).toISOString()
          : new Date().toISOString(),
        latestBody: b.newest.bodyEn,
        latestStatus: b.newest.status,
        latestReplyId: isReply ? b.newest.id : null,
        outboundCount: b.outboundCount,
        replyCount: b.replyCount,
        // Only meaningful when the latest event is a reply. The
        // KidCard preview shows a thumbnail when this is set so the
        // sponsor sees the kid's actual handwriting from the /me
        // grid without opening the kid page.
        latestImageUrl: isReply ? b.newest.replyImageUrl : null,
        latestAttachmentCount,
      });
    }
    return out;
  } catch {
    return out;
  }
}

export async function getNoteThreadForSponsorAndChild(args: {
  sponsorEmail: string;
  childRecordId: string;
}): Promise<NoteThreadEntry[]> {
  const email = args.sponsorEmail.trim().toLowerCase();
  if (!email || !args.childRecordId) return [];
  try {
    // Exclude declined sponsor->kid notes from the thread. A declined
    // note never reached the kid, and the sponsor already got a
    // decline email — showing it in the thread anyway reads as
    // "here's your correspondence" and confuses the sponsor. Pending
    // and translated notes DO stay in the thread because the sponsor
    // wrote them and they're on their way; declined is the only
    // status that means "this didn't happen."
    const rows = await db
      .select({
        id: kidMessages.id,
        direction: kidMessages.direction,
        bodyEn: kidMessages.bodyEn,
        bodyTranslated: kidMessages.bodyTranslated,
        status: kidMessages.status,
        createdAt: kidMessages.createdAt,
        deliveredAt: kidMessages.deliveredAt,
        parentMessageId: kidMessages.parentMessageId,
        replyImageUrl: kidMessages.replyImageUrl,
        attachments: kidMessages.attachments,
      })
      .from(kidMessages)
      .where(
        and(
          sql`lower(${kidMessages.sponsorEmail}) = ${email}`,
          eq(kidMessages.childId, args.childRecordId),
          sql`${kidMessages.status} != 'declined'`
        )
      )
      .orderBy(desc(kidMessages.createdAt));
    return rows
      .filter(
        r =>
          r.direction === 'sponsor_to_kid' ||
          r.direction === 'kid_to_sponsor'
      )
      .map(r => ({
        id: r.id,
        direction: r.direction as 'sponsor_to_kid' | 'kid_to_sponsor',
        bodyEn: r.bodyEn,
        // For a kid->sponsor row, body_translated carries the untranslated
        // original transcription (Acholi/Luo) that Simon typed. For a
        // sponsor->kid row, body_translated is Simon's Acholi/Luo
        // translation of the sponsor's English. In both cases the value
        // is "the version in the kid's language."
        bodyOriginal: r.bodyTranslated,
        status: r.status,
        createdAt: r.createdAt
          ? new Date(r.createdAt).toISOString()
          : new Date().toISOString(),
        deliveredAt: r.deliveredAt
          ? new Date(r.deliveredAt).toISOString()
          : null,
        parentMessageId: r.parentMessageId,
        // Only meaningful on kid_to_sponsor rows; sponsor_to_kid rows
        // never carry a photo. The render layer already branches on
        // direction so a stale non-null value here (should never
        // happen given the write path) still wouldn't paint a scan
        // over a sponsor's outgoing note.
        replyImageUrl: r.replyImageUrl,
        // Sponsor attachments come back from Drizzle as either the
        // typed jsonb object OR a JSON string depending on the driver
        // — normalize to a plain string[] of URLs (or null) so the
        // render layer doesn't have to care. Empty arrays become
        // null so the render layer's `attachments ? ...` check works.
        attachments: (() => {
          const raw = r.attachments as unknown;
          if (!raw) return null;
          const arr =
            typeof raw === 'string'
              ? (() => {
                  try {
                    return JSON.parse(raw);
                  } catch {
                    return null;
                  }
                })()
              : raw;
          if (!Array.isArray(arr) || arr.length === 0) return null;
          const urls = arr
            .map(a =>
              typeof a === 'string'
                ? a
                : a && typeof a === 'object' && typeof (a as { url?: unknown }).url === 'string'
                ? (a as { url: string }).url
                : null
            )
            .filter((u): u is string => !!u);
          return urls.length > 0 ? urls : null;
        })(),
      }));
  } catch {
    return [];
  }
}

// ─── Mobile (v1) — dedicated read helpers for /api/mobile/v1/* ───

/**
 * Kids the viewer sponsors OR holds — the "Your kids" list on the
 * mobile home tab. Mirrors the dual-key join used by
 * getViewerSponsorships (UUID FK first, legacy ChildID text second)
 * so transition-state rows still render.
 *
 * Excludes departed kids so the mobile home doesn't surface a card for
 * someone who's no longer on campus (the web /me makes the same call).
 * Returns rows sorted shirt-holders first, then most-recent-first,
 * matching the web /me ordering.
 */
export interface MobileMineKidRow {
  sponsorshipId: string;
  childRecordId: string | null;
  childIdLegacy: string | null;
  firstName: string | null;
  displayName: string | null;
  shirtNumber: number | null;
  profilePhotoUrl: string | null;
  gradeClass: string | null;
  dateOfBirth: Date | null;
  status: string;
  monthlyAmount: string | null;
  childRevealedAt: Date | null;
  createdAt: Date;
}

export async function getMobileMineKidsForEmail(
  viewerEmail: string
): Promise<MobileMineKidRow[]> {
  if (!viewerEmail) return [];
  const emailLower = viewerEmail.toLowerCase();
  const rows = await db
    .select({
      sponsorshipId: sponsorships.id,
      childRecordId: sql<string | null>`coalesce(${children.id}, child_legacy.id)`,
      childIdLegacy: sql<
        string | null
      >`coalesce(${children.childId}, child_legacy.child_id)`,
      firstName: sql<
        string | null
      >`coalesce(${children.firstName}, child_legacy.first_name)`,
      displayName: sql<
        string | null
      >`coalesce(${children.displayName}, child_legacy.display_name)`,
      shirtNumber: sql<
        number | null
      >`coalesce(${children.shirtNumber}, child_legacy.shirt_number)`,
      profilePhotoUrl: sql<
        string | null
      >`coalesce(${children.profilePhotoUrl}, child_legacy.profile_photo_url)`,
      gradeClass: sql<
        string | null
      >`coalesce(${children.gradeClass}, child_legacy.grade_class)`,
      dateOfBirth: sql<
        Date | null
      >`coalesce(${children.dateOfBirth}, child_legacy.date_of_birth)`,
      childDepartedAt: sql<
        Date | null
      >`coalesce(${children.departedAt}, child_legacy.departed_at)`,
      status: sponsorships.status,
      monthlyAmount: sponsorships.monthlyAmount,
      childRevealedAt: sponsorships.childRevealedAt,
      createdAt: sponsorships.createdAt,
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

  return rows
    .filter(r => !r.childDepartedAt)
    .sort((a, b) => {
      // Shirt-holder-sponsors first (they claimed this number physically),
      // then by createdAt desc.
      const aHolds = a.childRevealedAt ? 1 : 0;
      const bHolds = b.childRevealedAt ? 1 : 0;
      if (aHolds !== bHolds) return bHolds - aHolds;
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    })
    .map(r => ({
      sponsorshipId: r.sponsorshipId,
      childRecordId: r.childRecordId,
      childIdLegacy: r.childIdLegacy,
      firstName: r.firstName,
      displayName: r.displayName,
      shirtNumber: r.shirtNumber,
      profilePhotoUrl: r.profilePhotoUrl,
      gradeClass: r.gradeClass,
      dateOfBirth: r.dateOfBirth,
      status: r.status,
      monthlyAmount: r.monthlyAmount,
      childRevealedAt: r.childRevealedAt,
      createdAt: r.createdAt,
    }));
}

/**
 * Latest N published updates across every kid — mobile campus feed.
 * Optionally exclude a specific email's kids (not typically used —
 * feed is global across kids the viewer follows and doesn't). Returns
 * newest first with an optional `before` cursor for pagination.
 */
export interface CampusFeedUpdateRow {
  id: string;
  publishedAt: Date;
  title: string | null;
  summary: string | null;
  positiveHighlight: string | null;
  content: string | null;
  photoUrls: string[] | null;
  childRecordId: string | null;
  childIdLegacy: string | null;
  childFirstName: string | null;
  childShirtNumber: number | null;
}

export async function getCampusFeedUpdates(args: {
  limit: number;
  before?: Date | null;
}): Promise<CampusFeedUpdateRow[]> {
  const conditions = [
    eq(childUpdates.visibleToSponsor, true),
    isNotNull(childUpdates.publishedAt),
  ];
  if (args.before) {
    conditions.push(sql`${childUpdates.publishedAt} < ${args.before}`);
  }
  const rows = await db
    .select({
      id: childUpdates.id,
      publishedAt: childUpdates.publishedAt,
      title: childUpdates.title,
      summary: childUpdates.summary,
      positiveHighlight: childUpdates.positiveHighlight,
      content: childUpdates.content,
      photoUrls: childUpdates.photoUrls,
      childRecordId: sql<
        string | null
      >`coalesce(${children.id}, child_legacy.id)`,
      childIdLegacy: sql<
        string | null
      >`coalesce(${children.childId}, child_legacy.child_id)`,
      childFirstName: sql<
        string | null
      >`coalesce(${children.firstName}, child_legacy.first_name)`,
      childShirtNumber: sql<
        number | null
      >`coalesce(${children.shirtNumber}, child_legacy.shirt_number)`,
    })
    .from(childUpdates)
    .leftJoin(children, eq(children.id, childUpdates.childId))
    .leftJoin(
      sql`children as child_legacy`,
      sql`child_legacy.child_id = ${childUpdates.childIdLegacy}`
    )
    .where(and(...conditions))
    .orderBy(desc(childUpdates.publishedAt))
    .limit(args.limit);
  return rows.map(r => ({
    id: r.id,
    publishedAt: r.publishedAt as Date,
    title: r.title,
    summary: r.summary,
    positiveHighlight: r.positiveHighlight,
    content: r.content,
    photoUrls: (r.photoUrls as string[] | null) ?? null,
    childRecordId: r.childRecordId,
    childIdLegacy: r.childIdLegacy,
    childFirstName: r.childFirstName,
    childShirtNumber: r.childShirtNumber,
  }));
}

/**
 * All SOTM awards across the campus, newest first — used to interleave
 * with campus feed updates when we mix event types.
 */
export interface CampusFeedSotmRow {
  id: string;
  awardedAt: Date;
  month: string;
  gradeCode: string;
  reason: string;
  childRecordId: string;
  childFirstName: string | null;
  childShirtNumber: number | null;
  childPhotoUrl: string | null;
}

export async function getCampusFeedSotm(args: {
  limit: number;
  before?: Date | null;
}): Promise<CampusFeedSotmRow[]> {
  const conditions = [sql`1=1`];
  if (args.before) {
    conditions.push(sql`${sotmHistory.awardedAt} < ${args.before}`);
  }
  const rows = await db
    .select({
      id: sotmHistory.id,
      awardedAt: sotmHistory.awardedAt,
      month: sotmHistory.month,
      gradeCode: sotmHistory.gradeCode,
      reason: sotmHistory.reason,
      childRecordId: sotmHistory.childId,
      childFirstName: children.firstName,
      childShirtNumber: children.shirtNumber,
      childPhotoUrl: children.profilePhotoUrl,
    })
    .from(sotmHistory)
    .leftJoin(children, eq(children.id, sotmHistory.childId))
    .where(and(...conditions))
    .orderBy(desc(sotmHistory.awardedAt))
    .limit(args.limit);
  return rows.map(r => ({
    id: r.id,
    awardedAt: r.awardedAt,
    month: r.month,
    gradeCode: r.gradeCode,
    reason: r.reason,
    childRecordId: r.childRecordId,
    childFirstName: r.childFirstName,
    childShirtNumber: r.childShirtNumber,
    childPhotoUrl: r.childPhotoUrl,
  }));
}

/**
 * The signed-in viewer's Buyer Home data. Purchase rows come from the
 * `fulfillments` table (source of truth for shirts shipped) with the
 * matching `donations.amount` when we can resolve the pair. Billing
 * fields come off the linked `donors` row's Stripe customer.
 */
export interface MobileMePurchaseRow {
  fulfillmentId: string;
  orderNumber: number | null;
  size: string | null;
  color: string | null;
  design: string | null;
  orderDate: Date | null;
  createdAt: Date;
}

export async function getPurchasesForEmail(
  viewerEmail: string
): Promise<MobileMePurchaseRow[]> {
  if (!viewerEmail) return [];
  const emailLower = viewerEmail.toLowerCase();
  const rows = await db
    .select({
      fulfillmentId: fulfillments.id,
      orderNumber: fulfillments.orderNumber,
      size: fulfillments.size,
      color: fulfillments.shirtColor,
      design: fulfillments.design,
      orderDate: fulfillments.orderDate,
      createdAt: fulfillments.createdAt,
    })
    .from(fulfillments)
    .where(sql`lower(${fulfillments.buyerEmail}) = ${emailLower}`)
    .orderBy(desc(fulfillments.orderDate), desc(fulfillments.createdAt));
  return rows.map(r => ({
    fulfillmentId: r.fulfillmentId,
    orderNumber: r.orderNumber,
    size: r.size,
    color: r.color,
    design: r.design,
    orderDate: r.orderDate ? new Date(r.orderDate) : null,
    createdAt: r.createdAt,
  }));
}

/**
 * Kids browsable in the Explore tab — Active, on-campus kids with a
 * profile photo. Optionally excludes a set of childRecordIds so the
 * viewer's sponsored kids don't show up again in Explore.
 */
export interface MobileExploreKidRow {
  id: string;
  firstName: string | null;
  shirtNumber: number | null;
  profilePhotoUrl: string | null;
  gradeClass: string | null;
  dateOfBirth: Date | null;
}

export async function getExploreKids(args: {
  limit: number;
  excludeChildIds?: string[];
}): Promise<MobileExploreKidRow[]> {
  const conditions = [
    or(
      eq(children.status, 'Active'),
      eq(children.status, 'active'),
      eq(children.status, 'New')
    ),
    sql`${children.departedAt} IS NULL`,
    isNotNull(children.profilePhotoUrl),
    isNotNull(children.shirtNumber),
  ];
  const excluded = (args.excludeChildIds ?? []).filter(v => !!v);
  if (excluded.length > 0) {
    conditions.push(sql`${children.id} NOT IN (${sql.join(
      excluded.map(id => sql`${id}`),
      sql`, `
    )})`);
  }
  const rows = await db
    .select({
      id: children.id,
      firstName: children.firstName,
      shirtNumber: children.shirtNumber,
      profilePhotoUrl: children.profilePhotoUrl,
      gradeClass: children.gradeClass,
      dateOfBirth: children.dateOfBirth,
    })
    .from(children)
    .where(and(...conditions))
    .orderBy(children.shirtNumber)
    .limit(args.limit);
  return rows.map(r => ({
    id: r.id,
    firstName: r.firstName,
    shirtNumber: r.shirtNumber,
    profilePhotoUrl: r.profilePhotoUrl,
    gradeClass: r.gradeClass,
    dateOfBirth: r.dateOfBirth ? new Date(r.dateOfBirth) : null,
  }));
}

/**
 * Total delivered notes count for a (sponsor, kid) pair. Used by
 * mobile /kids/mine to compute unread-updates count later — for now
 * we return a placeholder of 0 unread; when the read-state table
 * exists this helper will do the real math.
 */
export async function countDeliveredKidReplies(args: {
  sponsorEmail: string;
  childRecordId: string;
}): Promise<number> {
  const email = args.sponsorEmail.toLowerCase();
  if (!email || !args.childRecordId) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(kidMessages)
    .where(
      and(
        sql`lower(${kidMessages.sponsorEmail}) = ${email}`,
        eq(kidMessages.childId, args.childRecordId),
        eq(kidMessages.direction, 'kid_to_sponsor')
      )
    );
  return rows[0]?.n ?? 0;
}
