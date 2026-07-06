/**
 * /me — the signed-in user's hub.
 *
 * Shows every kid they have a relationship with — Sponsors and
 * Holders alike — pulled by email from the Sponsorships table. The
 * "family of sponsorships" rendered as a single dashboard.
 *
 * For users without a session cookie, redirects to home with a
 * gentle prompt to sign in. We don't bounce to a login form because
 * sign-in lives in the top nav of every page — they tap that.
 */

import { cookies } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RecentKidsStrip } from '@/components/RecentKidsStrip';
import { KidCardUnreadBadge } from '@/components/KidCardUnreadBadge';
import { UnreadNewsletterPill } from '@/components/UnreadNewsletterPill';
import { MeContextualCTA, type MeCTAState } from '@/components/MeContextualCTA';
import { PreviewMyCampus } from './PreviewMyCampus';
import { CampusAtmosphere } from '@/components/CampusAtmosphere';
import { MilestoneBanner } from '@/components/MilestoneBanner';
import { SESSION } from '@/lib/constants';
import { getRecentCampusNewsletters } from '@/lib/newsletter-feed';
import {
  getViewerSponsorships,
  getLatestUpdateForChild,
  listAllChildren,
  getNoteThreadPreviewsForSponsor,
  type KidCardNotePreview,
} from '@/lib/db/queries';
import { KidCardNotesPreview } from './KidCardNotesPreview';
import { fetchOmoroWeather, serverCampusNow } from '@/lib/omoro';
import { pickKidMilestone, type Milestone } from '@/lib/milestones';
import {
  gradeLabelForSponsor,
  isGradeCode,
  type GradeCode,
} from '@/lib/grades';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SponsorshipRow {
  recordId: string;
  sponsorCode: string;
  status: string;
  monthlyAmount: number;
  monthlyOrHolder: 'monthly' | 'holder';
  startDate?: string;
  /**
   * Timestamp the viewer claimed this kid via /children/[N] Hold-to-Meet.
   * Null when the sponsorship exists but the viewer never claimed a
   * specific number — e.g. sponsored raw through /campus. The number
   * badge only renders when this is set, because the shirt number
   * belongs to whoever's holding a shirt, not to every sponsor.
   */
  revealedAt: string | null;
  child: {
    recordId: string;
    childId: string;
    shirtNumber?: number;
    displayName: string;
    firstName: string;
    photoUrl?: string;
    departed: boolean;
    /**
     * Kid's date of birth in ISO. Powers the birthday-adjacent
     * milestones. Null when the YDO intake hasn't filled this in
     * for the kid yet — milestones layer handles null gracefully.
     */
    dateOfBirth: string | null;
    /**
     * Canonical grade code (LK/UK/P1–P5) or null when unset.
     * Displayed to sponsors via gradeLabelForSponsor and used to
     * decorate the SOTM milestone banner ("in 3rd Grade").
     */
    gradeCode: GradeCode | null;
    /** Current-month SOTM award data. Both null when the kid isn't
     *  actively SOTM this month. */
    sotmMonth: string | null;
    sotmReason: string | null;
  };
  /**
   * Most recent published, sponsor-visible Child Update for this
   * kid. Surfaced on the kid card so /me reads as a digest &mdash; what&rsquo;s
   * new with each of my kids &mdash; instead of a static roster.
   */
  latestUpdate?: ChildUpdateSnapshot | null;
  /**
   * Compact summary of the sponsor's correspondence with this kid.
   * Populated by getNoteThreadPreviewsForSponsor in a single batch
   * query. Null when the sponsor hasn't written to this kid.
   */
  notePreview?: KidCardNotePreview | null;
}

interface ChildUpdateSnapshot {
  title: string;
  publishedAt: string;
  photoUrl?: string;
}

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
 * Pull all active/holder sponsorships for this viewer&rsquo;s email
 * from Postgres, hydrated with each linked kid&rsquo;s display fields.
 * The JOIN shape from queries.ts is flattened here into the
 * SponsorshipRow shape the page&rsquo;s render code expects.
 */
