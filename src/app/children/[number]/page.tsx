import { cache } from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RevealBeacon } from './RevealBeacon';
import { RevealOverlay } from './RevealOverlay';
import { SponsorButton } from './SponsorButton';
import { NewsletterSignup } from './NewsletterSignup';
import { ClaimMatchCard } from './ClaimMatchCard';
import { MerchPurchaseTile } from './MerchPurchaseTile';
import { SponsorPortalSections } from './SponsorPortalSections';
import { SESSION } from '@/lib/constants';

// Never statically optimize or cache this page. Sponsorship status and child
// data changes over time, and a stale empty cache entry would manifest as a
// false 404 on active numbers.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ChildPageProps {
  params: Promise<{ number: string }>;
  searchParams?: Promise<{ gift?: string; from?: string }>;
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
 * Pull the most recently sent Newsletter. The sponsor view on /[number]
 * surfaces this as "from the campus" — one record applies to all
 * sponsors so Kevin only writes it once a month. Status is the gate:
 * we only show what's been actually sent, not drafts or scheduled
 * future sends.
 */
async function getLatestCampusNewsletter(): Promise<{
  title: string;
  subject: string;
  bodyHtml: string;
  heroPhotoUrl?: string;
  publishedAt?: string;
} | null> {
  const newslettersTable = 'tblqP1zrRsh4mblHq'; // Newsletters
  try {
    // Sent records — Status = "Sent" OR PublishedAt is set. Sorted
    // newest first.
    const formula = encodeURIComponent(`OR({Status}="Sent", NOT({PublishedAt}=BLANK()))`);
    const res = await airtableRequest<{
      records: Array<{ id: string; fields: Record<string, any> }>;
    }>(
      `/${encodeURIComponent(newslettersTable)}?filterByFormula=${formula}&sort%5B0%5D%5Bfield%5D=PublishedAt&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=1`
    );
    const r = res.records?.[0];
    if (!r) return null;
    const f = r.fields;
    return {
      title: (f.Title as string) || '',
      subject: (f.Subject as string) || '',
      bodyHtml: (f.BodyHTML as string) || '',
      heroPhotoUrl: (f.HeroPhoto as Array<{ url: string }> | undefined)?.[0]?.url,
      publishedAt: f.PublishedAt as string | undefined,
    };
  } catch (err) {
    console.warn('[children/page] Newsletter fetch failed', err);
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
    const child = childRecord.fields;
    const childId = child.ChildID;
    const recordId = childRecord.id;

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

    const [sponsorshipResult, viewerCode] = await Promise.all([
      sponsorshipPromise,
      getViewerSponsorCode(),
    ]);
    sponsorship = sponsorshipResult;

    let age: string | undefined = sponsorship?.ChildAge;
    if (!age && child.DateOfBirth) {
      const birthDate = new Date(child.DateOfBirth);
      const today = new Date();
      const years = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      age = String(monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? years - 1 : years);
    }

    const photo = child.ProfilePhoto?.[0]?.url || sponsorship?.ChildPhoto?.[0]?.url;

    const viewerIsSponsor = Boolean(
      viewerCode &&
      sponsorship?.SponsorCode &&
      sponsorship.Status === 'Active' &&
      viewerCode === sponsorship.SponsorCode
    );

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
      'A real child at YDO in Gulu, Uganda. Enter your shirt number to meet them and keep their story going for $25/month.',
    openGraph: {
      title: 'Be A Number',
      description:
        'A real child at YDO in Gulu, Uganda. Enter your shirt number to meet them.',
      images: undefined,
    },
    twitter: {
      card: 'summary',
      title: 'Be A Number',
      description:
        'A real child at YDO in Gulu, Uganda. Enter your shirt number to meet them.',
    },
  };
}

