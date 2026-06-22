import { cache } from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RevealBeacon } from './RevealBeacon';
import { RevealOverlay } from './RevealOverlay';
import { ReassignReveal } from './ReassignReveal';
import { SponsorButton } from './SponsorButton';
import { ClaimMatchCard } from './ClaimMatchCard';
import { SponsorPortalSections } from './SponsorPortalSections';
import { CampusNewsfeed } from './CampusNewsfeed';
import {
  getRecentCampusNewsletters,
  type CampusNewsletterEntry,
} from '@/lib/newsletter-feed';
import { SponsorRecoveryForm } from './SponsorRecoveryForm';
import { OtherKidsAtCampus } from './OtherKidsAtCampus';
import { ClaimThisNumberCard } from './ClaimThisNumberCard';
import { ClaimGate } from './ClaimGate';
import { YourKidsStrip } from '@/components/YourKidsStrip';
import { AlreadySponsoringBanner } from './AlreadySponsoringBanner';
import { RecentKidsTracker } from '@/components/RecentKidsTracker';
import { RecentKidsStrip } from '@/components/RecentKidsStrip';
import { SESSION } from '@/lib/constants';
import {
  getChildByShirtNumber as getChildByShirtNumberFromDb,
  getChildByChildId,
  getDonorByStripeCustomerId,
} from '@/lib/db/queries';
import { resolveShirtToKid } from '@/lib/cycle';
import { db } from '@/lib/db/client';
import {
  children as childrenTable,
  sponsorships as sponsorshipsTable,
  donations as donationsTable,
  childUpdates as childUpdatesTable,
  type Child,
  type Sponsorship,
} from '@/lib/db/schema';
import { and, desc, eq, ilike, isNotNull, or, sql as drizzleSql } from 'drizzle-orm';

// Never statically optimize or cache this page. Sponsorship status and child
// data changes over time, and a stale empty cache entry would manifest as a
// false 404 on active numbers.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── Postgres → Airtable-shape adapters ────────────────────────────
//
// The page's render code was written for Airtable's PascalCase field
// shape (`f.ChildID`, `f.ProfilePhoto[0].url`, etc.). Rather than
// rewriting hundreds of lines of JSX, we project Postgres rows into
// the same shape and hand the existing code untouched objects.

function childToAirtableFields(c: Child): AirtableChildRecord['fields'] {
  return {
    ChildID: c.childId ?? undefined,
    DisplayName: c.displayName ?? undefined,
    FirstName: c.firstName ?? undefined,
    LastInitial: c.lastInitial ?? undefined,
    ShirtNumber: c.shirtNumber ?? undefined,
    GradeClass: c.gradeClass ?? undefined,
    ProfilePhoto: c.profilePhotoUrl
      ? [{ url: c.profilePhotoUrl, filename: '' }]
      : undefined,
    Notes: c.notes ?? undefined,
    Status: c.status ?? undefined,
    DateOfBirth: c.dateOfBirth ?? undefined,
    ReservedForAuction: c.reservedForAuction ?? undefined,
    ShirtAssignedAt: c.shirtAssignedAt
      ? new Date(c.shirtAssignedAt).toISOString()
      : undefined,
    HomeVillage: c.homeVillage ?? undefined,
    FamilyContext: c.familyContext ?? undefined,
    Loves: c.loves ?? undefined,
    ChildQuote: c.childQuote ?? undefined,
    TeacherName: c.teacherName ?? undefined,
    TeacherQuote: c.teacherQuote ?? undefined,
    NameMeaning: c.nameMeaning ?? undefined,
    StudentOfMonth: c.studentOfMonth ? 'true' : undefined,
    StudentOfMonthReason: c.studentOfMonthReason ?? undefined,
    DepartedAt: c.departedAt ? new Date(c.departedAt).toISOString() : undefined,
    DepartureNote: c.departureNote ?? undefined,
    // ReportCards and Letters aren't in the migrated schema (no
    // Airtable attachment column was preserved). The render code
    // tolerates empty arrays.
    ReportCards: [],
    Letters: [],
  };
}

function sponsorshipToAirtableFields(
  s: Sponsorship,
  child?: Child | null
): AirtableSponsorshipRecord['fields'] {
  return {
    ChildID: s.childIdLegacy ?? child?.childId ?? undefined,
    ChildDisplayName: s.childDisplayName ?? child?.displayName ?? undefined,
    ChildAge: s.childAge ?? undefined,
    ChildLocation: s.childLocation ?? undefined,
    ChildPhoto: child?.profilePhotoUrl
      ? [{ url: child.profilePhotoUrl, filename: '' }]
      : undefined,
    Status: s.status ?? undefined,
    SponsorCode: s.sponsorCode ?? undefined,
    SponsorshipStartDate: s.sponsorshipStartDate ?? undefined,
    MonthlyAmount: s.monthlyAmount ? Number(s.monthlyAmount) : undefined,
    ChildRevealedAt: s.childRevealedAt
      ? new Date(s.childRevealedAt).toISOString()
      : undefined,
    LastReassignedAt: s.lastReassignedAt
      ? new Date(s.lastReassignedAt).toISOString()
      : undefined,
    PreviousChildIDs: s.previousChildIds ?? undefined,
  };
}

interface ChildPageProps {
  params: Promise<{ number: string }>;
  searchParams?: Promise<{ gift?: string; from?: string; just_signed_in?: string }>;
}

interface AirtableChildRecord {
  id: string;
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    LastInitial?: string;
    ShirtNumber?: number;
    GradeClass?: string;
    ProfilePhoto?: Array<{ url: string; filename: string }>;
    Notes?: string;
    Status?: string;
    DateOfBirth?: string;
    ReservedForAuction?: boolean;
    ShirtAssignedAt?: string;
    // ── Structured profile fields populated via the YDO intake form.
    // Rendered conditionally on the profile page — empty = hidden block.
    HomeVillage?: string;
    FamilyContext?: string;
    Loves?: string;
    ChildQuote?: string;
    TeacherName?: string;
    TeacherQuote?: string;
    NameMeaning?: string;
    StudentOfMonth?: string;
    StudentOfMonthReason?: string;
    DepartedAt?: string;
    DepartureNote?: string;
    // ── Sponsor-only attachments uploaded via /admin/roster/[number].
    ReportCards?: Array<{ id: string; url: string; filename: string; size?: number; type?: string; thumbnails?: { large?: { url: string }; small?: { url: string } } }>;
    Letters?: Array<{ id: string; url: string; filename: string; size?: number; type?: string; thumbnails?: { large?: { url: string }; small?: { url: string } } }>;
  };
}

interface AirtableSponsorshipRecord {
  id: string;
  fields: {
    ChildID?: string;
    ChildDisplayName?: string;
    ChildAge?: string;
    ChildLocation?: string;
    ChildPhoto?: Array<{ url: string; filename: string }>;
    Status?: string;
    SponsorCode?: string;
    SponsorshipStartDate?: string;
    MonthlyAmount?: number;
    ChildRevealedAt?: string;
    LastReassignedAt?: string;
    PreviousChildIDs?: string;
    PendingCandidateChildIDs?: string;
  };
}

/** Read the sponsor_session cookie and return the sponsorCode if valid. */
async function getViewerSponsorCode(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return null;
    const session = JSON.parse(raw.value);
    if (new Date(session.expires) < new Date()) return null;
    return session.sponsorCode || null;
  } catch {
    return null;
  }
}

/**
 * Read the sponsor_session cookie and return the signed-in email.
 * This is the multi-kid identity primitive: one email may own many
 * Sponsorships across many kids. Pages should check identity via
 * email + "Sponsorship for this specific child exists?" rather than
 * via the cookie's single sponsorCode (which is single-kid-bound).
 */
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

/**
 * Multi-kid sponsor recognition. Given a signed-in email and a
 * child's Airtable record ID, return the matching Sponsorship if
 * the email owns this kid (any Active or Holder relationship). Used
 * to flip the kid page into sponsor view for someone whose cookie
 * doesn't carry the sponsorCode of THIS specific kid (e.g., they
 * signed in via a different kid's magic link, or they have multiple
 * Sponsorships).
 */
