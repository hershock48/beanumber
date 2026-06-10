/**
 * Admin OS — read queries.
 *
 * Server-side data fetchers backing the `/admin` home dashboard cards.
 * Each function returns a small, presentation-ready shape designed for
 * one card. Errors are caught and returned as a graceful "unknown"
 * state so a single failing query doesn't blow up the whole dashboard.
 *
 * Direct Airtable REST calls — no client SDK. Matches the rest of the
 * codebase. No caching beyond the server's request scope.
 */

import { parsePendingDraft } from './pending-draft';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';

const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const CHILD_UPDATES_TABLE =
  process.env.AIRTABLE_CHILD_UPDATES_TABLE || 'Child Updates';
const NEWSLETTERS_TABLE = process.env.AIRTABLE_NEWSLETTERS_TABLE || 'Newsletters';
const FULFILLMENT_TABLE = process.env.AIRTABLE_FULFILLMENT_TABLE || 'Fulfillment';
const DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';

function headers() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function atGet<T>(path: string): Promise<T> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}${path}`;
  const res = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Page through an Airtable table, returning every record. Airtable
 * caps pageSize at 100, so anything larger needs offset pagination.
 */
async function atListAll<F = Record<string, unknown>>(
  tableName: string,
  extraParams = ''
): Promise<AirtableRecord<F>[]> {
  const out: AirtableRecord<F>[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);
    const combined = extraParams ? `${extraParams}&${params.toString()}` : params.toString();
    const page = await atGet<AirtableList<F>>(
      `/${encodeURIComponent(tableName)}?${combined}`
    );
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}

interface AirtableRecord<F = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: F;
}

interface AirtableList<F = Record<string, unknown>> {
  records: AirtableRecord<F>[];
  offset?: string;
}

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
    const formula = encodeURIComponent(`{Status} = "Pending"`);
    const data = await atGet<AirtableList>(
      `/${encodeURIComponent(CHILD_UPDATES_TABLE)}?filterByFormula=${formula}&maxRecords=10&sort%5B0%5D%5Bfield%5D=SubmittedAt&sort%5B0%5D%5Bdirection%5D=desc`
    );
    const recent = data.records.map(rec => {
      const f = rec.fields as Record<string, unknown>;
      const childIdField = f.ChildID as string | undefined;
      return {
        id: rec.id,
        title: (f.Title as string) || (f.UpdateID as string) || 'Untitled update',
        childDisplayName: childIdField || 'Unknown child',
        shirtNumber: null, // joining to Children for ShirtNumber is a v2 add
        submittedAt: (f.SubmittedAt as string) || null,
      };
    });
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
    // Anything not yet shipped is fair game for the "to ship" queue. The
    // exact set of statuses to count depends on Kevin's workflow — we
    // err inclusive and count anything that has a fulfillment row but
    // no tracking number yet.
    const formula = encodeURIComponent(`AND({Tracking}="", {Shipping}!="Shipped")`);
    const data = await atGet<AirtableList>(
      `/${encodeURIComponent(FULFILLMENT_TABLE)}?filterByFormula=${formula}&maxRecords=200&fields%5B%5D=Tracking`
    );
    return { ok: true, count: data.records.length };
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
    const formula = encodeURIComponent(`{Status} = "Sent"`);
    const data = await atGet<AirtableList>(
      `/${encodeURIComponent(NEWSLETTERS_TABLE)}?filterByFormula=${formula}&maxRecords=1&sort%5B0%5D%5Bfield%5D=PublishedAt&sort%5B0%5D%5Bdirection%5D=desc`
    );
    const latest = data.records[0];
    if (!latest) {
      return {
        ok: true,
        daysSinceLast: null,
        lastSentAt: null,
        lastSubject: null,
        due: true,
      };
    }
    const f = latest.fields as Record<string, unknown>;
    const publishedAt = (f.PublishedAt as string) || null;
    let daysSinceLast: number | null = null;
    if (publishedAt) {
      const ms = Date.now() - new Date(publishedAt).getTime();
      daysSinceLast = Math.floor(ms / (1000 * 60 * 60 * 24));
    }
    return {
      ok: true,
      daysSinceLast,
      lastSentAt: publishedAt,
      lastSubject: (f.Subject as string) || (f.Title as string) || null,
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
    const formula = encodeURIComponent(
      `AND({Status}="Active", IS_AFTER({SponsorshipStartDate}, DATEADD(TODAY(), -7, 'days')))`
    );
    const data = await atGet<AirtableList>(
      `/${encodeURIComponent(SPONSORSHIPS_TABLE)}?filterByFormula=${formula}&maxRecords=20&sort%5B0%5D%5Bfield%5D=SponsorshipStartDate&sort%5B0%5D%5Bdirection%5D=desc`
    );
    const newRecent = data.records.map(rec => {
      const f = rec.fields as Record<string, unknown>;
      return {
        id: rec.id,
        sponsorName: (f.SponsorName as string) || (f.SponsorEmail as string) || 'Unknown sponsor',
        childDisplayName: (f.ChildDisplayName as string) || 'Unknown child',
        sponsorshipStartDate: (f.SponsorshipStartDate as string) || null,
      };
    });
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
    // Pull everything (canonical kids only — exclude cycle records and
    // the empty stubs). Canonical kids have ShirtNumber 1–53 and a real
    // ChildID. Paginated because Airtable caps pageSize at 100 and we
    // have ~165 child records (canonical + cycles + stubs).
    const records = await atListAll(
      CHILDREN_TABLE,
      'fields%5B%5D=ShirtNumber&fields%5B%5D=ProfilePhoto&fields%5B%5D=NameMeaning&fields%5B%5D=FamilyContext&fields%5B%5D=Loves&fields%5B%5D=Notes&fields%5B%5D=ChildID&fields%5B%5D=DisplayName&fields%5B%5D=FirstName'
    );
    const data = { records };
    let totalKids = 0;
    let missingPhoto = 0;
    let missingNameMeaning = 0;
    let missingFamilyContext = 0;
    let missingLoves = 0;
    let missingNotes = 0;
    let fullyComplete = 0;

    // First pass — same shape as the roster grid query: collect any
    // record with a positive shirt number and a name, then dedupe
    // ghost duplicates (no photo, name copied from a lower kid).
    type Row = {
      f: Record<string, unknown>;
      n: number;
      displayName: string;
      hasPhoto: boolean;
    };
    const raw: Row[] = [];
    for (const rec of data.records) {
      const f = rec.fields as Record<string, unknown>;
      const n = f.ShirtNumber as number | undefined;
      if (typeof n !== 'number' || n < 1) continue;
      const displayName =
        ((f.DisplayName as string) || (f.FirstName as string) || '').trim();
      if (!displayName) continue;
      const hasPhoto = Array.isArray(f.ProfilePhoto) && (f.ProfilePhoto as unknown[]).length > 0;
      raw.push({ f, n, displayName, hasPhoto });
    }
    raw.sort((a, b) => a.n - b.n);
    const seen = new Set<string>();
    const real: Row[] = [];
    for (const row of raw) {
      const key = row.displayName.toLowerCase();
      if (!row.hasPhoto && seen.has(key)) continue;
      seen.add(key);
      real.push(row);
    }

    for (const row of real) {
      const { f, hasPhoto } = row;
      totalKids++;
      const hasNameMeaning = !!(f.NameMeaning as string);
      const hasFamily = !!(f.FamilyContext as string);
      const hasLoves = !!(f.Loves as string);
      const hasNotes = !!(f.Notes as string);
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

    const [newSubs, donations, activeSubs] = await Promise.all([
      atGet<AirtableList>(
        `/${encodeURIComponent(SPONSORSHIPS_TABLE)}?filterByFormula=${encodeURIComponent(
          `AND({Status}="Active", IS_AFTER({SponsorshipStartDate}, "${monthStart}"))`
        )}&maxRecords=200&fields%5B%5D=SponsorshipStartDate`
      ),
      atGet<AirtableList>(
        `/${encodeURIComponent(DONATIONS_TABLE)}?filterByFormula=${encodeURIComponent(
          `AND({Payment Status}="Succeeded", IS_AFTER({Donation Date}, "${monthStart}"))`
        )}&maxRecords=500&fields%5B%5D=Donation%20Amount`
      ),
      atGet<AirtableList>(
        `/${encodeURIComponent(SPONSORSHIPS_TABLE)}?filterByFormula=${encodeURIComponent(
          `{Status}="Active"`
        )}&maxRecords=1000&fields%5B%5D=MonthlyAmount`
      ),
    ]);

    const donationsThisMonthCents = donations.records.reduce((sum, rec) => {
      const f = rec.fields as Record<string, unknown>;
      const amount = (f['Donation Amount'] as number) || 0;
      return sum + Math.round(amount * 100);
    }, 0);

    const monthlyRecurringCents = activeSubs.records.reduce((sum, rec) => {
      const f = rec.fields as Record<string, unknown>;
      const amount = (f.MonthlyAmount as number) || 25;
      return sum + Math.round(amount * 100);
    }, 0);

    return {
      ok: true,
      newSponsorshipsThisMonth: newSubs.records.length,
      donationsThisMonthCents,
      activeSponsorships: activeSubs.records.length,
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
  // Airtable record's createdTime when there's no LastModified field.
  lastModified: string;
}

export async function getRoster(): Promise<RosterKid[]> {
  const records = await atListAll(CHILDREN_TABLE);

  // Pull every record with a positive shirt number and a non-empty
  // name. The data is messy: most kids exist under multiple shirt
  // numbers (one canonical record at #1–53 plus extra rows the legacy
  // Stripe webhook seeded at higher numbers when shirts in those
  // ranges sold). For Simon's roster Kevin only wants ONE card per
  // real kid — they all click through to the same editor anyway.
  const raw: Array<{
    rec: { id: string; createdTime: string; fields: Record<string, unknown> };
    n: number;
    displayName: string;
    hasPhoto: boolean;
  }> = [];
  for (const rec of records) {
    const f = rec.fields as Record<string, unknown>;
    const n = f.ShirtNumber as number | undefined;
    if (typeof n !== 'number' || n < 1) continue;
    const displayName =
      ((f.DisplayName as string) || (f.FirstName as string) || '').trim();
    if (!displayName) continue;
    const photoArr = (f.ProfilePhoto as Array<unknown>) || [];
    raw.push({ rec, n, displayName, hasPhoto: photoArr.length > 0 });
  }

  // Pick one canonical record per unique name. Photo-bearing records
  // beat photo-less ghosts; among photo-bearing records the lowest
  // shirt number wins (the canonical #1-53 entry over a webhook copy
  // at #54+). The result: each real kid shows once, linked to their
  // primary record.
  raw.sort((a, b) => {
    if (a.hasPhoto !== b.hasPhoto) return a.hasPhoto ? -1 : 1;
    return a.n - b.n;
  });
  const byName = new Map<string, typeof raw[number]>();
  for (const r of raw) {
    const key = r.displayName.toLowerCase();
    if (!byName.has(key)) byName.set(key, r);
  }

  const kids: RosterKid[] = [];
  for (const { rec, n, displayName, hasPhoto } of byName.values()) {
    const f = rec.fields as Record<string, unknown>;
    const photoArr = (f.ProfilePhoto as Array<{ url: string; thumbnails?: { large?: { url: string } } }>) || [];
    const photoUrl = photoArr[0]?.thumbnails?.large?.url || photoArr[0]?.url || null;
    kids.push({
      recordId: rec.id,
      childId: (f.ChildID as string) || '',
      shirtNumber: n,
      displayName,
      firstName: (f.FirstName as string) || '',
      gradeClass: (f.GradeClass as string) || null,
      photoUrl,
      has: {
        photo: hasPhoto,
        nameMeaning: !!(f.NameMeaning as string),
        familyContext: !!(f.FamilyContext as string),
        loves: !!(f.Loves as string),
        childQuote: !!(f.ChildQuote as string),
        notes: !!(f.Notes as string),
      },
      hasPendingIntake: !!(f.IntakeFromCampus as string),
      lastEditedBySimon: (f.LastEditedBySimon as string) || null,
      pendingFields: parsePendingFields(f.PendingFields),
      pendingDraft: parsePendingDraft(f.PendingDraft),
      publicValues: {
        nameMeaning: (f.NameMeaning as string) || '',
        familyContext: (f.FamilyContext as string) || '',
        loves: (f.Loves as string) || '',
        childQuote: (f.ChildQuote as string) || '',
        notes: (f.Notes as string) || '',
      },
      hasReportCards: Array.isArray(f.ReportCards) && (f.ReportCards as unknown[]).length > 0,
      hasLetters: Array.isArray(f.Letters) && (f.Letters as unknown[]).length > 0,
      studentOfMonth: (f.StudentOfMonth as string) || '',
      studentOfMonthReason: (f.StudentOfMonthReason as string) || '',
      pendingSOTMMonth: (f.PendingSOTMMonth as string) || '',
      pendingSOTMReason: (f.PendingSOTMReason as string) || '',
      deletionRequestedAt: (f.DeletionRequestedAt as string) || null,
      departedAt: (f.DepartedAt as string) || null,
      departureNote: (f.DepartureNote as string) || '',
      departureRequestedAt: (f.DepartureRequestedAt as string) || null,
      departureRequestedNote: (f.DepartureRequestedNote as string) || '',
      lastModified: rec.createdTime,
    });
  }
  // Alphabetical by display name — reads like a class roster.
  kids.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return kids;
}

/** Airtable returns multipleSelects as either an array of strings or
 *  an array of `{ name }` objects depending on the API call. Normalize
 *  to a flat string[]. */
function parsePendingFields(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(v => (typeof v === 'string' ? v : (v as { name?: string })?.name || ''))
    .filter(Boolean);
}

// parsePendingDraft is imported at the top of the file from
// ./pending-draft so the save endpoint, approve endpoint, and this
// queries module all read PendingDraft through one definition.

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
  homeVillage: string | null;
  reportCards: RosterKidAttachment[];
  letters: RosterKidAttachment[];
  /** Every ProfilePhoto attached to this kid. Used by the editor to
   *  list them with delete controls, and by the public profile
   *  carousel. The single `photoUrl` (large thumbnail of the first)
   *  remains on the base RosterKid for the grid card. */
  photos: RosterKidAttachment[];
  /** Raw intake notes from Simon / YDO team. Kevin polishes these
   *  into the public fields, then clears the field. */
  intakeFromCampus: string;
}

export async function getRosterKidByNumber(shirtNumber: number): Promise<RosterKidDetail | null> {
  const formula = encodeURIComponent(`{ShirtNumber}=${shirtNumber}`);
  const data = await atGet<AirtableList>(
    `/${encodeURIComponent(CHILDREN_TABLE)}?filterByFormula=${formula}&maxRecords=1`
  );
  const rec = data.records[0];
  if (!rec) return null;
  const f = rec.fields as Record<string, unknown>;
  const photoArr = (f.ProfilePhoto as Array<{ url: string; thumbnails?: { large?: { url: string } } }>) || [];
  const photoUrl = photoArr[0]?.thumbnails?.large?.url || photoArr[0]?.url || null;

  // Compute age from DateOfBirth if present (matches /[number] logic).
  let ageStr: string | null = null;
  const dob = f.DateOfBirth as string | undefined;
  if (dob) {
    const birth = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
    ageStr = String(Math.max(0, years));
  }

  // Helper to normalize Airtable attachment arrays for the editor.
  const mapAttachments = (key: string): RosterKidAttachment[] => {
    const raw = (f[key] as Array<{
      id: string;
      url: string;
      filename: string;
      size?: number;
      type?: string;
      thumbnails?: { large?: { url: string }; small?: { url: string } };
    }>) || [];
    // Airtable returns oldest first; reverse for most-recent-first.
    return raw
      .slice()
      .reverse()
      .map(a => ({
        id: a.id,
        url: a.url,
        filename: a.filename,
        size: a.size,
        type: a.type,
        thumbnailUrl: a.thumbnails?.large?.url || a.thumbnails?.small?.url || null,
      }));
  };

  return {
    recordId: rec.id,
    childId: (f.ChildID as string) || '',
    shirtNumber: f.ShirtNumber as number,
    displayName: (f.DisplayName as string) || (f.FirstName as string) || `Kid #${shirtNumber}`,
    firstName: (f.FirstName as string) || '',
    gradeClass: (f.GradeClass as string) || null,
    photoUrl,
    has: {
      photo: photoArr.length > 0,
      nameMeaning: !!(f.NameMeaning as string),
      familyContext: !!(f.FamilyContext as string),
      loves: !!(f.Loves as string),
      childQuote: !!(f.ChildQuote as string),
      notes: !!(f.Notes as string),
    },
    hasPendingIntake: !!(f.IntakeFromCampus as string),
    lastEditedBySimon: (f.LastEditedBySimon as string) || null,
    pendingFields: parsePendingFields(f.PendingFields),
    pendingDraft: parsePendingDraft(f.PendingDraft),
    publicValues: {
      nameMeaning: (f.NameMeaning as string) || '',
      familyContext: (f.FamilyContext as string) || '',
      loves: (f.Loves as string) || '',
      childQuote: (f.ChildQuote as string) || '',
      notes: (f.Notes as string) || '',
    },
    hasReportCards: Array.isArray(f.ReportCards) && (f.ReportCards as unknown[]).length > 0,
    hasLetters: Array.isArray(f.Letters) && (f.Letters as unknown[]).length > 0,
    studentOfMonth: (f.StudentOfMonth as string) || '',
    studentOfMonthReason: (f.StudentOfMonthReason as string) || '',
    pendingSOTMMonth: (f.PendingSOTMMonth as string) || '',
    pendingSOTMReason: (f.PendingSOTMReason as string) || '',
    deletionRequestedAt: (f.DeletionRequestedAt as string) || null,
    departedAt: (f.DepartedAt as string) || null,
    departureNote: (f.DepartureNote as string) || '',
    departureRequestedAt: (f.DepartureRequestedAt as string) || null,
    departureRequestedNote: (f.DepartureRequestedNote as string) || '',
    lastModified: rec.createdTime,
    nameMeaning: (f.NameMeaning as string) || '',
    familyContext: (f.FamilyContext as string) || '',
    loves: (f.Loves as string) || '',
    childQuote: (f.ChildQuote as string) || '',
    notes: (f.Notes as string) || '',
    age: ageStr,
    homeVillage: (f.HomeVillage as string) || null,
    reportCards: mapAttachments('ReportCards'),
    letters: mapAttachments('Letters'),
    // mapAttachments reverses order (most-recent first). For photos
    // we want oldest first so the carousel ordering matches what
    // Kevin sees in the editor.
    photos: mapAttachments('ProfilePhoto').slice().reverse(),
    intakeFromCampus: (f.IntakeFromCampus as string) || '',
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