export default async function ChildProfilePage({ params, searchParams }: ChildPageProps) {
  const { number } = await params;
  const sp = searchParams ? await searchParams : {};
  const isGiftReveal = sp?.gift === 'true' || sp?.gift === '1';
  const gifterFromQuery = (sp?.from || '').toString().trim().slice(0, 80);
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
              Double-check your shirt tag &mdash; the number is printed on the inside label.
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

  // Sponsor portal content. Only fetched when the viewer is verified
  // as the sponsor of THIS child — these surfaces are the bulk of
  // what /sponsor used to render, folded onto /[number] so there's
  // one URL per kid that does double duty as public profile and
  // authenticated sponsor view. Fetched in parallel to keep latency
  // off the critical path.
  let portalData: {
    stats: ReturnType<typeof computeSponsorStats>;
    latestChildUpdate: Awaited<ReturnType<typeof getLatestChildUpdate>>;
    latestNewsletter: Awaited<ReturnType<typeof getLatestCampusNewsletter>>;
  } | null = null;
  if (child.viewer_is_sponsor && child.record_id) {
    const [latestChildUpdate, latestNewsletter] = await Promise.all([
      getLatestChildUpdate(child.record_id),
      getLatestCampusNewsletter(),
    ]);
    portalData = {
      stats: computeSponsorStats(child.sponsorship_start_date, child.monthly_amount ?? 25),
      latestChildUpdate,
      latestNewsletter,
    };
  }

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      {/* Silently flip the sponsor's ChildRevealedAt if they're logged in
          and this number matches their assignment. Renders nothing. */}
      <RevealBeacon number={Number(number)} />

      <BANNavigation currentPath={'/children/' + number} />

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

        <RevealOverlay shirtNumber={Number(number)} childName={displayName}>
        <div className="grid md:grid-cols-2 gap-5 md:gap-14 items-start">
          {/* Photo — shorter on mobile to keep the CTA reachable without
              a marathon scroll. Desktop keeps the taller portrait crop. */}
          <div className="aspect-[4/4] md:aspect-[4/5] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden relative">
            {photoUrl.startsWith('http') ? (
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
            {/* Shirt number badge */}
            <div className="absolute top-5 right-5 bg-white/90 backdrop-blur-sm px-4 py-2">
              <span className="text-sm font-bold text-[#D4A843]">#{number}</span>
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center py-0 md:py-4">
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-3"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {displayName}
            </h1>

            <div className="flex items-center gap-3 text-[#777] mb-6">
              {child.age && <span className="text-lg">Age {child.age}</span>}
              {child.age && child.grade_class && <span className="text-[#ccc]">&middot;</span>}
              {child.grade_class && <span className="text-lg">{child.grade_class}</span>}
            </div>

            {/* Pull quote from the child — in their own voice. This is the
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
                    <p className="text-[#444] leading-relaxed">{child.home_village}</p>
                  </div>
                )}
                {child.family_context && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                      Family
                    </p>
                    <p className="text-[#444] leading-relaxed">{child.family_context}</p>
                  </div>
                )}
                {child.loves && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                      About {firstName}
                    </p>
                    <p className="text-[#444] leading-relaxed">{child.loves}</p>
                  </div>
                )}
              </div>
            )}

            {/* Teacher quote — attributed, treated as a second human voice
                on the page. Only appears when TeacherQuote is present. */}
            {child.teacher_quote && (
              <div className="bg-white border border-[#e8e0d4] p-5 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                  From {firstName}&rsquo;s teacher
                </p>
                <p className="text-[#444] leading-relaxed italic">
                  &ldquo;{child.teacher_quote}&rdquo;
                </p>
                {child.teacher_name && (
                  <p className="mt-3 text-sm text-[#888]">— {child.teacher_name}</p>
                )}
              </div>
            )}

            {/* When no structured intake fields exist, fall back to the
                Notes field (mapped as fun_fact) if it has content. This covers
                children like #37 whose bios were written before the structured
                intake form existed. Only show the "story coming" placeholder
                when Notes is also empty. */}
            {!hasStructured && child.fun_fact && (
              <div className="bg-white border border-[#e8e0d4] p-5 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                  About {firstName}
                </p>
                <p className="text-[#444] leading-relaxed">{child.fun_fact}</p>
              </div>
            )}
            {!hasStructured && !child.fun_fact && (
              <div className="bg-white border border-[#e8e0d4] p-5 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                  {firstName}&rsquo;s story
                </p>
                <p className="text-[#666] leading-relaxed">
                  We&rsquo;re gathering {firstName}&rsquo;s full profile from
                  the campus in Omoro District right now — home, family, what
                  they love, and a note from their teacher. Sponsor them today
                  and we&rsquo;ll send it to you as soon as it&rsquo;s in our
                  hands.
                </p>
              </div>
            )}

            {/* ── CTA — three states based on viewer identity ──── */}
            {child.viewer_is_sponsor ? (
              /* ── Verified sponsor: acknowledge, link to portal ── */
              <div className="bg-white border-2 border-[#D4A843]/30 p-7 text-center">
                <p
                  className="text-xl text-[#0d0d0d] mb-3"
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
                <Link
                  href={`/sponsor/${child.sponsor_code}`}
                  className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors"
                >
                  Go to your portal
                </Link>
                <p className="text-center text-xs text-[#bbb] mt-4">
                  On behalf of our entire team &mdash; thank you.
                </p>
              </div>
            ) : (
              /* ── Not the sponsor: single-decision CTA (memo §2).
                  Primary ask: "Will you stay with [child]?" with $25/mo.
                  Secondary ask: monthly newsletter signup (free, captures
                  email for nurture). The shirt-buyer variant warms the
                  headline since they've already given the first month;
                  cold visitors get a slightly more cold-acquisition framing.
              ── */
              <div className="bg-white border-2 border-[#D4A843]/30 p-7">
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

                <p className="text-[#555] leading-relaxed mb-4">
                  Your $25/month supports the campus where {firstName} goes to school,
                  eats morning porridge and a hot meal every day, gets care at the
                  on-site medical center, and learns from teachers who know{' '}
                  {firstName}&rsquo;s name.
                </p>

                <p className="text-[#555] leading-relaxed mb-5">
                  You&rsquo;ll get a monthly newsletter from the campus, photos
                  of {firstName} through the year, a handwritten letter
                  from {firstName}, and a year-end report card.
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

                <p className="text-center text-xs text-[#bbb] mt-3 mb-6">
                  Continuing is your choice. No pressure if not now.
                </p>

                {/* Memo §2 secondary CTA — newsletter-only, no payment. */}
                <div className="border-t border-[#e8e0d4] pt-5">
                  <NewsletterSignup
                    shirtNumber={Number(number)}
                    firstName={firstName}
                    childDisplayName={displayName}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Sponsor portal content folded onto /[number] ────
            Stats, latest update from this kid, latest campus
            newsletter. Renders only when the viewer is verified as
            the sponsor of this child. The data is fetched server-
            side in parallel so this adds at most one Airtable
            round-trip to page load. */}
        {child.viewer_is_sponsor && portalData && (
          <SponsorPortalSections
            firstName={firstName}
            stats={portalData.stats}
            latestChildUpdate={portalData.latestChildUpdate}
            latestNewsletter={portalData.latestNewsletter}
          />
        )}

        {/* ── Sponsor-gated merch collection ────────────────────
            Three states:
            1. Active sponsor  → unlocked catalog with real Stripe checkout
            2. Shirt buyer     → locked teaser, blurred cards, sponsor CTA
            3. Cold visitor    → nothing (focus stays on sponsorship CTA)
        ── */}
        {child.viewer_is_sponsor && child.sponsor_code ? (
          <div className="mt-10 md:mt-16">
            <div className="text-center mb-6 md:mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                Your #{number} collection
              </p>
              <h2
                className="text-2xl md:text-3xl text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                You&rsquo;re a sponsor. These are yours.
              </h2>
              <p className="text-[#777] text-sm max-w-md mx-auto">
                Every piece is handmade with your number on it. One tap, charged to your saved card.
              </p>
            </div>

            {/* Three buyable items. Hoodie needs a size selector; hat and
                stickers go straight to Stripe Checkout on tap. Pricing
                lives server-side in /api/sponsor/merch-purchase so the
                client can't tamper with it. */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              <MerchPurchaseTile
                merchType="hoodie"
                shirtNumber={Number(number)}
                sponsorCode={child.sponsor_code}
                itemName="Hoodie"
                detail={`#${number} on the back`}
                priceLabel="$45 · free shipping"
                needsSize
              />
              <MerchPurchaseTile
                merchType="hat"
                shirtNumber={Number(number)}
                sponsorCode={child.sponsor_code}
                itemName="Hat"
                detail={`#${number} front and center`}
                priceLabel="$30 · free shipping"
                needsSize={false}
              />
              <MerchPurchaseTile
                merchType="stickers"
                shirtNumber={Number(number)}
                sponsorCode={child.sponsor_code}
                itemName="Sticker Pack"
                detail="Laptop, water bottle, wherever"
                priceLabel="$10 · free shipping"
                needsSize={false}
              />
            </div>

            {/* Repeat shirts use the existing Shop Your Number flow on
                the sponsor portal — Kevin hand-prints those. */}
            <p className="text-center text-xs text-[#999] mt-6">
              Want another shirt with #{number} on it? Kevin makes those
              by hand &mdash;{' '}
              <a
                href={`mailto:Kevin@beanumber.org?subject=${encodeURIComponent(`Another #${number} shirt`)}&body=${encodeURIComponent(`Hey Kevin,\n\nI'd love another shirt with #${number} on it. Same color/size as my original works for me.\n\nThanks!`)}`}
                className="text-[#D4A843] underline hover:text-[#c49a3a]"
              >
                send me one
              </a>.
            </p>
          </div>
        ) : viewerLooksLikeBuyer ? (
          <div className="mt-10 md:mt-16">
            <div className="relative">
              {/* Blurred product cards — visible but unreachable */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 opacity-30 blur-[3px] pointer-events-none select-none" aria-hidden>
                {['Hoodie', 'Hat', 'Sticker Pack', 'Another Shirt'].map((name) => (
                  <div key={name} className="bg-white border border-[#e8e0d4] p-3 md:p-4">
                    <div className="aspect-[4/3] bg-[#f5f0e8] flex items-center justify-center mb-3">
                      <p className="text-3xl md:text-4xl font-bold text-[#0d0d0d] opacity-20">
                        #{number}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[#0d0d0d]" style={{ fontFamily: 'var(--font-lora), serif' }}>
                      {name}
                    </p>
                  </div>
                ))}
              </div>

              {/* Lock overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/95 backdrop-blur-sm border border-[#e8e0d4] p-6 md:p-8 text-center max-w-sm mx-4 shadow-lg">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                    Your #{number} collection
                  </p>
                  <p
                    className="text-lg md:text-xl text-[#0d0d0d] mb-3"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Sponsor {firstName} to unlock.
                  </p>
                  <p className="text-[#777] text-sm mb-5 leading-relaxed">
                    Sponsors get exclusive #{number} gear &mdash; hoodies, hats, stickers &mdash; all handmade with your number.
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
              </div>
            </div>
          </div>
        ) : null}

        </RevealOverlay>
      </main>

      <BANFooter />
    </div>
  );
}
