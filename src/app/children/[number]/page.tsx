import { cache } from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RevealBeacon } from './RevealBeacon';
import { RevealOverlay } from './RevealOverlay';
import { ReassignReveal } from './ReassignReveal';
import { ReplacementChooser } from './ReplacementChooser';
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
import { AlreadySponsoringBanner } from './AlreadySponsoringBanner';
import { RecentKidsTracker } from '@/components/RecentKidsTracker';
import { RecentKidsStrip } from '@/components/RecentKidsStrip';
import { SESSION } from '@/lib/constants';

// Never statically optimize or cache this page. Sponsorship status and child
// data changes over time, and a stale empty cache entry would manifest as a
// false 404 on active numbers.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  childRecordId: string
): Promise<AirtableSponsorshipRecord['fields'] | null> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const sponsorshipsTable =
    process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
  if (!apiKey || !baseId) return null;
  const safeEmail = email.toLowerCase().replace(/"/g, '\\"');
  const formula = encodeURIComponent(
    `AND(LOWER({SponsorEmail})="${safeEmail}", OR({Status}="Active",{Status}="Holder"), FIND("${childRecordId}", ARRAYJOIN({Children}, ",")))`
  );
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
        sponsorshipsTable
      )}?filterByFormula=${formula}&maxRecords=1`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const record = data.records?.[0];
    return record?.fields || null;
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
  const donationsTable = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';
  try {
    const formula = encodeURIComponent(`{Stripe Checkout Session ID} = "${sessionId}"`);
    const res = await airtableRequest<{ records: Array<{ id: string; fields: Record<string, any> }> }>(
      `/${encodeURIComponent(donationsTable)}?filterByFormula=${formula}&maxRecords=1`
    );
    if (!res.records.length) return null;
    const donation = res.records[0];
    const fields = donation.fields || {};
    const donorLink: string[] = fields['Donor'] || [];
    const source = (fields['Donation Source'] as string | undefined) || '';
    const isRecurring = Boolean(fields['Recurring Donation']);
    return {
      customerId: (fields['Stripe Customer ID'] as string | undefined) || null,
      email: (fields['Donor Email at Donation'] as string | undefined) || null,
      donorRecordId: donorLink[0] || null,
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
async function getLatestChildUpdate(childRecordId: string): Promise<{
  title: string;
  content: string;
  photos: Array<{ url: string; filename?: string }>;
  updateDate?: string;
} | null> {
  const updatesTable = 'tblrmtVBVzL7zCQDE'; // Child Updates
  try {
    // We filter by the linked Child record ID using FIND across
    // ARRAYJOIN({Child}). Same pattern as donorHasActiveSponsorship.
    const formula = encodeURIComponent(
      `AND(FIND("${childRecordId}", ARRAYJOIN({Child}, ",")), {VisibleToSponsor}=TRUE())`
    );
    const res = await airtableRequest<{
      records: Array<{ id: string; fields: Record<string, any> }>;
    }>(
      `/${encodeURIComponent(updatesTable)}?filterByFormula=${formula}&sort%5B0%5D%5Bfield%5D=UpdateDate&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=1`
    );
    const r = res.records?.[0];
    if (!r) return null;
    const f = r.fields;
    return {
      title: (f.Title as string) || '',
      content: (f.Content as string) || '',
      photos: (f.Photos as Array<{ url: string; filename?: string }> | undefined) || [],
      updateDate: f.UpdateDate as string | undefined,
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
async function donorHasActiveSponsorship(donorRecordId: string): Promise<boolean> {
  const sponsorshipsTable = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
  try {
    const formula = encodeURIComponent(
      `AND(FIND("${donorRecordId}", ARRAYJOIN({Donor}, ",")), {Status}="Active")`
    );
    const res = await airtableRequest<{ records: Array<{ id: string }> }>(
      `/${encodeURIComponent(sponsorshipsTable)}?filterByFormula=${formula}&maxRecords=1`
    );
    return res.records.length > 0;
  } catch (err) {
    console.warn('[children/page] Donor sponsorship check failed', err);
    // Fail closed: if we can't check, don't show the claim card —
    // better to under-prompt than to let a second-claim race in.
    return true;
  }
}

async function airtableRequest<T>(endpoint: string): Promise<T> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    console.error('[children/page] Airtable not configured', {
      hasKey: !!apiKey,
      hasBase: !!baseId,
    });
    throw new Error('Airtable not configured');
  }

  const url = `https://api.airtable.com/v0/${baseId}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    // Always fetch fresh. A stale empty response would surface as a false 404.
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[children/page] Airtable error', {
      url,
      status: response.status,
      body: body.slice(0, 500),
    });
    throw new Error(`Airtable error: ${response.status}`);
  }
  return response.json();
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
// so without cache() the page would hit Airtable 4× instead of 2×.
const getChildByShirtNumber = cache(async function getChildByShirtNumber(shirtNumber: number) {
  const childrenTable = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

  try {
    const formula = encodeURIComponent(`{ShirtNumber}=${shirtNumber}`);
    const childRes = await airtableRequest<{ records: AirtableChildRecord[] }>(
      `/${encodeURIComponent(childrenTable)}?filterByFormula=${formula}&maxRecords=1`
    );

    if (!childRes.records.length) {
      console.warn('[children/page] No child record found for shirt number', {
        shirtNumber,
        table: childrenTable,
      });
      return null;
    }

    const childRecord = childRes.records[0];
    const baseChild = childRecord.fields;
    const recordId = childRecord.id;

    // Cycle-record fallback: if this is a cycle number and the
    // current record lacks photo + structured fields, fetch the
    // canonical kid's record and merge their profile fields onto
    // ours. Identity fields (ShirtNumber, ChildID, DisplayName)
    // come from the cycle record; presentation fields (ProfilePhoto,
    // HomeVillage, FamilyContext, ChildQuote, etc.) come from the
    // canonical kid.
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
        const canonFormula = encodeURIComponent(`{ShirtNumber}=${canonicalNum}`);
        const canonRes = await airtableRequest<{ records: AirtableChildRecord[] }>(
          `/${encodeURIComponent(childrenTable)}?filterByFormula=${canonFormula}&maxRecords=1`
        );
        if (canonRes.records.length) {
          canonicalChildFields = canonRes.records[0].fields;
        }
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
    let sponsorship: AirtableSponsorshipRecord['fields'] | null = null;
    const sponsorshipPromise = childId
      ? (async () => {
          const sponsorshipTable = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
          const sFormula = encodeURIComponent(`{ChildID}="${childId}"`);
          try {
            const sRes = await airtableRequest<{ records: AirtableSponsorshipRecord[] }>(
              `/${encodeURIComponent(sponsorshipTable)}?filterByFormula=${sFormula}&maxRecords=1`
            );
            if (sRes.records.length) return sRes.records[0].fields;
          } catch {
            // Sponsorship lookup is optional
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
        recordId
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

    // Chooser detection. When this sponsor's sponsorship has
    // PendingCandidateChildIDs set, the original kid departed and
    // the sponsor needs to pick a replacement from 3 cards before
    // anything else happens. We render the chooser instead of the
    // normal profile in that case.
    let pendingChooserCandidates:
      | Array<{
          recordId: string;
          firstName: string;
          displayName: string;
          gradeClass: string;
          photoUrl: string | null;
          loves: string;
        }>
      | null = null;
    const pendingBlob = (sponsorship?.PendingCandidateChildIDs as string) || '';
    if (
      viewerIsSponsor &&
      pendingBlob.trim().length > 0
    ) {
      const ids = pendingBlob
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      try {
        const fetched = await Promise.all(
          ids.map(async id => {
            const url =
              `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID || ''}` +
              `/${encodeURIComponent(process.env.AIRTABLE_CHILDREN_TABLE || 'Children')}/${id}`;
            const r = await fetch(url, {
              headers: {
                Authorization: `Bearer ${process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || ''}`,
              },
              cache: 'no-store',
            });
            if (!r.ok) return null;
            const data = await r.json();
            const f = data.fields || {};
            const photoArr =
              (f.ProfilePhoto as Array<{
                url: string;
                thumbnails?: { large?: { url: string } };
              }>) || [];
            const photoUrl =
              photoArr[0]?.thumbnails?.large?.url ||
              photoArr[0]?.url ||
              null;
            return {
              recordId: data.id as string,
              firstName: (f.FirstName as string) || '',
              displayName:
                (f.DisplayName as string) ||
                (f.FirstName as string) ||
                'Kid',
              gradeClass: (f.GradeClass as string) || '',
              photoUrl,
              loves: (f.Loves as string) || '',
            };
          })
        );
        pendingChooserCandidates = fetched.filter(
          (k): k is NonNullable<typeof k> => !!k
        );
      } catch {
        pendingChooserCandidates = null;
      }
    }

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
          const safe = mostRecentPreviousId.replace(/"/g, '\\"');
          const url =
            `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID || ''}` +
            `/${encodeURIComponent(process.env.AIRTABLE_CHILDREN_TABLE || 'Children')}` +
            `?filterByFormula=${encodeURIComponent(`{ChildID}="${safe}"`)}&maxRecords=1`;
          const lookupRes = await fetch(url, {
            headers: {
              Authorization: `Bearer ${process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || ''}`,
            },
            cache: 'no-store',
          });
          if (lookupRes.ok) {
            const lookupData = await lookupRes.json();
            const prev = lookupData.records?.[0];
            if (prev) {
              previousKidName =
                (prev.fields?.DisplayName as string) ||
                (prev.fields?.FirstName as string) ||
                null;
            }
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
      pending_chooser_candidates: pendingChooserCandidates,
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
  if (child.viewer_is_sponsor && child.record_id) {
    const latestChildUpdate = await getLatestChildUpdate(child.record_id);
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

      {/* Already-sponsoring banner — slim, dismissible, only shown to
          unsigned visitors (sponsors and holders already see their
          acknowledgment further down; this is the off-ramp for the
          existing-sponsor-on-new-device case who would otherwise
          panic at the public view). */}
      {!child.viewer_is_sponsor && !child.viewer_is_holder && (
        <AlreadySponsoringBanner shirtNumber={Number(number)} />
      )}

      {/* Replacement chooser short-circuit. When the sponsor's
          original kid has departed and we've staged 3 candidates,
          we skip the entire normal profile until they pick one.
          Their pick triggers the swap + the celebration animation;
          the page refreshes onto the new kid's profile afterward. */}
      {child.viewer_is_sponsor &&
      child.pending_chooser_candidates &&
      child.pending_chooser_candidates.length > 0 ? (
        <main className="max-w-5xl mx-auto px-5">
          <ReplacementChooser
            shirtNumber={Number(number)}
            previousKidName={
              child.first_name || child.display_name || null
            }
            candidates={child.pending_chooser_candidates}
          />
        </main>
      ) : (
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
                  <img
                    key={url + i}
                    src={url}
                    alt={`${displayName} — photo ${i + 1}`}
                    className="w-full h-full object-cover flex-shrink-0 snap-center"
                    style={{ scrollSnapAlign: 'center' }}
                  />
                ))}
              </div>
            ) : photoUrl.startsWith('http') ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="w-full h-full object-cover"
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
                campus. Reframed June 2026 to read as an invitation,
                not an obituary: the headline focuses on the OPEN
                NUMBER (forward-looking), the polite departure note
                sits below as small italic context, and the primary
                CTA points the visitor to meeting another kid. The
                photo + name above stay because the shirt is forever
                tied to this kid. */}
            {child.departed_at && (
              <div className="mb-4 p-5 border border-[#D4A843] bg-[#fffaf0]">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
                  #{number} is open
                </p>
                <p
                  className="text-xl md:text-2xl text-[#0d0d0d] leading-snug mb-2"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  Pick a kid to take this number forward.
                </p>
                <p className="text-sm text-[#666] leading-relaxed mb-3">
                  Every kid on the campus has a story you can step into. Your
                  number can land on any of them.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] text-sm font-bold uppercase tracking-wider px-5 py-2.5 transition-colors"
                >
                  Browse the kids →
                </a>
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

          {/* RIGHT — CTA card (3 states based on viewer identity).
              Departed kids skip every CTA state and render a soft
              "meet another kid" card instead — no point inviting
              sponsorship of a kid who's no longer at the campus, and
              existing sponsors already saw the departure banner up
              top. */}
          <div>
            {child.departed_at ? (
              <div className="bg-white border border-[#e8e0d4] p-7 text-center">
                <p
                  className="text-xl text-[#0d0d0d] mb-3"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  {firstName} is no longer at the campus.
                </p>
                <p className="text-[#555] leading-relaxed mb-5">
                  Their record stays here because their shirt belongs
                  to a sponsor and their story matters. If you&rsquo;re
                  looking for a kid to support, meet the others at
                  Hope Bridge.
                </p>
                <Link
                  href="/"
                  className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors"
                >
                  Meet the kids
                </Link>
              </div>
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
      )}

      <BANFooter />
    </div>
  );
}