async function findSponsorshipByEmailForChild(
  email: string,
  childId: string
): Promise<AirtableSponsorshipRecord['fields'] | null> {
  if (!email || !childId) return null;
  try {
    // Find the child row (UUID + legacy ChildID) so we can dual-match.
    const child = await getChildByChildId(childId);
    const childUuid = child?.id;

    const rows = await db
      .select()
      .from(sponsorshipsTable)
      .where(
        and(
          ilike(sponsorshipsTable.sponsorEmail, email),
          or(
            eq(sponsorshipsTable.status, 'Active'),
            eq(sponsorshipsTable.status, 'Holder')
          ),
          or(
            childUuid ? eq(sponsorshipsTable.childId, childUuid) : drizzleSql`false`,
            eq(sponsorshipsTable.childIdLegacy, childId)
          )
        )
      )
      .limit(1);
    if (!rows[0]) return null;
    return sponsorshipToAirtableFields(rows[0], child ?? null);
  } catch {
    return null;
  }
}

/** Read the ban_buyer_session cookie set on /shirts/success. Returns the
 *  Stripe Checkout Session ID (cs_...) if present and well-formed,
 *  otherwise null. Memo §2 one-tap prerequisite. */
async function getBuyerSessionId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('ban_buyer_session');
    if (!raw) return null;
    const v = raw.value.trim();
    if (!v.startsWith('cs_')) return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * Resolve the visitor's buyer context from their `ban_buyer_session`
 * cookie. Under the May 2026 stockpile model, buyer-side Donations no
 * longer carry a Child link (the match isn't known at checkout), so
 * we identify the buyer purely by their Stripe Checkout Session ID
 * and pass that identity through to two downstream consumers:
 *
 *   1. The SponsorButton, which prefills checkout with the buyer's
 *      saved payment method when they tap "sponsor this kid."
 *   2. The ClaimMatchCard, which only renders for Shirt + Stay buyers
 *      who haven't yet claimed any child — turning their first
 *      /[number] visit into the match event.
 *
 * Returns null only when the cookie's Donation can't be resolved at
 * all (most likely a forged or expired cookie). A real buyer with
 * any donation source resolves successfully.
 */
async function resolveBuyerContext(
  sessionId: string
): Promise<{
  customerId: string | null;
  email: string | null;
  donorRecordId: string | null;
  isShirtMonthly: boolean;
} | null> {
  if (!sessionId.startsWith('cs_')) return null;
  try {
    const rows = await db
      .select()
      .from(donationsTable)
      .where(eq(donationsTable.stripeCheckoutSessionId, sessionId))
      .limit(1);
    if (!rows[0]) return null;
    const donation = rows[0];
    const source = donation.donationSource || '';
    const isRecurring = Boolean(donation.recurringDonation);
    return {
      customerId: donation.stripeCustomerId,
      email: donation.donorEmailAtDonation,
      // The render code only checks truthiness of donorRecordId. We pass
      // the Postgres donor UUID; downstream code uses it to look up
      // "donor already has an active sponsorship?" via the same id.
      donorRecordId: donation.donorId,
      isShirtMonthly: source === 'Shirt + Monthly' && isRecurring,
    };
  } catch (err) {
    console.warn('[children/page] Buyer context lookup failed', err);
    return null;
  }
}

/**
 * Pull the most recent visible Child Update for a specific child. The
 * sponsor view surfaces this above the merch grid as "the latest from
 * {firstName}" — photos and short updates the YDO team batches each
 * term. Drafts and rejected records stay hidden via VisibleToSponsor.
 */
async function getLatestChildUpdate(
  child: { id: string; childId: string }
): Promise<{
  title: string;
  content: string;
  photos: Array<{ url: string; filename?: string }>;
  updateDate?: string;
} | null> {
  if (!child.id && !child.childId) return null;
  try {
    // Dual-match on UUID + legacy ChildID so cycle records (which
    // carry legacy ChildID HSP/BAN-NNN but no canonical UUID) still
    // surface their canonical kid&rsquo;s updates. Order by publishedAt
    // (actual publish event) not updateDate (editorial date) — two
    // updates from the same field day can publish out of order, and
    // the published date is what sponsors see.
    const rows = await db
      .select({
        title: childUpdatesTable.title,
        content: childUpdatesTable.content,
        photoUrls: childUpdatesTable.photoUrls,
        publishedAt: childUpdatesTable.publishedAt,
        updateDate: childUpdatesTable.updateDate,
      })
      .from(childUpdatesTable)
      .where(
        and(
          eq(childUpdatesTable.visibleToSponsor, true),
          isNotNull(childUpdatesTable.publishedAt),
          or(
            child.id ? eq(childUpdatesTable.childId, child.id) : drizzleSql`false`,
            eq(childUpdatesTable.childIdLegacy, child.childId)
          )
        )
      )
      .orderBy(desc(childUpdatesTable.publishedAt))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    const photos = (r.photoUrls as string[] | null) ?? [];
    return {
      title: r.title || '',
      content: r.content || '',
      photos: photos.map(url => ({ url })),
      updateDate: r.updateDate ?? undefined,
    };
  } catch (err) {
    console.warn('[children/page] Child Update fetch failed', err);
    return null;
  }
}

/**
 * Compute retention-friendly impact stats from the sponsorship start
 * date. These are honest descriptions of what the campus has been
 * doing while the sponsor has been on board — not 1:1 financial
 * earmarking (see funding_model.md).
 */
function computeSponsorStats(startDate: string | undefined, monthlyAmount = 25): {
  daysAsSponsor: number;
  mealsSupported: number;
  schoolDaysSupported: number;
  totalContributedUsd: number;
} {
  if (!startDate) {
    return { daysAsSponsor: 0, mealsSupported: 0, schoolDaysSupported: 0, totalContributedUsd: 0 };
  }
  const start = new Date(startDate);
  const now = new Date();
  const ms = Math.max(0, now.getTime() - start.getTime());
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  // Two campus meals per child per day (porridge in the morning, hot lunch).
  const meals = days * 2;
  // School-week ratio applied to the elapsed days.
  const schoolDays = Math.round(days * (5 / 7));
  // Months elapsed, charged monthly at monthlyAmount.
  const monthsElapsed = Math.max(1, Math.floor(days / 30) + 1);
  const total = monthsElapsed * monthlyAmount;
  return {
    daysAsSponsor: days,
    mealsSupported: meals,
    schoolDaysSupported: schoolDays,
    totalContributedUsd: total,
  };
}

/**
 * Returns true when this donor already has an Active Sponsorship in
 * Airtable. We use this to suppress the ClaimMatchCard for buyers
 * who've already claimed (or were manually sponsored by Kevin) — the
 * card should only fire on the first /[number] visit by a brand-new
 * Shirt + Stay buyer. Multi-child sponsorship is still supported via
 * the normal sponsor button.
 */
/**
 * The Postgres sponsorships table doesn&rsquo;t carry a direct donor FK
 * (we kept the Airtable era&rsquo;s denormalized model: each sponsorship
 * stores the SPONSOR EMAIL, and donors are joined by email). To
 * answer &ldquo;does this donor have any active sponsorship?&rdquo; we look up
 * the donor&rsquo;s email by id, then search sponsorships by that email.
 *
 * `donorRecordId` here is the Postgres donors.id UUID (passed
 * through from resolveBuyerContext).
 */
/**
 * The Postgres sponsorships table doesn&rsquo;t carry a direct donor FK
 * (we kept the Airtable era&rsquo;s denormalized model: each sponsorship
 * stores the SPONSOR EMAIL, and donors are joined by email). To
 * answer &ldquo;does this donor have any active sponsorship?&rdquo; we look up
 * the donor&rsquo;s email by id, then search sponsorships by that email.
 *
 * `donorRecordId` here is the Postgres donors.id UUID, passed through
 * from resolveBuyerContext.
 */
async function donorHasActiveSponsorship(donorRecordId: string): Promise<boolean> {
  if (!donorRecordId) return false;
  try {
    const donor = await db.execute(
      drizzleSql`select email from donors where id = ${donorRecordId} limit 1`
    );
    const donorRows = (donor as unknown as { rows?: Array<{ email: string }> }).rows
      ?? (donor as unknown as Array<{ email: string }>);
    const email = donorRows?.[0]?.email;
    if (!email) return false;

    const rows = await db
      .select({ id: sponsorshipsTable.id })
      .from(sponsorshipsTable)
      .where(
        and(
          ilike(sponsorshipsTable.sponsorEmail, email),
          eq(sponsorshipsTable.status, 'Active')
        )
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    console.warn('[children/page] Donor sponsorship check failed', err);
    // Fail OPEN: when we can&rsquo;t check, show the claim card. A
    // doubled CTA is recoverable; silently hiding the conversion
    // ritual for new shirt+monthly buyers is not. The original
    // &ldquo;fail closed&rdquo; pattern hid the card on any transient DB
    // hiccup, which broke conversion under any latency spike. The
    // claim API itself is idempotent on the back end, so a
    // double-tap can&rsquo;t cause a double-claim race.
    return false;
  }
}

/**
 * Cycle-number → canonical-kid resolver.
 *
 * BAN's roster has 53 real children (shirt numbers 1–53). Shirt
 * numbers 54+ are cycle records, looking up the canonical kid's
 * photo/bio at render time. Cycle records carry the kid's name +
 * status but typically lack the photo/bio fields, so /[number]
 * looks up the canonical record at render time and merges those
 * fields onto the cycle record. The cycle record's ShirtNumber
 * and ChildID stay authoritative — sponsorships/donations link to
 * the cycle record, not the canonical one.
 *
 * Two cycle eras live side by side:
 *
 *   Era 1 (#54–150): 52-wide cycle covering roster #2–53. Naume (#1)
 *     was excluded from the original cycle. So #54 = #2, #105 = #53,
 *     #106 = #2 (next loop), …, #150 = #46. Existing data ships
 *     against this formula and we don't disturb it.
 *
 *   Era 2 (#151 and up): 53-wide cycle covering the full roster
 *     #1–53. Naume is in from here on. So #151 = #1, #152 = #2, …,
 *     #203 = #53, #204 = #1 (next loop), and so on.
 *
 * Roster gap note: #47 has no real child enrolled. We populated its
 * Children record with a full copy of Asenath (#3) so /47 renders
 * exactly like /3. If Asenath's data ever changes, re-sync #47 in
 * Airtable too (cheap one-time copy, no special render path needed).
 */
function canonicalShirtNumber(n: number): number | null {
  if (n <= 53) return null;
  if (n <= 150) return ((n - 54) % 52) + 2;
  return ((n - 151) % 53) + 1;
}

// React cache() deduplicates calls within a single server request.
// Both generateMetadata() and the page component call this function,
// so without cache() the page would hit Postgres twice per kid render.
const getChildByShirtNumber = cache(async function getChildByShirtNumber(shirtNumber: number) {
  try {
    let childRow = await getChildByShirtNumberFromDb(shirtNumber);

    // Track whether the row came from real DB data or was synthesized
    // via cycle math. Sponsorships are keyed to specific Children
    // rows; a synthesized row has no real id and must NOT be
    // UUID-matched against existing sponsorships (that would leak
    // the canonical kid's sponsor onto every cycle shirt).
    let isSynthesizedCycleRow = false;

    // Cycle-math fallback: if no Children row carries this shirt
    // number, resolve via the Batches table&rsquo;s locked roster
    // snapshot (cycle.ts). The Batches model is the source of
    // truth for shirt N → kid mapping per core_model.md §2; new
    // batches Kevin opens past #150 will Just Work because the
    // resolver reads from DB, not a hardcoded formula. If Batches
    // returns nothing (e.g., shirt sold under a batch we haven&rsquo;t
    // opened yet), we fall back to the hardcoded canonical formula
    // as a safety net — that path will retire once every shirt has
    // a Batches row covering it.
    if (!childRow) {
      let canonicalChildId: string | null = null;
      try {
        const resolved = await resolveShirtToKid(shirtNumber);
        if (resolved?.childRecordId) {
          canonicalChildId = resolved.childRecordId;
        }
      } catch (e) {
        console.warn('[children/page] Batches resolver failed', e);
      }

      let canonical = canonicalChildId
        ? await getChildByChildId(canonicalChildId)
        : null;

      // Hardcoded-formula fallback for any shirt that doesn&rsquo;t
      // resolve via Batches. Keep until every batch is in the DB.
      if (!canonical) {
        const canonicalNum = canonicalShirtNumber(shirtNumber);
        if (canonicalNum) {
          canonical = await getChildByShirtNumberFromDb(canonicalNum);
        }
      }

      if (canonical) {
        // Synthesize a cycle-record: canonical kid's data, but
        // identity (shirt_number, child_id) stays bound to the
        // requested cycle shirt number. The synthesized row has
        // id='' so downstream sponsorship lookups do NOT match
        // the canonical kid's UUID — only legacy ChildID matches
        // count for cycle records. This is the privacy boundary:
        // a sponsor of Isaiah (#15) must not be recognized on
        // every cycle shirt that maps to #15 (#67, #119, …).
        childRow = {
          ...canonical,
          id: '',
          shirtNumber: shirtNumber,
          childId: `HSP/BAN-${String(shirtNumber).padStart(3, '0')}`,
        };
        isSynthesizedCycleRow = true;
      }
    }

    if (!childRow) {
      console.warn('[children/page] No child record found for shirt number', {
        shirtNumber,
      });
      return null;
    }

    const recordId = childRow.id;
    const baseChild = childToAirtableFields(childRow);

    // Cycle-record fallback: if this is a cycle number and the
    // current record lacks photo + structured fields, fetch the
    // canonical kid's record and merge their profile fields onto
    // ours. Identity fields (ShirtNumber, ChildID, DisplayName) stay
    // with the cycle record; presentation fields (ProfilePhoto,
    // HomeVillage, FamilyContext, ChildQuote, etc.) come from the
    // canonical kid. Almost always a no-op in the Postgres world
    // because every children row carries its own data.
    const canonicalNum = canonicalShirtNumber(shirtNumber);
    const isSparse = !(baseChild.ProfilePhoto?.length) &&
      !baseChild.HomeVillage &&
      !baseChild.FamilyContext &&
      !baseChild.Loves &&
      !baseChild.ChildQuote &&
      !baseChild.TeacherQuote &&
      !baseChild.NameMeaning &&
      !baseChild.Notes;
    let canonicalChildFields: AirtableChildRecord['fields'] | null = null;
    if (canonicalNum && isSparse) {
      try {
        const canonRow = await getChildByShirtNumberFromDb(canonicalNum);
        if (canonRow) canonicalChildFields = childToAirtableFields(canonRow);
      } catch {
        // Best effort — fall through to whatever the cycle record has.
      }
    }

    // Build the effective child fields: cycle-record identity overrides,
    // canonical kid's presentation fields fill in the gaps.
    const child: AirtableChildRecord['fields'] = canonicalChildFields
      ? {
          ...canonicalChildFields,
          // Identity stays with this number's record:
          ChildID: baseChild.ChildID || canonicalChildFields.ChildID,
          ShirtNumber: baseChild.ShirtNumber,
          DisplayName: baseChild.DisplayName || canonicalChildFields.DisplayName,
          FirstName: baseChild.FirstName || canonicalChildFields.FirstName,
          LastInitial: baseChild.LastInitial || canonicalChildFields.LastInitial,
          Status: baseChild.Status || canonicalChildFields.Status,
          ReservedForAuction: baseChild.ReservedForAuction,
          ShirtAssignedAt: baseChild.ShirtAssignedAt,
        }
      : baseChild;
    const childId = child.ChildID;

    // Reserved-for-auction numbers short-circuit here. The Child record exists
    // to hold the number, but we don't want to expose placeholder details
    // publicly. Caller will render a dedicated "reserved" view instead.
    if (child.ReservedForAuction) {
      return {
        reserved: true as const,
        child_id: childId || `RESERVED-${shirtNumber}`,
        display_name: '',
        first_name: undefined,
        age: undefined,
        grade_class: undefined,
        fun_fact: undefined,
        photo_url: undefined,
        location: 'Gulu, Northern Uganda',
        sponsorship_status: undefined,
      };
    }

    // Fire the sponsorship lookup and cookie read in parallel.
    // The sponsorship call depends on childId but NOT on the cookie,
    // and the cookie read is pure I/O — no reason to serialize them.
    //
    // Synthesized cycle rows MUST NOT UUID-match against the
    // canonical kid&rsquo;s actual sponsorships — that would render a
    // canonical kid&rsquo;s sponsor as the recognized owner on every
    // cycle shirt that maps to them. The legacy ChildID text match
    // is the correct identity for cycle records (HSP/BAN-NNN where
    // NNN is the shirt number, distinct from the canonical kid&rsquo;s
    // own ChildID).
    let sponsorship: AirtableSponsorshipRecord['fields'] | null = null;
    const sponsorshipPromise = childId
      ? (async () => {
          try {
            const childIdClause = eq(sponsorshipsTable.childIdLegacy, childId);
            const where =
              isSynthesizedCycleRow || !recordId
                ? childIdClause
                : or(childIdClause, eq(sponsorshipsTable.childId, recordId));
            const rows = await db
              .select()
              .from(sponsorshipsTable)
              .where(where)
              .orderBy(desc(sponsorshipsTable.createdAt))
              .limit(1);
            if (rows[0]) return sponsorshipToAirtableFields(rows[0], childRow);
          } catch {
            // Sponsorship lookup is optional.
          }
          return null;
        })()
      : Promise.resolve(null);

    const [sponsorshipResult, viewerCode, viewerEmail] = await Promise.all([
      sponsorshipPromise,
      getViewerSponsorCode(),
      getViewerEmail(),
    ]);
    sponsorship = sponsorshipResult;

    // Multi-kid identity. If the signed-in email owns ANY Active or
    // Holder sponsorship that links to this kid's record, treat them
    // as the sponsor — even if the cookie's sponsorCode points to a
    // different kid. This is what makes the "family of sponsorships"
    // pattern work: one email, many kids, recognized everywhere.
    let emailMatchedSponsorship: AirtableSponsorshipRecord['fields'] | null = null;
    if (viewerEmail) {
      emailMatchedSponsorship = await findSponsorshipByEmailForChild(
        viewerEmail,
        childId || ''
      );
    }

    let age: string | undefined = sponsorship?.ChildAge;
    if (!age && child.DateOfBirth) {
      const birthDate = new Date(child.DateOfBirth);
      const today = new Date();
      const years = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      age = String(monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? years - 1 : years);
    }

    const photo = child.ProfilePhoto?.[0]?.url || sponsorship?.ChildPhoto?.[0]?.url;
    // Full gallery — used for the carousel. Falls back to the
    // sponsorship's single ChildPhoto if no ProfilePhoto attached.
    const photoUrls: string[] =
      (child.ProfilePhoto?.map(p => p.url).filter(Boolean) as string[]) ||
      (sponsorship?.ChildPhoto?.map(p => p.url).filter(Boolean) as string[]) ||
      [];

    // Three recognition outcomes for a signed-in visitor on /[N]:
    //
    //   viewerIsSponsor — they own this number AND pay monthly. Show
    //     the full sponsor view (acknowledgment + portal content).
    //   viewerIsHolder  — they own this number but DON'T pay monthly.
    //     Show a welcome-back view with a soft "go monthly" upsell,
    //     NOT the same anonymous "Stay with X for $25/mo" wall the
    //     stranger gets.
    //   neither         — public visitor or signed in but doesn't own
    //     THIS number. Standard public view + claim card + monthly
    //     ask.
    //
    // Identity matching has two paths: cookie's sponsorCode (legacy
    // single-kid path) and cookie's email (multi-kid path — one email
    // can own many numbers).
    const matchedStatus = emailMatchedSponsorship?.Status as string | undefined;
    const sponsorCodeMatches = Boolean(
      viewerCode &&
        sponsorship?.SponsorCode &&
        viewerCode === sponsorship.SponsorCode
    );
    const sponsorCodeMatchActive =
      sponsorCodeMatches && sponsorship?.Status === 'Active';
    const sponsorCodeMatchHolder =
      sponsorCodeMatches && sponsorship?.Status === 'Holder';

    const viewerIsSponsor = Boolean(
      sponsorCodeMatchActive || matchedStatus === 'Active'
    );
    const viewerIsHolder =
      !viewerIsSponsor &&
      Boolean(sponsorCodeMatchHolder || matchedStatus === 'Holder');

    // If recognition came via the email path, use THAT sponsorship's
    // details for the rest of the render — sponsor code, kid display
    // name, monthly amount, sub start date, reveal timestamp.
    if (emailMatchedSponsorship && !sponsorship) {
      sponsorship = emailMatchedSponsorship;
    }

    // The legacy chooser flow (PendingCandidateChildIDs +
    // PendingChoiceAt + a 3-candidate picker) was retired in June 2026
    // when departure became auto-reveal. The admin endpoint now picks
    // ONE replacement for all sponsors of the departing kid, transfers
    // the ShirtNumber, and clears ChildRevealedAt so the RevealOverlay
    // fires on the next visit. The re-reveal reads PreviousChildIDs and
    // LastReassignedAt (already wired into needsReassignReveal below).
    // The chooser compute block and the JSX short-circuit that used it
    // are gone. See core_model.md §0b.

    // Reassignment reveal detection. When this sponsor's sponsorship
    // has LastReassignedAt set AND ChildRevealedAt is empty, the
    // sponsor hasn't yet seen the 'meet your new kid' moment for
    // this transfer. We send a flag + the previous kid's name to the
    // client so it can show the overlay with confetti.
    const needsReassignReveal =
      viewerIsSponsor &&
      !!sponsorship?.LastReassignedAt &&
      !sponsorship?.ChildRevealedAt;
    let previousKidName: string | null = null;
    if (needsReassignReveal && sponsorship?.PreviousChildIDs) {
      const previousIds = sponsorship.PreviousChildIDs
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      const mostRecentPreviousId = previousIds[previousIds.length - 1];
      if (mostRecentPreviousId) {
        try {
          const prev = await getChildByChildId(mostRecentPreviousId);
          if (prev) {
            previousKidName = prev.displayName || prev.firstName || null;
          }
        } catch {
          // Best-effort: if the lookup fails we just don't mention
          // the previous kid by name in the overlay.
        }
      }
    }

    return {
      reserved: false as const,
      record_id: recordId,
      child_id: childId || `CHILD-${shirtNumber}`,
      display_name: child.DisplayName || `${child.FirstName || 'Child'} ${child.LastInitial || ''}`.trim(),
      first_name: child.FirstName,
      age,
      grade_class: child.GradeClass,
      fun_fact: child.Notes,
      photo_url: photo,
      photo_urls: photoUrls,
      location: sponsorship?.ChildLocation || 'Gulu, Northern Uganda',
      sponsorship_status: sponsorship?.Status,
      // True when a shirt buyer has been matched to this number. Used on the
      // profile page to reframe the CTA from cold acquisition ("Sponsor
      // [name]") to warm retention ("You already gave [name] a month").
      shirt_assigned: Boolean(child.ShirtAssignedAt),
      // True when the current viewer is the verified sponsor of this child.
      // Determined by matching the sponsor_session cookie against the
      // sponsorship record's SponsorCode.
      viewer_is_sponsor: viewerIsSponsor,
      viewer_is_holder: viewerIsHolder,
      // True when the viewer has a valid sponsor_session cookie at
      // all, even if they don't own THIS specific kid. The
      // AlreadySponsoringBanner uses this to hide the "Sponsoring
      // monthly? Sign in" prompt for viewers who are signed in for
      // a different kid — they shouldn't be asked to sign in again.
      viewer_signed_in: Boolean(viewerEmail),
      sponsor_code: viewerIsSponsor ? sponsorship!.SponsorCode : undefined,
      // Surfaced for the impact stats strip in the unified sponsor view.
      // Only populated when this viewer is the verified sponsor, since
      // it's their relationship start date specifically.
      sponsorship_start_date: viewerIsSponsor
        ? (sponsorship?.SponsorshipStartDate as string | undefined)
        : undefined,
      monthly_amount:
        viewerIsSponsor && typeof sponsorship?.MonthlyAmount === 'number'
          ? (sponsorship.MonthlyAmount as number)
          : undefined,
      // Structured intake fields — any may be empty; the page renders each
      // block conditionally so a half-filled profile still looks intentional.
      home_village: child.HomeVillage,
      family_context: child.FamilyContext,
      loves: child.Loves,
      child_quote: child.ChildQuote,
      teacher_name: child.TeacherName,
      teacher_quote: child.TeacherQuote,
      name_meaning: child.NameMeaning,
      student_of_month: child.StudentOfMonth,
      student_of_month_reason: child.StudentOfMonthReason,
      departed_at: child.DepartedAt,
      departure_note: child.DepartureNote,
      needs_reassign_reveal: needsReassignReveal,
      previous_kid_name: previousKidName,
    };
  } catch (error) {
    console.error('[children/page] Error fetching child', {
      shirtNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
});

export async function generateMetadata({ params }: ChildPageProps) {
  const { number } = await params;
  const num = parseInt(number, 10);
  if (isNaN(num)) return { title: 'Child Not Found' };

  const child = await getChildByShirtNumber(num);
  if (!child) return { title: 'Child Not Found' };

  if (child.reserved) {
    return {
      title: `Shirt #${number} is reserved`,
      description: `Shirt #${number} is held for a live auction. The winner will be matched to a child in Northern Uganda.`,
    };
  }

  // Keep metadata intentionally generic: this URL is sometimes shared before a
  // shirt buyer has opened their shirt, and we don't want a link preview card
  // to spoil the reveal. The child's name and photo only appear in the page
  // body itself — by then the viewer has already chosen to meet them.
  return {
    title: 'Be A Number · Meet your child',
    description:
      'A real Child at YDO in Gulu, Uganda. Enter your Shirt Number to meet them and keep their story going for $25/month.',
    openGraph: {
      title: 'Be A Number',
      description:
        'A real Child at YDO in Gulu, Uganda. Enter your Shirt Number to meet them.',
      images: undefined,
    },
    twitter: {
      card: 'summary',
      title: 'Be A Number',
      description:
        'A real Child at YDO in Gulu, Uganda. Enter your Shirt Number to meet them.',
    },
  };
}

export default async function ChildProfilePage({ params, searchParams }: ChildPageProps) {
  const { number } = await params;
  const sp = searchParams ? await searchParams : {};
  const isGiftReveal = sp?.gift === 'true' || sp?.gift === '1';
  const gifterFromQuery = (sp?.from || '').toString().trim().slice(0, 80);
  /** True for the redirect from the magic-link callback — used to
      switch the Holder/Sponsor view copy from "Welcome back" to
      "You own #N now" on the first sign-in. The flag only lasts for
      this single render; subsequent navigations don't carry it. */
  const justSignedIn = sp?.just_signed_in === '1';
  const num = parseInt(number, 10);
  // Treat non-numeric input the same as "not found" — show the friendly page,
  // not a hard 404 that makes people think the site is broken.
  const child = !isNaN(num) ? await getChildByShirtNumber(num) : null;

  // Instead of a 404, show a warm "not found" view. Someone may have typed
  // the wrong number, or this shirt number hasn't been assigned yet.
  if (!child) {
    return (
      <div className="min-h-screen bg-[#FFF8F0]">
        <BANNavigation currentPath={'/children/' + number} />

        <main className="max-w-3xl mx-auto px-5 py-16 md:py-24">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-10"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to home
          </Link>

          <div className="text-center mb-16">
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              We don&rsquo;t have a #{number} yet
            </h1>

            <p className="text-lg text-[#666] leading-relaxed max-w-xl mx-auto mb-4">
              Double-check your Shirt tag &mdash; the Number is printed on the back.
              If you&rsquo;re sure it&rsquo;s #{number}, reach out and we&rsquo;ll sort it out.
            </p>

            <p className="text-[#999] mb-10">
              <a href="mailto:Kevin@beanumber.org" className="text-[#D4A843] hover:underline">Kevin@beanumber.org</a>
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/shirts"
                className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
              >
                Browse shirts
              </Link>
              <Link
                href="/"
                className="inline-block bg-white border border-[#e8e0d4] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#f5f0e8] transition-colors"
              >
                Back to home
              </Link>
            </div>
          </div>

          {/* How the number works — gives the page substance and context
              for people who landed here without a shirt. */}
          <div className="bg-white border border-[#e8e0d4] p-8 md:p-10 mb-12">
            <h2
              className="text-2xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              How the number works
            </h2>
            <p className="text-[#666] leading-relaxed mb-4">
              Every Be A Number shirt has a unique number pressed on the back.
              That number belongs to a real child at our campus in Omoro District, Northern Uganda.
              When you enter it here, you meet them &mdash; their name, their face, their story.
            </p>
            <p className="text-[#666] leading-relaxed">
              Your $25 gets you the shirt and starts their year at the campus &mdash; school,
              meals, medical care. Continue at $25/month to finish their year and stay connected:
              a monthly campus newsletter, photos, a handwritten letter from your matched child,
              and a year-end report card.
            </p>
          </div>

          {/* Don't have a shirt yet? — conversion path for curious visitors. */}
          <div className="text-center">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.2em] mb-3">
              Don&rsquo;t have a shirt yet?
            </p>
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Get one. Meet your child.
            </h2>
            <p className="text-[#666] leading-relaxed max-w-lg mx-auto mb-8">
              Four designs. Four colors. Heavyweight cotton, screen-printed, handmade to order.
              Every shirt starts a matched child&rsquo;s year at the campus &mdash; school, meals, medical care.
            </p>
            <Link
              href="/shirts"
              className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors"
            >
              Shop the collection
            </Link>
          </div>
        </main>

        <BANFooter />
      </div>
    );
  }

  // Reserved-for-auction numbers get a dedicated view. The Child record exists
  // in Airtable only to hold the number, so we don't expose a profile.
  if (child.reserved) {
    return (
      <div className="min-h-screen bg-[#FFF8F0]">
        <BANNavigation currentPath={'/children/' + number} />

        <main className="max-w-3xl mx-auto px-5 py-16 md:py-24">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-10"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to home
          </Link>

          <div className="text-center">
            <div className="inline-block bg-white border border-[#e8e0d4] px-6 py-3 mb-8">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
                Reserved
              </span>
            </div>

            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Shirt #{number} is reserved
            </h1>

            <p className="text-lg text-[#666] leading-relaxed max-w-xl mx-auto mb-10">
              This number is held for a future live auction. The winning bidder will
              be matched to a child in Northern Uganda, and their profile will appear
              here once the match is made.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/shirts"
                className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
              >
                Shop shirts
              </Link>
              <Link
                href="/"
                className="inline-block bg-white border border-[#e8e0d4] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#f5f0e8] transition-colors"
              >
                Meet the children
              </Link>
            </div>
          </div>
        </main>

        <BANFooter />
      </div>
    );
  }

  const displayName = child.display_name || child.first_name || 'Child';
  const firstName = child.first_name || displayName.split(' ')[0] || 'them';
  const photoUrl = child.photo_url || '/images/child-placeholder.jpg';

  // True if ANY of the structured intake fields are populated. When none
  // are, we fall back to the legacy Notes prose so older records still
  // render something human rather than an empty scaffold.
  const hasStructured = Boolean(
    child.home_village ||
    child.family_context ||
    child.loves ||
    child.child_quote ||
    child.teacher_quote
  );

  // Memo §2 one-tap + May 2026 stockpile model:
  //
  // Resolve the visitor's buyer identity from the ban_buyer_session
  // cookie. Two consumers use this:
  //
  //   1. SponsorButton — prefills checkout with the buyer's saved
  //      payment method so tapping "sponsor this kid" is one tap.
  //   2. ClaimMatchCard — renders for Shirt + Stay buyers who haven't
  //      yet claimed any child. Their first /[number] visit becomes
  //      the match event: the page detects the unbound subscription,
  //      a confirm card asks "is this your kid?", a tap creates the
  //      Sponsorship + sponsor code and reloads the page in sponsor
  //      mode.
  //
  // Under the stockpile model, Donations no longer have a Child link
  // at checkout, so we no longer require buyer→child match in code.
  // The match decision moves entirely to the buyer's explicit tap.
  let buyerContext:
    | Awaited<ReturnType<typeof resolveBuyerContext>>
    | null = null;
  let showClaimCard = false;
  if (!child.viewer_is_sponsor && child.record_id) {
    const buyerSessionId = await getBuyerSessionId();
    if (buyerSessionId) {
      buyerContext = await resolveBuyerContext(buyerSessionId);
      if (
        buyerContext?.isShirtMonthly &&
        buyerContext.donorRecordId &&
        !(await donorHasActiveSponsorship(buyerContext.donorRecordId))
      ) {
        showClaimCard = true;
      }
    }
  }
  const buyerHint = buyerContext
    ? { customerId: buyerContext.customerId, email: buyerContext.email }
    : null;

  // Treat any cookie-identified buyer as "has a shirt." Under the May
  // 2026 stockpile model we no longer write ShirtAssignedAt to the
  // Child record, so child.shirt_assigned is always false for new
  // buyers. Falling back to buyerContext keeps the warm "Will you
  // stay?" framing and the locked-merch teaser firing for buyers who
  // came in via /shirts/success but aren't yet sponsors.
  const viewerLooksLikeBuyer = child.shirt_assigned || Boolean(buyerContext);

  // Sponsor-only portal content (stats + latest child update). The
  // newsletter feed used to live here; it now sits in a public
  // CampusNewsfeed section below the bio/CTA grid, visible to anyone.
  // Report cards and letters stay sponsor-gated and continue to
  // render through SponsorPortalSections.
  let portalData: {
    stats: ReturnType<typeof computeSponsorStats>;
    latestChildUpdate: Awaited<ReturnType<typeof getLatestChildUpdate>>;
  } | null = null;
  if (child.viewer_is_sponsor && (child.record_id || child.child_id)) {
    const latestChildUpdate = await getLatestChildUpdate({
      id: child.record_id,
      childId: child.child_id,
    });
    portalData = {
      stats: computeSponsorStats(child.sponsorship_start_date, child.monthly_amount ?? 25),
      latestChildUpdate,
    };
  }

  // Public newsfeed — fetched for every non-departed kid view. The
  // newsletter Kevin writes once a month gets published to every
  // kid's page as a campus-wide feed. Sponsors see an acknowledgment
  // card above; non-sponsors see a conversion card. Departed kids
  // skip the feed entirely — the "no longer at the campus" framing
  // takes precedence over campus-level content.
  const recentNewsletters: CampusNewsletterEntry[] = child.departed_at
    ? []
    : await getRecentCampusNewsletters();

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      {/* Silently flip the sponsor's ChildRevealedAt if they're logged in
          and this number matches their assignment. Renders nothing. */}
      <RevealBeacon number={Number(number)} />

      <BANNavigation currentPath={'/children/' + number} />

      {/* Your kids strip — appears at the top of every kid page for
          signed-in users who own 2+ kids. Turns this kid page into a
          navigation surface for the rest of their family, so they
          don't have to bounce through /me to switch between kids. */}
      <YourKidsStrip excludeShirtNumber={Number(number)} />

      {/* Already-sponsoring banner — slim, dismissible, only shown to
          unsigned visitors (sponsors and holders already see their
          acknowledgment further down; this is the off-ramp for the
          existing-sponsor-on-new-device case who would otherwise
          panic at the public view). Also suppressed for viewers
          who have a session cookie for a DIFFERENT kid — they're
          already signed in, asking them to sign in again is wrong. */}
      {!child.viewer_is_sponsor &&
        !child.viewer_is_holder &&
        !child.viewer_signed_in && (
          <AlreadySponsoringBanner shirtNumber={Number(number)} />
        )}

      {/* Departure now uses auto-reveal (June 2026, core_model.md
          §0b). The old 3-card chooser short-circuit lived here; it
          was replaced by the RevealOverlay's reassignment branch
          which fires when LastReassignedAt is set and
          ChildRevealedAt is empty. Same magic, no picking. */}
      <main className="max-w-5xl mx-auto px-5 py-6 md:py-16">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to home
        </Link>

        {/* Stockpile model claim card. Renders when the visitor has a
            ban_buyer_session cookie tied to a Shirt + Stay subscription
            AND no Sponsorship is bound to that buyer yet. Tapping
            "claim {firstName}" creates the Sponsorship server-side,
            drops a sponsor_session cookie, and reloads the page in
            authenticated sponsor mode. This is THE match event under
            the new model — the buyer's first visit to /[number] for
            the kid on the back of their shirt. */}
        {showClaimCard && (
          <ClaimMatchCard
            shirtNumber={Number(number)}
            firstName={firstName}
          />
        )}

        {/* Memo §11: gift recipient frame. Renders when the URL has
            ?gift=true (sent by the gift card email). Sets the emotional
            tone before the photo + name + bio. */}
        {isGiftReveal && (
          <div className="mb-8 md:mb-10 bg-white border-2 border-[#D4A843]/40 px-6 py-5 md:px-8 md:py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
              A gift for you
            </p>
            <p
              className="text-xl md:text-2xl text-[#0d0d0d] leading-snug"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {gifterFromQuery
                ? `${gifterFromQuery} sponsored a child in your honor.`
                : 'Someone sponsored a child in your honor.'}
            </p>
            <p className="text-sm text-[#666] mt-2">
              Their first month at the campus is already covered.
              You&rsquo;ll meet them below.
            </p>
          </div>
        )}

        <ReassignReveal
          needsReveal={!!child.needs_reassign_reveal}
          shirtNumber={Number(number)}
          newChildName={displayName}
          previousChildName={child.previous_kid_name ?? null}
        >
        <RevealOverlay shirtNumber={Number(number)} childName={displayName}>
        <div className="grid md:grid-cols-2 gap-5 md:gap-14 items-start">
          {/* Photo — shorter on mobile to keep the CTA reachable without
              a marathon scroll. Desktop keeps the taller portrait crop.
              Multiple photos render as a horizontal scroll-snap
              carousel; single photo or none falls back to the static
              hero. */}
          <div className="aspect-[4/4] md:aspect-[4/5] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden relative">
            {child.photo_urls && child.photo_urls.length > 1 ? (
              <div className="w-full h-full overflow-x-auto snap-x snap-mandatory flex">
                {child.photo_urls.map((url, i) => (
                  <div
                    key={url + i}
                    className="w-full h-full flex-shrink-0 snap-center relative"
                    style={{ scrollSnapAlign: 'center' }}
                  >
                    <Image
                      src={url}
                      alt={`${displayName} — photo ${i + 1}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover object-[center_top]"
                      priority={i === 0}
                    />
                  </div>
                ))}
              </div>
            ) : photoUrl.startsWith('http') ? (
              <Image
                src={photoUrl}
                alt={displayName}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                // Bias the crop toward the top of the frame so faces
                // stay in view when the source photo has more torso
                // than headroom. Fixes Amarorwot (#53) and any other
                // kid whose photo was framed with the face high.
                className="object-cover object-[center_top]"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl mb-3 opacity-40">👤</div>
                  <p className="text-[#aaa] text-sm">Photo coming soon</p>
                </div>
              </div>
            )}
            {/* Photo count indicator — small chip in the corner when
                there's a carousel. Tells the viewer to scroll. */}
            {child.photo_urls && child.photo_urls.length > 1 && (
              <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 bg-white/95 backdrop-blur-sm text-xs text-[#666] px-2 py-1 pointer-events-none">
                <span aria-hidden>↔</span>
                {child.photo_urls.length} photos
              </div>
            )}
            {/* Shirt number badge */}
            <div className="absolute top-5 right-5 bg-white/90 backdrop-blur-sm px-4 py-2">
              <span className="text-sm font-bold text-[#D4A843]">#{number}</span>
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center py-0 md:py-4">
            {/* Departure banner — when the kid is no longer at the
                campus. Under the auto-reveal model (core_model.md §0b,
                June 2026), this state is transient: the admin marks
                the kid as departed, the system auto-picks a
                replacement and transfers the ShirtNumber, and the
                sponsor lands on the new kid via the RevealOverlay on
                next visit. A sponsor seeing THIS banner means admin
                marked the kid departed but hasn&rsquo;t run auto-reveal
                yet — copy reflects that.
                Visitors who aren&rsquo;t the sponsor see a quieter
                acknowledgment. No &ldquo;pick a kid&rdquo; CTA: humans don&rsquo;t
                pick, the Number picks. */}
            {child.departed_at && (
              <div className="mb-4 p-5 border border-[#D4A843] bg-[#fffaf0]">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
                  No longer at the campus
                </p>
                <p
                  className="text-xl md:text-2xl text-[#0d0d0d] leading-snug mb-2"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  {firstName} has moved on.
                </p>
                {(child.viewer_is_sponsor || child.viewer_is_holder) ? (
                  <p className="text-sm text-[#666] leading-relaxed mb-3">
                    Your Number &mdash; #{number} &mdash; is being
                    reassigned to a new kid at the campus. We&rsquo;ll
                    email you when they&rsquo;re ready to meet.
                  </p>
                ) : (
                  <p className="text-sm text-[#666] leading-relaxed mb-3">
                    {firstName}&rsquo;s record stays here because their
                    story matters. Their Number now belongs to another
                    kid at the campus.
                  </p>
                )}
                {child.departure_note && (
                  <p
                    className="mt-4 pt-3 border-t border-[#e8e0d4] text-xs text-[#888] leading-relaxed italic whitespace-pre-wrap"
                    style={{ fontFamily: 'var(--font-lora), serif' }}
                  >
                    A note about {firstName}: {child.departure_note}
                  </p>
                )}
              </div>
            )}
            {/* Student of the month badge — set when Simon nominates
                + Kevin approves via /admin/sotm. Sits above the name
                so it's the first thing a sponsor sees. Empty
                StudentOfMonth = no badge. The reason text renders
                below as an italic citation. */}
            {!child.departed_at && child.student_of_month && (
              <div className="mb-3">
                <p className="inline-flex self-start items-center gap-1.5 bg-[#D4A843] text-[#0d0d0d] text-xs font-bold uppercase tracking-wider px-3 py-1.5">
                  <span aria-hidden>★</span>
                  Student of the Month · {child.student_of_month}
                </p>
                {child.student_of_month_reason && (
                  <p
                    className="mt-2 text-sm text-[#666] italic leading-snug max-w-md"
                    style={{ fontFamily: 'var(--font-lora), serif' }}
                  >
                    &ldquo;{child.student_of_month_reason}&rdquo;
                  </p>
                )}
              </div>
            )}
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {displayName}
            </h1>

            {/* Cultural meaning of the kid's Acholi/Luo name. Small italic
                line directly under their name — gives sponsors something to
                remember and share. */}
            {child.name_meaning && (
              <p
                className="text-base md:text-lg text-[#888] italic mb-4 leading-snug"
                style={{ fontFamily: 'var(--font-lora), serif' }}
              >
                {child.name_meaning}
              </p>
            )}

          </div>
        </div>

        {/* ── Below the photo+intro grid: bio on the left, CTA on the right.
            Same 2-column rhythm as the intro grid above it. Deep read
            and conversion ask sit side-by-side on desktop; stacks on
            mobile.

            ClaimGate wraps this whole section. For buyers who haven't
            claimed yet, after the reveal animation completes, the
            gate blurs everything inside and overlays a "Claim it"
            panel. For everyone else (recognized sponsors/holders,
            cold visitors, claimed-or-dismissed buyers) the gate
            short-circuits to passthrough — children render with no
            wrapping element at all. */}
        <ClaimGate
          shirtNumber={Number(number)}
          firstName={firstName}
          viewerLooksLikeBuyer={viewerLooksLikeBuyer}
          viewerIsRecognized={Boolean(
            child.viewer_is_sponsor || child.viewer_is_holder
          )}
        >
        {/* ── Personal details block. Lives inside ClaimGate so a
            buyer who hasn't claimed sees only the photo + name above
            the gate; everything personal about the kid (age, grade,
            their own quote, family context, what they love) stays
            blurred until they claim or hit Maybe later. The blur is
            the conversion lever — the gate says "you bought this
            kid, claim them to read who they are." */}
        <div className="mt-8 md:mt-10 max-w-2xl">
          <div className="flex items-center gap-3 text-[#777] mb-6">
            {child.age && <span className="text-lg">Age {child.age}</span>}
            {child.age && child.grade_class && <span className="text-[#ccc]">&middot;</span>}
            {child.grade_class && <span className="text-lg">{child.grade_class}</span>}
          </div>

          {/* Pull quote from the child — in their own voice. The
              single strongest element on the page when it's present. */}
          {child.child_quote && (
            <div className="mb-8">
              <p
                className="text-2xl md:text-[1.65rem] text-[#0d0d0d] leading-snug"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 500, fontStyle: 'italic' }}
              >
                &ldquo;{child.child_quote}&rdquo;
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#aaa]">
                — {firstName}
              </p>
            </div>
          )}

          {/* Structured fact lines. Each is its own tiny block so an
              empty field just disappears instead of leaving dead scaffold. */}
          {hasStructured && (
            <div className="mb-8 space-y-4">
              {child.home_village && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                    Home
                  </p>
                  <p className="text-[17px] md:text-lg text-[#444] leading-relaxed">{child.home_village}</p>
                </div>
              )}
              {child.family_context && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                    Family
                  </p>
                  <p className="text-[17px] md:text-lg text-[#444] leading-relaxed">{child.family_context}</p>
                </div>
              )}
              {child.loves && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                    About {firstName}
                  </p>
                  <p className="text-[17px] md:text-lg text-[#444] leading-relaxed">{child.loves}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-5 md:gap-14 mt-10 md:mt-12 items-start">
          {/* LEFT — bio + teacher + story placeholder */}
          <div>
            {/* Longer-form bio paragraph from the Notes field. */}
            {child.fun_fact && (
              <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                  More about {firstName}
                </p>
                <div className="text-[17px] md:text-lg text-[#444] leading-relaxed [&_p+p]:mt-4 whitespace-pre-line">
                  {child.fun_fact}
                </div>
              </div>
            )}

            {/* Teacher quote — attributed, second human voice. */}
            {child.teacher_quote && (
              <div className="border-l-2 border-[#D4A843] pl-5 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                  From {firstName}&rsquo;s teacher
                </p>
                <p className="text-[17px] md:text-lg text-[#444] leading-relaxed italic">
                  &ldquo;{child.teacher_quote}&rdquo;
                </p>
                {child.teacher_name && (
                  <p className="mt-3 text-sm text-[#888]">— {child.teacher_name}</p>
                )}
              </div>
            )}

            {/* "Story coming" placeholder — only when this kid has
                neither structured intake fields nor a Notes bio. */}
            {!hasStructured && !child.fun_fact && (
              <div className="bg-white border border-[#e8e0d4] p-5 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                  {firstName}&rsquo;s story
                </p>
                <p className="text-[#666] leading-relaxed">
                  We&rsquo;re gathering {firstName}&rsquo;s full profile
                  from the campus in Omoro District right now — home,
                  family, what they love, and a note from their teacher.
                  Sponsor them today and we&rsquo;ll send it to you as
                  soon as it&rsquo;s in our hands.
                </p>
              </div>
            )}
          </div>

          {/* RIGHT — CTA card. State-aware per viewer identity. The
              departed-kid branch (auto-reveal model, §0b): a
              sponsor/holder sees a quiet &ldquo;your new kid is on the
              way&rdquo; card that points them at /me for their other
              relationships; a cold visitor sees the brand mechanic
              (Shirt → Number → Kid) as the path to meeting a kid
              of their own. No &ldquo;Hope Bridge&rdquo; (off-brand) and no
              link to / for browsing — humans don&rsquo;t pick the kid,
              the Number does. */}
          <div>
            {child.departed_at ? (
              (child.viewer_is_sponsor || child.viewer_is_holder) ? (
                <div className="bg-white border-2 border-[#D4A843]/30 p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
                    Number being reassigned
                  </p>
                  <p
                    className="text-xl md:text-2xl text-[#0d0d0d] mb-3 leading-tight"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Your new kid is on the way.
                  </p>
                  <p className="text-[#555] leading-relaxed mb-5">
                    {firstName} has moved on, and #{number} is being
                    matched with a new kid at the campus. We&rsquo;ll
                    email you the moment they&rsquo;re ready to meet.
                  </p>
                  <p className="text-xs text-[#888] leading-relaxed">
                    See your other kids and updates from{' '}
                    <Link href="/me" className="text-[#D4A843] hover:underline font-bold">
                      Your kids
                    </Link>{' '}
                    in the nav.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-[#e8e0d4] p-7 text-center">
                  <p
                    className="text-xl text-[#0d0d0d] mb-3"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    {firstName} is no longer at the campus.
                  </p>
                  <p className="text-[#555] leading-relaxed mb-5">
                    Their record stays here because their story
                    matters. Want a kid of your own? Every Be A Number
                    Shirt comes with a Number on the back, and that
                    Number is a real kid at the campus.
                  </p>
                  <Link
                    href="/shirts"
                    className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors"
                  >
                    Get a Shirt
                  </Link>
                </div>
              )
            ) : child.viewer_is_sponsor ? (
              /* Active monthly sponsor: acknowledgment, no $25/mo ask
                 because they're already paying it. */
              <div className="bg-white border-2 border-[#D4A843]/30 p-7">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
                  {justSignedIn ? 'Welcome' : 'Signed in'}
                </p>
                <p
                  className="text-2xl md:text-[28px] text-[#0d0d0d] mb-3 leading-tight"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  You&rsquo;re {firstName}&rsquo;s sponsor.
                </p>
                <p className="text-[#555] leading-relaxed mb-5">
                  Through your $25/month, {firstName} has school fees, books,
                  a uniform, morning porridge and a hot meal every day, access to
                  the on-site medical center, and a classroom where teachers know{' '}
                  {firstName}&rsquo;s name.
                </p>
                <p className="text-xs text-[#888] leading-relaxed">
                  Need to manage your subscription, see updates, or
                  download a giving statement? Tap{' '}
                  <Link href="/me" className="text-[#D4A843] hover:underline font-bold">
                    Your kids
                  </Link>{' '}
                  in the nav.
                </p>
                <p className="text-center text-xs text-[#bbb] mt-5">
                  On behalf of our entire team &mdash; thank you.
                </p>
              </div>
            ) : child.viewer_is_holder ? (
              /* Holder: they own this number but aren't paying monthly.
                 Acknowledge them by name, no aggressive ask, soft
                 upsell to monthly. Copy switches between first-time
                 ("you own #N now") and returning ("welcome back"). */
              <div className="bg-white border-2 border-[#D4A843]/30 p-7">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
                  {justSignedIn ? 'You own this number' : 'Signed in'}
                </p>
                <p
                  className="text-2xl md:text-[28px] text-[#0d0d0d] mb-3 leading-tight"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  {justSignedIn
                    ? `#${number} is yours. ${firstName} too.`
                    : `Welcome back. ${firstName} is yours.`}
                </p>
                <p className="text-[#555] leading-relaxed mb-5">
                  You own this number. Every update from the campus,
                  every change in {firstName}&rsquo;s story, comes back
                  to this page for you.
                </p>
                <p className="text-[#555] leading-relaxed mb-5">
                  Whenever you&rsquo;re ready, $25/month keeps the
                  campus running for {firstName} &mdash; school, meals,
                  the clinic, teachers&rsquo; salaries. No pressure to
                  decide today.
                </p>
                <SponsorButton
                  childRecordId={child.record_id}
                  childId={child.child_id}
                  childDisplayName={displayName}
                  firstName={firstName}
                  shirtAssigned={viewerLooksLikeBuyer}
                  existingCustomerId={buyerHint?.customerId || undefined}
                  buyerEmail={buyerHint?.email || undefined}
                />
              </div>
            ) : (
              /* Not authenticated for this kid.
                 Conversion ladder: meet → know → CLAIM → stay.
                 Buyers see a ClaimGate over the bio + this card
                 (see ClaimGate wrapper around the parent grid). The
                 ask below is the "stay with X" rung — buyers reach
                 it after claiming or dismissing the gate; cold
                 visitors reach it directly. The inline
                 ClaimThisNumberCard used to sit above this card; the
                 gate replaces it. */
              <>
                <div className="bg-[#FFF8F0] border-2 border-[#D4A843] p-7 shadow-sm">
                {viewerLooksLikeBuyer ? (
                  <p
                    className="text-2xl text-[#0d0d0d] mb-4"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Will you stay with {firstName}?
                  </p>
                ) : (
                  <p
                    className="text-2xl text-[#0d0d0d] mb-4"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Stay with {firstName}.
                  </p>
                )}

                <p className="text-[#555] leading-relaxed mb-5">
                  Your $25/month supports the campus where {firstName} goes to school,
                  eats morning porridge and a hot meal every day, gets care at the
                  on-site medical center, and learns from teachers who know{' '}
                  {firstName}&rsquo;s name.
                </p>

                <div className="flex items-baseline gap-1 mb-4">
                  <span
                    className="text-4xl text-[#D4A843]"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
                  >
                    $25
                  </span>
                  <span className="text-[#aaa]">/month &middot; cancel anytime</span>
                </div>

                <SponsorButton
                  childRecordId={child.record_id}
                  childId={child.child_id}
                  childDisplayName={displayName}
                  firstName={firstName}
                  shirtAssigned={viewerLooksLikeBuyer}
                  existingCustomerId={buyerHint?.customerId || undefined}
                  buyerEmail={buyerHint?.email || undefined}
                />

                <p className="text-center text-xs text-[#bbb] mt-3 mb-5">
                  Continuing is your choice. No pressure if not now.
                </p>

                {/* Tiny contextual nudge for existing sponsors on a
                    new device. Quiet, not pushy — points them to the
                    Sign in button in the top nav. */}
                <p className="text-center text-xs text-[#666] border-t border-[#e8e0d4] pt-4">
                  Sponsoring monthly? Your sponsorship is intact —
                  tap <span className="font-bold">Sign in</span> at the top
                  of the page to see your view.
                </p>
              </div>
              </>
            )}
          </div>
        </div>
        </ClaimGate>

        {/* ── Sponsor-only portal content (stats + latest update). The
            campus newsletter no longer renders here — it lives in
            the public CampusNewsfeed below. */}
        {child.viewer_is_sponsor && portalData && (
          <SponsorPortalSections
            firstName={firstName}
            stats={portalData.stats}
            latestChildUpdate={portalData.latestChildUpdate}
          />
        )}

        {/* ── Public campus newsfeed ───────────────────────────────
            Visible to anyone — sponsor or not. The ask block above
            (right-column CTA: 'Stay with X' for non-sponsors,
            'You're the sponsor' for sponsors) is the only ask the
            page makes; the newsfeed stands on its own without a
            second redundant card above it. Departed kids skip the
            feed — their page is a memorial. */}
        {!child.departed_at && recentNewsletters.length > 0 && (
          <div className="mt-12 md:mt-16">
            <CampusNewsfeed
              firstName={firstName}
              newsletters={recentNewsletters}
            />
          </div>
        )}

        {/* ── Other kids at the campus ──
            Pool model rendered as a feature. Below the newsfeed for
            every kid page. Surfaces well-profiled, well-loved kids
            so the visitor sees the campus as populated, not a single
            file. Departed kids skip this too — their page is about
            them, not a directory. */}
        {!child.departed_at && (
          <OtherKidsAtCampus
            currentRecordId={child.record_id}
            currentShirtNumber={Number(number)}
            currentFirstName={firstName}
          />
        )}

        {/* ── Kids you've met ──
            Client-side localStorage history. Renders nothing until
            the visitor has met at least 2 kids. Excludes the current
            one. Builds a sense of accumulating relationships across
            the campus. */}
        <RecentKidsStrip excludeShirtNumber={Number(number)} />

        {/* Track this visit in the client's local history. Renders
            nothing — pure mount side-effect. */}
        <RecentKidsTracker
          shirtNumber={Number(number)}
          displayName={displayName}
          firstName={firstName}
          photoUrl={child.photo_url}
        />

        </RevealOverlay>
        </ReassignReveal>
      </main>

      <BANFooter />
    </div>
  );
}