async function fetchSponsorshipsForEmail(email: string): Promise<SponsorshipRow[]> {
  try {
    const rows = await getViewerSponsorships(email);
    return rows.map(r => {
      const monthlyAmount = Number(r.monthlyAmount ?? 0);
      const monthlyOrHolder: 'monthly' | 'holder' =
        r.status === 'Active' && monthlyAmount > 0 ? 'monthly' : 'holder';
      const displayName =
        r.childDisplayName || r.childFirstName || 'A kid at the campus';
      const firstName =
        r.childFirstName || displayName.split(' ')[0] || 'them';
      return {
        recordId: r.sponsorshipId,
        sponsorCode: r.sponsorCode ?? '',
        status: r.status ?? '',
        monthlyAmount,
        monthlyOrHolder,
        startDate: r.sponsorshipStartDate ?? undefined,
        revealedAt: r.childRevealedAt
          ? new Date(r.childRevealedAt).toISOString()
          : null,
        child: {
          recordId: r.childRecordId ?? '',
          childId: r.childIdLegacy ?? '',
          shirtNumber:
            typeof r.childShirtNumber === 'number'
              ? r.childShirtNumber
              : undefined,
          displayName,
          firstName,
          photoUrl: r.childPhotoUrl ?? undefined,
          departed: !!r.childDepartedAt,
          dateOfBirth: r.childDateOfBirth
            ? new Date(r.childDateOfBirth).toISOString()
            : null,
          gradeCode: isGradeCode(r.childGradeClass)
            ? (r.childGradeClass as GradeCode)
            : null,
          sotmMonth: r.childSotmMonth ?? null,
          sotmReason: r.childSotmReason ?? null,
        },
      };
    });
  } catch {
    return [];
  }
}

