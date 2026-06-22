/**
 * Admin OS — read queries (Postgres edition).
 *
 * Server-side data fetchers backing the `/admin` home dashboard cards,
 * the roster manager, the review queue, the SOTM picker, and the
 * per-kid editor. Reads go through Drizzle against the same Postgres
 * the rest of the app uses — no Airtable dependency.
 *
 * Each home-card function returns a small presentation-ready shape
 * with errors caught and surfaced as a graceful `ok:false` state so a
 * single failing card doesn't blow up the whole dashboard.
 *
 * Function signatures and return types are preserved verbatim from
 * the Airtable-era module so callers (pages, components) don't need
 * to change.
 */

import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  children,
  childUpdates,
  donations,
  fulfillments,
  newsletters,
  sponsorships,
} from '@/lib/db/schema';
import { parsePendingDraft } from './pending-draft';

// ────────────────────────────────────────────────────────────────────────
// Card: Updates pending publish
// ────────────────────────────────────────────────────────────────────────

export interface PendingUpdatesCard {
  ok: boolean;
  count: number;
  recent: Array<{
    id: string;
    title: string;
    childDisplayName: string;
    shirtNumber: number | null;
    submittedAt: string | null;
  }>;
  error?: string;
}

export async function getPendingUpdatesCard(): Promise<PendingUpdatesCard> {
  try {
    // Pending = submitted-by-Simon, not yet published. Mirrors the
    // Airtable `{Status}="Pending"` filter while adding a LEFT JOIN to
    // children for shirt-number + display-name hydration (the
    // Airtable version stubbed shirtNumber=null because the dual-key
    // join was too expensive there; we can do it cheap here).
    const rows = await db
      .select({
        id: childUpdates.id,
        updateId: childUpdates.updateId,
        title: childUpdates.title,
        submittedAt: childUpdates.submittedAt,
        childIdLegacy: childUpdates.childIdLegacy,
        childShirtNumber: sql<number | null>`coalesce(${children.shirtNumber}, child_legacy.shirt_number)`,
        childDisplayName: sql<string | null>`coalesce(${children.displayName}, child_legacy.display_name)`,
      })
      .from(childUpdates)
      .leftJoin(children, eq(children.id, childUpdates.childId))
      .leftJoin(
        sql`children as child_legacy`,
        sql`child_legacy.child_id = ${childUpdates.childIdLegacy}`
      )
      .where(eq(childUpdates.status, 'Pending'))
      .orderBy(desc(childUpdates.submittedAt))
      .limit(10);

    const recent = rows.map(r => ({
      id: r.id,
      title: r.title || r.updateId || 'Untitled update',
      childDisplayName: r.childDisplayName || r.childIdLegacy || 'Unknown child',
      shirtNumber: r.childShirtNumber,
      submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : null,
    }));
    return { ok: true, count: recent.length, recent };
  } catch (err) {
    return {
      ok: false,
      count: 0,
      recent: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Card: Shirts to ship
// ────────────────────────────────────────────────────────────────────────

export interface ShirtsToShipCard {
  ok: boolean;
  count: number;
  error?: string;
}

export async function getShirtsToShipCard(): Promise<ShirtsToShipCard> {
  try {
    // Anything with no tracking number AND not yet shipped is fair
    // game for the queue — same inclusive rule as the Airtable
    // formula `AND({Tracking}="", {Shipping}!="Shipped")`.
    const rows = await db
      .select({ id: fulfillments.id })
      .from(fulfillments)
      .where(
        and(
          or(isNull(fulfillments.tracking), eq(fulfillments.tracking, '')),
          or(
            isNull(fulfillments.shipping),
            sql`${fulfillments.shipping} <> 'Shipped'`
          )
        )
      )
      .limit(500);
    return { ok: true, count: rows.length };
  } catch (err) {
    return {
      ok: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Card: Newsletter due
// ────────────────────────────────────────────────────────────────────────

export interface NewsletterDueCard {
  ok: boolean;
  daysSinceLast: number | null;
  lastSentAt: string | null;
  lastSubject: string | null;
  due: boolean;
  error?: string;
}

export async function getNewsletterDueCard(): Promise<NewsletterDueCard> {
  try {
    const rows = await db
      .select({
        publishedAt: newsletters.publishedAt,
        subject: newsletters.subject,
        title: newsletters.title,
      })
      .from(newsletters)
      .where(eq(newsletters.status, 'Sent'))
      .orderBy(desc(newsletters.publishedAt))
      .limit(1);
    const latest = rows[0];
    if (!latest) {
      return {
        ok: true,
        daysSinceLast: null,
        lastSentAt: null,
        lastSubject: null,
        due: true,
      };
    }
    const publishedAt = latest.publishedAt
      ? new Date(latest.publishedAt).toISOString()
      : null;
    let daysSinceLast: number | null = null;
    if (publishedAt) {
      const ms = Date.now() - new Date(publishedAt).getTime();
      daysSinceLast = Math.floor(ms / (1000 * 60 * 60 * 24));
    }
    return {
      ok: true,
      daysSinceLast,
      lastSentAt: publishedAt,
      lastSubject: latest.subject || latest.title || null,
      due: daysSinceLast === null || daysSinceLast >= 28,
    };
  } catch (err) {
    return {
      ok: false,
      daysSinceLast: null,
      lastSentAt: null,
      lastSubject: null,
      due: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Card: Sponsor activity this week
// ────────────────────────────────────────────────────────────────────────

export interface SponsorActivityCard {
  ok: boolean;
  newThisWeek: number;
  newRecent: Array<{
    id: string;
    sponsorName: string;
    childDisplayName: string;
    sponsorshipStartDate: string | null;
  }>;
  error?: string;
}

export async function getSponsorActivityCard(): Promise<SponsorActivityCard> {
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const rows = await db
      .select({
        id: sponsorships.id,
        sponsorName: sponsorships.sponsorName,
        sponsorEmail: sponsorships.sponsorEmail,
        childDisplayName: sponsorships.childDisplayName,
        sponsorshipStartDate: sponsorships.sponsorshipStartDate,
      })
      .from(sponsorships)
      .where(
        and(
          eq(sponsorships.status, 'Active'),
          isNotNull(sponsorships.sponsorshipStartDate),
          sql`${sponsorships.sponsorshipStartDate} > ${cutoffDate}`
        )
      )
      .orderBy(desc(sponsorships.sponsorshipStartDate))
      .limit(20);

    const newRecent = rows.map(r => ({
      id: r.id,
      sponsorName: r.sponsorName || r.sponsorEmail || 'Unknown sponsor',
      childDisplayName: r.childDisplayName || 'Unknown child',
      sponsorshipStartDate: r.sponsorshipStartDate ?? null,
    }));
    return { ok: true, newThisWeek: newRecent.length, newRecent };
  } catch (err) {
    return {
      ok: false,
      newThisWeek: 0,
      newRecent: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Card: Roster gaps
// ────────────────────────────────────────────────────────────────────────

export interface RosterGapsCard {
  ok: boolean;
  totalKids: number;
  missingPhoto: number;
  missingNameMeaning: number;
  missingFamilyContext: number;
  missingLoves: number;
  missingNotes: number;
  fullyComplete: number;
  error?: string;
}

export async function getRosterGapsCard(): Promise<RosterGapsCard> {
  try {
    // Canonical-kid-only: positive shirt_number AND a real name. In
    // the Airtable world we had to dedupe by-name ghost duplicates
    // from the legacy webhook seeding; the Postgres `children` rows
    // are canonical from the migrator so no dedup needed.
    const rows = await db
      .select({
        shirtNumber: children.shirtNumber,
        displayName: children.displayName,
        firstName: children.firstName,
        profilePhotoUrl: children.profilePhotoUrl,
        nameMeaning: children.nameMeaning,
        familyContext: children.familyContext,
        loves: children.loves,
        notes: children.notes,
      })
      .from(children)
      .where(isNotNull(children.shirtNumber));

    let totalKids = 0;
    let missingPhoto = 0;
    let missingNameMeaning = 0;
    let missingFamilyContext = 0;
    let missingLoves = 0;
    let missingNotes = 0;
    let fullyComplete = 0;
    for (const r of rows) {
      const displayName = (r.displayName || r.firstName || '').trim();
      if (!displayName) continue;
      const n = r.shirtNumber;
      if (typeof n !== 'number' || n < 1) continue;
      totalKids++;
      const hasPhoto = !!r.profilePhotoUrl;
      const hasNameMeaning = !!r.nameMeaning;
      const hasFamily = !!r.familyContext;
      const hasLoves = !!r.loves;
      const hasNotes = !!r.notes;
      if (!hasPhoto) missingPhoto++;
      if (!hasNameMeaning) missingNameMeaning++;
      if (!hasFamily) missingFamilyContext++;
      if (!hasLoves) missingLoves++;
      if (!hasNotes) missingNotes++;
      if (hasPhoto && hasNameMeaning && hasFamily && hasLoves && hasNotes) {
        fullyComplete++;
      }
    }
    return {
      ok: true,
      totalKids,
      missingPhoto,
      missingNameMeaning,
      missingFamilyContext,
      missingLoves,
      missingNotes,
      fullyComplete,
    };
  } catch (err) {
    return {
      ok: false,
      totalKids: 0,
      missingPhoto: 0,
      missingNameMeaning: 0,
      missingFamilyContext: 0,
      missingLoves: 0,
      missingNotes: 0,
      fullyComplete: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Card: This month numbers
// ────────────────────────────────────────────────────────────────────────

export interface ThisMonthCard {
  ok: boolean;
  newSponsorshipsThisMonth: number;
  donationsThisMonthCents: number;
  activeSponsorships: number;
  monthlyRecurringCents: number;
  error?: string;
}

export async function getThisMonthCard(): Promise<ThisMonthCard> {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const [newSubs, donationsRows, activeSubs] = await Promise.all([
      db
        .select({ id: sponsorships.id })
        .from(sponsorships)
        .where(
          and(
            eq(sponsorships.status, 'Active'),
            isNotNull(sponsorships.sponsorshipStartDate),
            sql`${sponsorships.sponsorshipStartDate} > ${monthStart}`
          )
        ),
      db
        .select({
          donationAmount: donations.donationAmount,
        })
        .from(donations)
        .where(
          and(
            eq(donations.paymentStatus, 'Succeeded'),
            isNotNull(donations.donationDate),
            sql`${donations.donationDate} > ${monthStart}`
          )
        ),
      db
        .select({
          monthlyAmount: sponsorships.monthlyAmount,
        })
        .from(sponsorships)
        .where(eq(sponsorships.status, 'Active')),
    ]);

    const donationsThisMonthCents = donationsRows.reduce((sum, rec) => {
      const amount = Number(rec.donationAmount ?? 0);
      return sum + Math.round(amount * 100);
    }, 0);

    const monthlyRecurringCents = activeSubs.reduce((sum, rec) => {
      const amount = Number(rec.monthlyAmount ?? 25);
      return sum + Math.round(amount * 100);
    }, 0);

    return {
      ok: true,
      newSponsorshipsThisMonth: newSubs.length,
      donationsThisMonthCents,
      activeSponsorships: activeSubs.length,
      monthlyRecurringCents,
    };
  } catch (err) {
    return {
      ok: false,
      newSponsorshipsThisMonth: 0,
      donationsThisMonthCents: 0,
      activeSponsorships: 0,
      monthlyRecurringCents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Roster — full canonical kid list with completeness signals
// ────────────────────────────────────────────────────────────────────────

export interface RosterKid {
  recordId: string;
  childId: string;
  shirtNumber: number;
  displayName: string;
  firstName: string;
  gradeClass: string | null;
  photoUrl: string | null;
  // Completeness — true means the field has content.
  has: {
    photo: boolean;
    nameMeaning: boolean;
    familyContext: boolean;
    loves: boolean;
    childQuote: boolean;
    notes: boolean;
  };
  // True when Simon (or another YDO team member) has saved raw intake
  // notes on this kid that Kevin hasn't yet polished into the public
  // fields. Drives the red-dot indicator on the admin roster grid.
  hasPendingIntake: boolean;
  // ISO timestamp set by the save endpoint whenever Simon (role=simon)
  // edits any field on this kid. Cleared by Kevin's "Mark as reviewed"
  // banner click. Null means nothing pending. Drives the red-dot
  // alongside hasPendingIntake.
  lastEditedBySimon: string | null;
  // Subset of the structured field names that have unreviewed Simon
  // edits. Allowed entries: "NameMeaning" | "FamilyContext" | "Loves"
  // | "ChildQuote" | "Notes". Empty when nothing's pending. Used for
  // per-field red dots on the roster card and red borders in the
  // editor.
  pendingFields: string[];
  // Simon's pending structured-field edits, parsed from the
  // PendingDraft JSON field. Each entry is what Simon proposed; the
  // live public value still lives on the kid's regular field until
  // Kevin approves. Empty object when nothing's pending. Drives the
  // /admin/review queue cards and the per-field approval UI.
  pendingDraft: {
    nameMeaning?: string;
    familyContext?: string;
    loves?: string;
    childQuote?: string;
    notes?: string;
  };
  // Public field values, kept alongside pendingDraft so /admin/review
  // can render the diff (current → proposed) without re-fetching.
  publicValues: {
    nameMeaning: string;
    familyContext: string;
    loves: string;
    childQuote: string;
    notes: string;
  };
  // True when ReportCards attachment field has at least one file.
  // Used by the deadlines banner on /admin/roster to count kids
  // missing this quarter's report card.
  hasReportCards: boolean;
  // True when Letters attachment field has at least one file.
  hasLetters: boolean;
  // Current published Student of the Month award (e.g. "May 2026").
  // Empty = no current award. Drives the gold ★ on the roster card
  // and the badge on the public profile.
  studentOfMonth: string;
  studentOfMonthReason: string;
  // Simon's pending SOTM nomination, waiting for Kevin's approval.
  // Same format as studentOfMonth. Empty = no pending nomination.
  // Drives the red ★ on the roster card (admin view only).
  pendingSOTMMonth: string;
  pendingSOTMReason: string;
  // ISO timestamp set when someone requests this kid be deleted.
  // Null/empty = no pending request. Admin reviews via the editor
  // banner and either approves (hard delete) or rejects (clears).
  deletionRequestedAt: string | null;
  // ISO timestamp set when Kevin approves the kid has left the
  // campus. Null = active. When set, roster card is greyed out and
  // public profile reframes.
  departedAt: string | null;
  // Kevin's public-facing explanation of the departure.
  departureNote: string;
  // Simon's pending departure nomination. Null = none pending.
  departureRequestedAt: string | null;
  departureRequestedNote: string;
  // Last time any structured field was touched. Best-effort via the
  // row's updated_at column.
  lastModified: string;
}

/** Coerce the children.pending_fields JSON column into a flat
 *  string array. Accepts either a JSON-array column value or a
 *  string (legacy multipleSelect-style with comma separation). */
function asStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map(v => (typeof v === 'string' ? v : (v as { name?: string })?.name || ''))
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

function asIsoOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

/** Map a Drizzle children row → RosterKid. Pulled out so getRoster()
 *  and getRosterKidByNumber() share one shape. */
function rowToRosterKid(row: typeof children.$inferSelect): RosterKid {
  const displayName = (row.displayName || row.firstName || '').trim();
  const hasPhoto = !!row.profilePhotoUrl;
  const studentOfMonthMonth = (row.studentOfMonthMonth || '').trim();
  return {
    recordId: row.id,
    childId: row.childId || '',
    shirtNumber: row.shirtNumber ?? 0,
    displayName,
    firstName: row.firstName || '',
    gradeClass: row.gradeClass || null,
    photoUrl: row.profilePhotoUrl || null,
    has: {
      photo: hasPhoto,
      nameMeaning: !!row.nameMeaning,
      familyContext: !!row.familyContext,
      loves: !!row.loves,
      childQuote: !!row.childQuote,
      notes: !!row.notes,
    },
    hasPendingIntake: !!row.intakeFromCampus,
    lastEditedBySimon: asIsoOrNull(row.lastEditedBySimon),
    pendingFields: asStringArray(row.pendingFields),
    pendingDraft: parsePendingDraft(
      typeof row.pendingDraft === 'string'
        ? row.pendingDraft
        : row.pendingDraft
          ? JSON.stringify(row.pendingDraft)
          : ''
    ),
    publicValues: {
      nameMeaning: row.nameMeaning || '',
      familyContext: row.familyContext || '',
      loves: row.loves || '',
      childQuote: row.childQuote || '',
      notes: row.notes || '',
    },
    hasReportCards:
      Array.isArray(row.reportCardUrls) && (row.reportCardUrls as unknown[]).length > 0,
    hasLetters:
      Array.isArray(row.letterUrls) && (row.letterUrls as unknown[]).length > 0,
    // Prefer the dedicated month-label column; fall back to the legacy
    // boolean (loaded from Airtable's checkbox) rendered as a generic
    // "Current" label so the gold star still shows for migrated rows.
    studentOfMonth: studentOfMonthMonth || (row.studentOfMonth ? 'Current' : ''),
    studentOfMonthReason: row.studentOfMonthReason || '',
    pendingSOTMMonth: row.pendingSOTMMonth || '',
    pendingSOTMReason: row.pendingSOTMReason || '',
    deletionRequestedAt: asIsoOrNull(row.deletionRequestedAt),
    departedAt: asIsoOrNull(row.departedAt),
    departureNote: row.departureNote || '',
    departureRequestedAt: asIsoOrNull(row.departureRequestedAt),
    departureRequestedNote: row.departureRequestedNote || '',
    lastModified: row.updatedAt
      ? new Date(row.updatedAt).toISOString()
      : new Date(row.createdAt).toISOString(),
  };
}

/**
 * Cap on canonical shirt numbers. Anything past this is a cycle
 * record (Trap 3.5 / core_model.md §2) — a shirt-number representation
 * of a canonical kid, NOT a separate person. Cycle rows pollute the
 * admin roster with duplicate, sparse profiles ("Aaron #12" vs
 * "Aaron #116" — same kid, same data, but the cycle copy looks
 * incomplete in the UI).
 *
 * Adjust upward only when YDO actually adds new on-campus kids past
 * shirt #53. Until then this gate keeps the admin roster honest:
 * one profile per real kid.
 */
const CANONICAL_ROSTER_MAX = 53;

export async function getRoster(): Promise<RosterKid[]> {
  // Pull every canonical kid with a positive shirt number and a name.
  // Postgres rows are already canonical (the migrator deduplicated
  // ghost copies) so no by-name dedup needed. The shirt_number ≤ 53
  // gate hides cycle records — they&rsquo;re display-only artifacts of
  // the Batches cycle math, not separate people to manage.
  const rows = await db
    .select()
    .from(children)
    .where(isNotNull(children.shirtNumber));

  const kids: RosterKid[] = [];
  for (const row of rows) {
    const displayName = (row.displayName || row.firstName || '').trim();
    const n = row.shirtNumber;
    if (!displayName) continue;
    if (typeof n !== 'number' || n < 1) continue;
    if (n > CANONICAL_ROSTER_MAX) continue; // skip cycle records
    kids.push(rowToRosterKid(row));
  }
  // Alphabetical by display name — reads like a class roster.
  kids.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return kids;
}

export interface RosterKidAttachment {
  id: string;
  url: string;
  filename: string;
  size?: number;
  type?: string;
  thumbnailUrl?: string | null;
}

// Single-kid fetch for the editor page — pulls the full field set.
export interface RosterKidDetail extends RosterKid {
  nameMeaning: string;
  familyContext: string;
  loves: string;
  childQuote: string;
  notes: string;
  age: string | null;
  homeVillage: string;
  teacherName: string;
  teacherQuote: string;
  reportCards: RosterKidAttachment[];
  letters: RosterKidAttachment[];
  /** Every ProfilePhoto attached to this kid. Used by the editor to
   *  list them with delete controls, and by the public profile
   *  carousel. */
  photos: RosterKidAttachment[];
  /** Raw intake notes from Simon / YDO team. Kevin polishes these
   *  into the public fields, then clears the field. */
  intakeFromCampus: string;
}

/** Coerce a jsonb attachment array into the RosterKidAttachment
 *  shape. Tolerates plain URL strings (older rows) and object-shape
 *  entries (current). */
function mapAttachmentArray(
  raw: unknown,
  fieldKey: string
): RosterKidAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: RosterKidAttachment[] = [];
  for (let idx = 0; idx < raw.length; idx++) {
    const entry: unknown = raw[idx];
    if (typeof entry === 'string') {
      const url = entry;
      const filename = url.split('/').pop() || `${fieldKey}-${idx + 1}`;
      out.push({
        id: `${fieldKey}-${idx}`,
        url,
        filename,
        thumbnailUrl: null,
      });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const e = entry as {
        id?: string;
        url?: string;
        filename?: string;
        size?: number;
        type?: string;
        thumbnailUrl?: string | null;
      };
      if (!e.url) continue;
      out.push({
        id: e.id || `${fieldKey}-${idx}`,
        url: e.url,
        filename: e.filename || e.url.split('/').pop() || `${fieldKey}-${idx + 1}`,
        size: e.size,
        type: e.type,
        thumbnailUrl: e.thumbnailUrl ?? null,
      });
    }
  }
  return out;
}

export async function getRosterKidByNumber(
  shirtNumber: number
): Promise<RosterKidDetail | null> {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.shirtNumber, shirtNumber))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const base = rowToRosterKid(row);

  // Compute age from dateOfBirth if present (matches /[number] logic).
  let ageStr: string | null = null;
  const dob = row.dateOfBirth;
  if (dob) {
    const birth = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
    ageStr = String(Math.max(0, years));
  }

  // Photos: combine the canonical profile_photo_url with the
  // additional photo_urls array. Profile photo first so it stays the
  // primary card image.
  const photos: RosterKidAttachment[] = [];
  if (row.profilePhotoUrl) {
    photos.push({
      id: 'profile',
      url: row.profilePhotoUrl,
      filename: row.profilePhotoUrl.split('/').pop() || 'profile',
      thumbnailUrl: null,
    });
  }
  photos.push(...mapAttachmentArray(row.photoUrls, 'photo'));

  return {
    ...base,
    nameMeaning: row.nameMeaning || '',
    familyContext: row.familyContext || '',
    loves: row.loves || '',
    childQuote: row.childQuote || '',
    notes: row.notes || '',
    age: ageStr,
    homeVillage: row.homeVillage || '',
    teacherName: row.teacherName || '',
    teacherQuote: row.teacherQuote || '',
    reportCards: mapAttachmentArray(row.reportCardUrls, 'report-card'),
    letters: mapAttachmentArray(row.letterUrls, 'letter'),
    photos,
    intakeFromCampus: row.intakeFromCampus || '',
  };
}

// ────────────────────────────────────────────────────────────────────────
// Aggregate fetch — runs all card queries in parallel for the home page.
// ────────────────────────────────────────────────────────────────────────

export interface AdminHomeData {
  pendingUpdates: PendingUpdatesCard;
  shirtsToShip: ShirtsToShipCard;
  newsletterDue: NewsletterDueCard;
  sponsorActivity: SponsorActivityCard;
  rosterGaps: RosterGapsCard;
  thisMonth: ThisMonthCard;
}

export async function getAdminHomeData(): Promise<AdminHomeData> {
  const [
    pendingUpdates,
    shirtsToShip,
    newsletterDue,
    sponsorActivity,
    rosterGaps,
    thisMonth,
  ] = await Promise.all([
    getPendingUpdatesCard(),
    getShirtsToShipCard(),
    getNewsletterDueCard(),
    getSponsorActivityCard(),
    getRosterGapsCard(),
    getThisMonthCard(),
  ]);
  return {
    pendingUpdates,
    shirtsToShip,
    newsletterDue,
    sponsorActivity,
    rosterGaps,
    thisMonth,
  };
}