export default async function MePage() {
  const email = await getViewerEmail();

  // ── Anon viewer: preview the surface ──────────────────────────
  // Instead of hiding /me behind /signin, show anon visitors a
  // preview version that sells the page as the reason to buy a
  // shirt. Same nav ("My campus" is now visible to everyone), so
  // clicking it as anon lands here, not on a redirect to sign-in.
  if (!email) {
    // Pull a small handful of real roster kids (photo required so
    // the preview doesn't render placeholder ghosts), the latest
    // newsletter, and current Omoro weather. All three are public
    // and the atmosphere line reads the same for anon as for signed-
    // in — "the campus is a real place, right now" is the message.
    const [allKids, recentNewsletters, weather] = await Promise.all([
      listAllChildren({ onlyWithPhoto: true }),
      getRecentCampusNewsletters(1),
      fetchOmoroWeather(),
    ]);
    const previewCampusNow = serverCampusNow();
    // Shuffle then slice so the preview doesn't always show the
    // same three faces. Cryptographic randomness isn't the point;
    // just enough variety that a repeat visitor sees a different
    // sample.
    const shuffled = [...allKids].sort(() => Math.random() - 0.5);
    const sampleKids = shuffled.slice(0, 3).map(k => ({
      recordId: k.id,
      firstName: k.firstName || k.displayName?.split(' ')[0] || 'A kid',
      displayName: k.displayName || k.firstName || 'A kid',
      photoUrl: k.profilePhotoUrl ?? undefined,
      shirtNumber: k.shirtNumber ?? null,
    }));
    const nl = recentNewsletters[0];
    const previewNewsletter = nl
      ? {
          title: nl.title ?? null,
          subject: nl.subject ?? null,
          heroPhotoUrl: nl.heroPhotoUrl ?? null,
          publishedAt: nl.publishedAt
            ? new Date(nl.publishedAt).toISOString()
            : null,
        }
      : null;

    return (
      <div className="bg-[#FFF8F0] min-h-screen flex flex-col">
        <BANNavigation currentPath="/me" />
        <PreviewMyCampus
          sampleKids={sampleKids}
          latestNewsletter={previewNewsletter}
          campusNowIso={previewCampusNow}
          weather={weather}
        />
        <BANFooter />
      </div>
    );
  }

  // Parallel-fetch everything server-side. Weather has its own
  // 15-min cache inside fetchOmoroWeather; the others are per-request.
  // If Open-Meteo is slow, the 4-sec internal timeout returns null
  // and the atmosphere widget gracefully drops the weather clause.
  const [rawRows, recentNewsletters, weather, allCampusKids] = await Promise.all([
    fetchSponsorshipsForEmail(email),
    getRecentCampusNewsletters(1),
    fetchOmoroWeather(),
    // Small pool of campus kids for the "Explore the campus" carousel
    // in the Grow section below. Filtered to kids with photos only —
    // the carousel is a browse surface and placeholder-photo cards
    // undermine the pitch. Full roster is small (~50), no pagination
    // needed; we shuffle + slice client-side after excluding the
    // sponsor's own kids.
    listAllChildren({ onlyWithPhoto: true }),
  ]);
  const campusNowIso = serverCampusNow();

  // Dedupe by kid record ID. A user could end up with multiple
  // sponsorship rows for the same kid (Active + Holder, or two
  // Holder rows from a previous bug), and the roster would render
  // duplicate cards. Prefer the monthly (Active) row over the
  // holder row when both exist for the same kid, since the
  // monthly relationship is the more meaningful one to surface.
  const byKidRecord = new Map<string, SponsorshipRow>();
  for (const r of rawRows) {
    const key = r.child.recordId || r.recordId;
    const existing = byKidRecord.get(key);
    if (!existing) {
      byKidRecord.set(key, r);
    } else if (
      existing.monthlyOrHolder === 'holder' &&
      r.monthlyOrHolder === 'monthly'
    ) {
      byKidRecord.set(key, r);
    }
  }
  const rows = Array.from(byKidRecord.values());

  // Hydrate each row with:
  //   1. The latest published Child Update for the kid (per-kid
  //      queries, parallelized).
  //   2. A compact preview of the sponsor's correspondence with the
  //      kid (single batch query across all kids at once — one
  //      roundtrip regardless of how many kids the sponsor has).
  // Failures are non-fatal: a card just renders without that block.
  const childRecordIdsForPreviews = rows
    .map(r => r.child.recordId)
    .filter((v): v is string => !!v);
  const [notePreviewsResult] = await Promise.all([
    getNoteThreadPreviewsForSponsor({
      sponsorEmail: email,
      childRecordIds: childRecordIdsForPreviews,
    }).catch(() => new Map<string, KidCardNotePreview>()),
    ...rows.map(async r => {
      try {
        r.latestUpdate = await getLatestUpdateForChild({
          id: r.child.recordId,
          childId: r.child.childId,
        });
      } catch {
        r.latestUpdate = null;
      }
    }),
  ]);
  for (const r of rows) {
    r.notePreview = notePreviewsResult.get(r.child.recordId) ?? null;
  }

  // Compute the strongest milestone per kid (SOTM this month wins if
  // active, otherwise tenure, birthday, or welcome). Pure computation,
  // no I/O. Departed kids don't get milestones — the relationship has
  // a different frame.
  const milestoneByKidId = new Map<string, Milestone>();
  for (const r of rows) {
    if (r.child.departed) continue;
    const m = pickKidMilestone({
      startDate: r.startDate,
      dateOfBirth: r.child.dateOfBirth,
      kidFirstName: r.child.firstName,
      sotmMonth: r.child.sotmMonth,
      sotmReason: r.child.sotmReason,
      gradeSponsorLabel: r.child.gradeCode
        ? gradeLabelForSponsor(r.child.gradeCode)
        : null,
    });
    if (m) milestoneByKidId.set(r.recordId, m);
  }

  const monthlyTotal = rows
    .filter(r => r.monthlyOrHolder === 'monthly')
    .reduce((sum, r) => sum + (r.monthlyAmount || 0), 0);

  const sponsors = rows.filter(r => r.monthlyOrHolder === 'monthly');
  const holders = rows.filter(r => r.monthlyOrHolder === 'holder');
  const latestNewsletter = recentNewsletters[0];

  // Sample of campus kids the sponsor does NOT already have. Feeds the
  // "Explore the campus" carousel in the Grow section. Excluded via
  // recordId match — the sponsor's own kids shouldn't appear as
  // "meet someone new" options. Departed kids also drop out. Shuffled
  // so repeat visitors see different faces; capped at 6 to keep the
  // carousel scannable. Empty array is fine — the render conditions
  // on length.
  const ownRecordIds = new Set(
    rows.map(r => r.child.recordId).filter((v): v is string => !!v)
  );
  const campusSampleKids = allCampusKids
    .filter(k => k.id && !ownRecordIds.has(k.id) && !k.departedAt)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6)
    .map(k => ({
      recordId: k.id,
      firstName: k.firstName || k.displayName?.split(' ')[0] || 'A kid',
      displayName: k.displayName || k.firstName || 'A kid',
      photoUrl: k.profilePhotoUrl,
      shirtNumber: k.shirtNumber,
    }));

  // Earliest sponsorship start → "part of the campus for N days."
  // Beats a hard-coded "Signed in" kicker: warm, dated, honest.
  const earliestStart = rows
    .map(r => r.startDate)
    .filter((s): s is string => !!s)
    .sort()[0];
  const daysSinceJoin = earliestStart
    ? Math.max(0, Math.floor((Date.now() - new Date(earliestStart).getTime()) / 86_400_000))
    : null;

  // Contextual CTA. Priority chain:
  //   1. Any kid with a RECENT published latest update (≤ 60 days) →
  //      point at that kid. "See what's new" pointing at a 4-month-
  //      old post is a lie the sponsor catches immediately, so gate
  //      on freshness. Also require a real first name and a routable
  //      target so the CTA can't render "See what's new with them"
  //      or link to '/meet/' (empty id).
  //   2. Newsletter within the last ~45 days → point at /news.
  //   3. Fallback → grow-your-campus (add another kid).
  //
  // The old "newsletter" state (2 → "Read this month's letter") was
  // removed 2026-07-06 because /me already renders a full newsletter
  // card below with the hero photo + title — a plain-text CTA above
  // it just said the same thing twice with less signal. Kid update
  // still fires as CTA #1 (it's the ONLY place that surface exists);
  // if there's no kid update, we fall through directly to grow.
  const CTA_KID_UPDATE_FRESHNESS_MS = 60 * 86_400_000;
  const now = Date.now();

  const kidWithFreshestUpdate = rows
    .filter(r => {
      if (!r.latestUpdate?.publishedAt) return false;
      if (r.child.departed) return false;
      // Freshness gate.
      if (now - new Date(r.latestUpdate.publishedAt).getTime() > CTA_KID_UPDATE_FRESHNESS_MS) {
        return false;
      }
      // Named kid + routable target — otherwise the CTA reads wrong.
      const named = r.child.firstName && r.child.firstName !== 'them';
      const routable = !!r.child.shirtNumber || !!r.child.recordId;
      return named && routable;
    })
    .sort((a, b) => {
      const at = a.latestUpdate?.publishedAt ?? '';
      const bt = b.latestUpdate?.publishedAt ?? '';
      return bt.localeCompare(at);
    })[0];

  const ctaState: MeCTAState = kidWithFreshestUpdate
    ? {
        kind: 'kid-update',
        kidFirstName: kidWithFreshestUpdate.child.firstName,
        kidHref: kidWithFreshestUpdate.child.shirtNumber
          ? `/children/${kidWithFreshestUpdate.child.shirtNumber}`
          : `/meet/${kidWithFreshestUpdate.child.recordId}`,
      }
    : { kind: 'grow' };

  return (
    <div className="bg-[#FFF8F0] min-h-screen flex flex-col">
      <BANNavigation currentPath="/me" />
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 py-10 md:py-16">
        {/* ── Header ────────────────────────────────────────────────
            Kicker + serif H1 + one warm line. Dated where we can
            (days since first sponsorship start) so returning
            sponsors feel their tenure. Accounting stat moves to a
            small footer strip lower on the page. */}
        <header className="mb-12 md:mb-16">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#D4A843] mb-3">
            My Campus
          </p>
          {/* Live "postmark" — the campus is a real place, real time,
              real weather. Reads like a letter's dateline. Time
              refreshes client-side every minute; weather is 15-min
              cached server-side (Open-Meteo). */}
          <CampusAtmosphere
            initialCampusNow={campusNowIso}
            weather={weather}
          />
          <h1
            className="text-4xl md:text-6xl text-[#0d0d0d] mb-4 leading-[1.05]"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            My Campus.
          </h1>
          {/* Single-line intro. The prior 3-branch version distinguished
              sponsors from holders — "staying in the life of X kids and
              holding Y more numbers" — which leaked internal jargon
              ("holding a number") that didn't mean anything to the
              reader. Now that the KidCards grid merges both populations,
              the intro says one honest thing: how long you've been at
              the campus, and how many kids you're in the life of. */}
          <p className="text-base md:text-lg text-[#555] leading-relaxed max-w-2xl">
            {daysSinceJoin !== null && daysSinceJoin > 0 ? (
              <>
                You&rsquo;ve been part of the campus for{' '}
                <span className="font-bold text-[#0d0d0d]">
                  {daysSinceJoin} day{daysSinceJoin === 1 ? '' : 's'}
                </span>
                .{' '}
              </>
            ) : (
              <>Welcome to the campus. </>
            )}
            {sponsors.length + holders.length > 0 && (
              <>
                You&rsquo;re staying with{' '}
                <span className="font-bold text-[#0d0d0d]">
                  {sponsors.length + holders.length} kid
                  {sponsors.length + holders.length === 1 ? '' : 's'}
                </span>{' '}
                on the ground in Northern Uganda.
              </>
            )}
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="bg-white border border-[#e8e0d4] p-8 md:p-12 text-center">
            <p
              className="text-2xl text-[#0d0d0d] mb-3"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              You&rsquo;re signed in, but you don&rsquo;t own any
              Numbers yet.
            </p>
            <p className="text-[#666] mb-6 max-w-md mx-auto">
              Get a Shirt, and the Number on the back becomes yours.
              Or sponsor a kid directly without a Shirt.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/shirts"
                className="px-6 py-3 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Shop the Shirts
              </Link>
              <Link
                href="/campus"
                className="px-6 py-3 bg-white border border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Meet the campus
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* ── Campus newsletter — moved to top ─────────────────
                Kevin: the campus letter is the freshest thing on the
                page every month. Leading with it (above the kids grid)
                means a returning sponsor sees "here's what happened
                this month" first, then goes into their own kids. NEW
                pill still renders when this browser hasn't opened it. */}
            {latestNewsletter && (
              <section className="mb-14">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-4">
                  This month at the campus
                </p>
                <Link
                  // back=me → /news page swaps its "Back to home"
                  // breadcrumb to "Back to My Campus" pointing at /me.
                  // Same smart-back pattern used on /children/[N].
                  href="/news?back=me"
                  className="group block bg-[#1a1208] text-white overflow-hidden hover:ring-2 hover:ring-[#D4A843] transition"
                >
                  <div className="flex flex-col md:flex-row">
                    {latestNewsletter.heroPhotoUrl && (
                      <div className="md:w-2/5 aspect-[16/10] md:aspect-auto relative bg-[#2a1f14]">
                        <Image
                          src={latestNewsletter.heroPhotoUrl}
                          alt={latestNewsletter.title || 'From the campus'}
                          fill
                          sizes="(max-width: 768px) 100vw, 40vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    )}
                    <div className="p-6 md:p-8 flex-1">
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3 flex items-center gap-2">
                        <span>
                          From the campus
                          {latestNewsletter.publishedAt && (
                            <span className="text-[#d8cfc1] font-normal normal-case tracking-normal ml-2">
                              &middot; {formatRelativeMonth(latestNewsletter.publishedAt)}
                            </span>
                          )}
                        </span>
                        <UnreadNewsletterPill
                          latestNewsletterPublishedAt={
                            latestNewsletter.publishedAt
                              ? new Date(latestNewsletter.publishedAt).toISOString()
                              : null
                          }
                        />
                      </p>
                      <p
                        className="text-xl md:text-2xl leading-tight mb-4"
                        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                      >
                        {latestNewsletter.title || latestNewsletter.subject || 'Latest from Uganda'}
                      </p>
                      {/* Explicit button-style affordance instead of the
                          previous subtle "text with hover-underline"
                          — Kevin flagged the old one as reading like
                          decorative text rather than a click target. */}
                      <span className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors">
                        Read this issue &rarr;
                      </span>
                    </div>
                  </div>
                </Link>
              </section>
            )}

            {/* ── Your kids — one unified section ─────────────────────
                Previously split into "Your kids" (monthly sponsors)
                and "Numbers you're holding" (shirt-only). Kevin's
                call: don't distinguish. The relationship is real
                either way; the pill INSIDE each card ("Sponsored
                monthly" vs "Holder") carries the distinction if
                anyone actually cares. Merged 2026-07-06. */}
            <section className="mb-14">
              <div className="flex items-baseline justify-between mb-6">
                <h2
                  className="text-2xl md:text-3xl text-[#0d0d0d] leading-none"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  Your Kids.
                </h2>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#888]">
                  {sponsors.length + holders.length}
                </p>
              </div>
              {/* Order:
                    1. Kids you HOLD THE SHIRT for (revealedAt set),
                       ascending by shirt number.
                    2. Co-sponsors (no shirt claim), ascending by
                       sponsorship start date so earlier relationships
                       come first.
                  Kevin's call: the shirt-holder relationship is the
                  primary story ("I met this kid via my number"); those
                  cards should lead. Co-sponsors follow in the order
                  they entered the sponsor's life. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...sponsors, ...holders]
                  .sort((a, b) => {
                    const aHoldsShirt = !!a.revealedAt;
                    const bHoldsShirt = !!b.revealedAt;
                    if (aHoldsShirt !== bHoldsShirt) return aHoldsShirt ? -1 : 1;
                    if (aHoldsShirt) {
                      return (
                        (a.child.shirtNumber ?? Number.MAX_SAFE_INTEGER) -
                        (b.child.shirtNumber ?? Number.MAX_SAFE_INTEGER)
                      );
                    }
                    // Co-sponsors — earlier startDate first.
                    const aDate = a.startDate
                      ? new Date(a.startDate).getTime()
                      : Number.MAX_SAFE_INTEGER;
                    const bDate = b.startDate
                      ? new Date(b.startDate).getTime()
                      : Number.MAX_SAFE_INTEGER;
                    return aDate - bDate;
                  })
                  .map(row => (
                    <KidCard
                      key={row.recordId}
                      row={row}
                      milestone={milestoneByKidId.get(row.recordId) ?? null}
                    />
                  ))}
              </div>
            </section>

            {/* ── Contextual CTA (kid-update only) ─────────────────
                Fires when one of the sponsor's kids has a fresh
                published update (≤60 days). "See what's new with
                {Kid}" pointing at the kid's page. Silent otherwise —
                the Grow section below handles the "nothing new,
                here's how to add more" moment. */}
            <MeContextualCTA state={ctaState} />

            {/* ── Grow your campus ─────────────────────────────────
                Two paths per CLAUDE.md #4: shirt-first (new number,
                new reveal) and campus-browse (co-sponsor an existing
                kid without a shirt). Primary button leads with the
                shirt path — it's the classic entry and the only path
                to a brand-new shirt-linked relationship. Carousel
                below is the co-sponsor discovery surface: real kids
                the sponsor doesn't already have, tap through to
                /meet/[id] where they can read the profile and start
                a sponsorship. Kevin's shape from 2026-07-06. */}
            <section className="bg-[#1a1208] text-white px-6 md:px-10 py-8 md:py-10 mb-10 md:mb-14">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
                Grow your campus
              </p>
              <h2
                className="text-2xl md:text-3xl mb-3 leading-tight"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Help another kid.
              </h2>
              <p className="text-[#d8cfc1] leading-relaxed max-w-xl mb-6">
                Every shirt carries a different number. Every number is
                a different kid. Nothing locks you to one.
              </p>
              <div className="mb-8">
                <Link
                  href="/shirts"
                  className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Shop another shirt
                </Link>
              </div>
              {campusSampleKids.length > 0 && (
                <>
                  <div className="border-t border-[#3a2c1a] pt-6 mb-5">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
                      More kids to meet
                    </p>
                    <p className="text-sm text-[#d8cfc1] leading-relaxed max-w-xl">
                      A few more kids from the campus. If you want to
                      stay in another one&rsquo;s life, sponsor them &mdash;
                      $25/mo, letters, updates, and photos, same as the
                      kids you already have.
                    </p>
                  </div>
                  {/* Horizontal scroll strip. Cards use overflow-x-auto
                      so mobile gets a swipe surface and desktop gets a
                      scrollbar; either way the whole row fits inside
                      the dark card without page-level scroll pressure. */}
                  <div className="overflow-x-auto -mx-6 md:-mx-10 px-6 md:px-10 pb-2">
                    <div className="flex gap-4">
                      {campusSampleKids.map(kid => (
                        <Link
                          key={kid.recordId}
                          href={`/meet/${kid.recordId}`}
                          className="group block flex-shrink-0 w-40 md:w-44"
                        >
                          <div className="aspect-[4/5] bg-[#2a1f14] overflow-hidden relative mb-2">
                            {kid.photoUrl ? (
                              <Image
                                src={kid.photoUrl}
                                alt={kid.displayName}
                                fill
                                sizes="(max-width: 768px) 40vw, 20vw"
                                className="object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">
                                👤
                              </div>
                            )}
                          </div>
                          <p
                            className="text-sm text-white leading-tight group-hover:text-[#D4A843] transition-colors"
                            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                          >
                            {kid.firstName}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* ── About the campus ─────────────────────────────────
                Grounds /me in a real place. Two paragraphs pulled from
                /founder — the location (Omoro District, Northern
                Uganda), the history (LRA war and its aftermath), and
                who's running it (Simon + YDO). Points to the full
                founder story for anyone who wants more. Sits below
                the kids grid so the sponsor's own kids stay first;
                this is context, not lead. */}
            <section className="mb-14 mt-2 bg-white border border-[#e8e0d4] p-6 md:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
                Where this is happening
              </p>
              <h2
                className="text-2xl md:text-3xl text-[#0d0d0d] mb-4 leading-tight"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Omoro District, Northern Uganda.
              </h2>
              <p className="text-[#555] leading-relaxed mb-4">
                Six acres shared by a school built for 380 kids, a
                medical clinic that&rsquo;s treated over 700 patients,
                vocational training where 60 women are learning trades,
                and the housing that keeps it running. It&rsquo;s the
                Youth Development Organisation Uganda (YDO) campus, run
                by Simon Peter Wilobo and a team of 30 local staff
                who grew up in this community.
              </p>
              <p className="text-[#555] leading-relaxed mb-5">
                For two decades Northern Uganda endured the LRA war.
                Most organizations left when the fighting stopped.
                Simon stayed and started YDO. The campus is what he
                built.
              </p>
              <Link
                href="/founder"
                className="inline-block text-xs uppercase tracking-wider font-bold text-[#0d0d0d] hover:text-[#D4A843] transition-colors"
              >
                Read the founding story &rarr;
              </Link>
            </section>

            {/* ── Kids you've recently met (client-side localStorage) ── */}
            <RecentKidsStrip />

            {/* ── Support summary (demoted) ─────────────────────────
                The monthly dollar total moves to a warm footer strip
                instead of leading. Sponsors can still find it; it
                just isn't the first thing they see. */}
            {sponsors.length > 0 && (
              <div className="mt-16 pt-8 border-t border-[#e8e0d4] text-center">
                <p className="text-sm text-[#666] leading-relaxed">
                  You&rsquo;re supporting{' '}
                  <span className="font-bold text-[#0d0d0d]">${monthlyTotal}</span>{' '}
                  a month across{' '}
                  <span className="font-bold text-[#0d0d0d]">
                    {sponsors.length} kid{sponsors.length === 1 ? '' : 's'}
                  </span>
                  . Thank you.
                </p>
              </div>
            )}
          </>
        )}
      </main>
      <BANFooter />
    </div>
  );
}

function KidCard({
  row,
  milestone,
}: {
  row: SponsorshipRow;
  milestone: Milestone | null;
}) {
  const {
    child,
    monthlyOrHolder,
    startDate,
    latestUpdate,
    revealedAt,
    notePreview,
  } = row;
  const monthsActive = startDate ? monthsBetween(new Date(startDate), new Date()) : null;
  // The kid's page URL still uses the shirt number for anyone whose
  // sponsorship is tied to a real shirt — but for viewers who haven't
  // claimed via Hold-to-Meet we route through /meet/[id] so the URL
  // itself doesn't leak a number they don't own. This keeps the
  // buyer-claims-kid invariant clean end to end. If we can't route
  // anywhere (no shirt number AND no record id — should be rare, but
  // possible for a sponsorship pointing at a deleted or half-migrated
  // kid row), render as a non-interactive div rather than a dead
  // href='#' link that scrolls to top on click.
  const hasClaimedNumber = !!revealedAt;
  // Every sponsored kid — shirt-holder or co-sponsor — routes to
  // /children/[N] when the kid has a shirt number. Previously
  // co-sponsors were dumped on /meet/[id], a stripped-down surface
  // without the composer, newsletter, or timeline. The reveal moment
  // is suppressed for anyone the server marks as a sponsor or holder
  // (see child.viewer_is_sponsor / viewer_is_holder in
  // /children/[number]/page.tsx), so a co-sponsor lands directly on
  // the full page without a Hold-to-Meet gate. Fallback to
  // /meet/[recordId] only when the kid has no shirt number at all
  // (rare, out-of-canonical-range).
  //
  // back=me lets the kid page render "Back to My campus" instead of
  // the generic "Back to home" — makes /me → kid → back feel like
  // returning to the same surface instead of teleporting.
  const href = child.shirtNumber
    ? `/children/${child.shirtNumber}?back=me`
    : child.recordId
    ? `/meet/${child.recordId}?back=me`
    : null;

  const cardClass = 'block bg-white border border-[#e8e0d4] transition-colors';
  const linkClass = `${cardClass} hover:border-[#D4A843]`;

  const cardBody = (
    <>
      <div className="aspect-[4/5] bg-[#f5f0e8] overflow-hidden relative">
        {child.photoUrl ? (
          <Image
            src={child.photoUrl}
            alt={child.displayName}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl opacity-25">
            👤
          </div>
        )}
      </div>
      {/* Milestone band — anniversary, birthday, welcome. Sits
          between photo and info as a distinctive stamp. Skipped
          for departed kids because a "One year with…" banner on a
          card for a kid who left has the wrong emotional shape. */}
      {milestone && !child.departed && (
        <MilestoneBanner milestone={milestone} variant="card-band" />
      )}
      <div className="p-4">
        {/* Number kicker only shows if THIS viewer claimed the number
            via Hold-to-Meet. A raw sponsor who came in through /campus
            without a shirt doesn't own a number — showing one would
            imply admin-side matching, which we don't do. */}
        {hasClaimedNumber && child.shirtNumber && (
          <p className="text-xs font-bold uppercase tracking-wider text-[#D4A843] mb-1">
            #{child.shirtNumber}
          </p>
        )}
        <p
          className="text-lg md:text-xl text-[#0d0d0d] mb-1 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {child.displayName}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
          {monthlyOrHolder === 'monthly' ? (
            <span className="inline-block bg-[#D4A843] text-[#0d0d0d] px-2 py-0.5 font-bold uppercase tracking-wider">
              Sponsored monthly
            </span>
          ) : (
            <span className="inline-block bg-[#e8e0d4] text-[#0d0d0d] px-2 py-0.5 font-bold uppercase tracking-wider">
              Holder
            </span>
          )}
          {monthsActive !== null && monthsActive > 0 && (
            <span className="text-[#888]">
              {monthsActive} mo
            </span>
          )}
          {child.departed && (
            <span className="text-[#c0392b] font-bold uppercase tracking-wider">
              Departed
            </span>
          )}
        </div>

        {/* Latest from the campus &mdash; surfaces the most recent published
            update for THIS kid so /me reads as a digest. Quiet when
            we don't have one yet. If the update is newer than this
            viewer's last visit to the kid page, KidCardUnreadBadge
            adds a red NEW pill next to the "Latest" kicker.
            Monthly-sponsor only (2026-07-06 rule change) — holders
            don't get personal kid updates. On the kid page itself the
            'Updates straight from {kid}' section is already sponsor-
            gated; this preview matches that behavior. */}
        {latestUpdate && !child.departed && monthlyOrHolder === 'monthly' && (
          <div className="mt-3 pt-3 border-t border-[#e8e0d4]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1 flex items-center">
              <span>Latest &middot; {formatRelativeDate(latestUpdate.publishedAt)}</span>
              <KidCardUnreadBadge
                childIdLegacy={child.childId || null}
                latestUpdatePublishedAt={latestUpdate.publishedAt}
              />
            </p>
            <p className="text-sm text-[#333] leading-snug line-clamp-2">
              {latestUpdate.title}
            </p>
          </div>
        )}

        {/* Per-kid correspondence preview — silent until the sponsor
            has written to this kid at least once. Monthly-sponsor only
            per the 2026-07-06 rule change; holders can't write, so
            they'd never accumulate a thread anyway. Belt-and-
            suspenders gate here in case a legacy holder somehow has a
            historical thread. */}
        {!child.departed && monthlyOrHolder === 'monthly' && (
          <KidCardNotesPreview
            preview={notePreview ?? null}
            firstName={child.firstName || child.displayName}
            kidHref={href}
            childIdLegacy={child.childId || null}
          />
        )}

        {href && (
          <p className="text-xs font-bold uppercase tracking-wider text-[#0d0d0d] hover:text-[#D4A843] transition-colors mt-3">
            Open page &rarr;
          </p>
        )}
      </div>
    </>
  );

  return href ? (
    <Link href={href} className={linkClass}>
      {cardBody}
    </Link>
  ) : (
    <div className={cardClass} aria-label={`${child.displayName} (page unavailable)`}>
      {cardBody}
    </div>
  );
}

function monthsBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 30)));
}

function formatRelativeMonth(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Compact date label for the kid-card digest. "3 days ago" / "Last
 * week" / "Apr 14" — switches to absolute month + day once the update
 * is far enough back that the relative phrasing stops being useful.
 */
function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const ms = now.getTime() - d.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return 'Last week';
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
