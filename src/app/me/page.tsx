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
} from '@/lib/db/queries';
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
  const [rawRows, recentNewsletters, weather] = await Promise.all([
    fetchSponsorshipsForEmail(email),
    getRecentCampusNewsletters(1),
    fetchOmoroWeather(),
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

  // Hydrate each row with the latest published Child Update for its
  // kid. Done in parallel so a sponsor with 6 kids doesn&rsquo;t pay 6×
  // serial round-trips. Each lookup is independent; one failure
  // leaves that card without a digest line and renders normally.
  await Promise.all(
    rows.map(async r => {
      try {
        r.latestUpdate = await getLatestUpdateForChild({
          id: r.child.recordId,
          childId: r.child.childId,
        });
      } catch {
        r.latestUpdate = null;
      }
    })
  );

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
  const CTA_KID_UPDATE_FRESHNESS_MS = 60 * 86_400_000;
  const CTA_NEWSLETTER_FRESHNESS_MS = 45 * 86_400_000;
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

  const newsletterIsFresh =
    latestNewsletter?.publishedAt
      ? now - new Date(latestNewsletter.publishedAt).getTime() < CTA_NEWSLETTER_FRESHNESS_MS
      : false;

  const ctaState: MeCTAState = kidWithFreshestUpdate
    ? {
        kind: 'kid-update',
        kidFirstName: kidWithFreshestUpdate.child.firstName,
        kidHref: kidWithFreshestUpdate.child.shirtNumber
          ? `/children/${kidWithFreshestUpdate.child.shirtNumber}`
          : `/meet/${kidWithFreshestUpdate.child.recordId}`,
      }
    : newsletterIsFresh
    ? { kind: 'newsletter', newsletterHref: '/news' }
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
            My campus
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
            My campus.
          </h1>
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
            {sponsors.length > 0 && holders.length === 0 && (
              <>
                You&rsquo;re staying in the life of{' '}
                <span className="font-bold text-[#0d0d0d]">
                  {sponsors.length} kid{sponsors.length === 1 ? '' : 's'}
                </span>{' '}
                on the ground in Northern Uganda.
              </>
            )}
            {sponsors.length > 0 && holders.length > 0 && (
              <>
                You&rsquo;re staying in the life of{' '}
                <span className="font-bold text-[#0d0d0d]">
                  {sponsors.length} kid{sponsors.length === 1 ? '' : 's'}
                </span>
                {' '}and holding{' '}
                <span className="font-bold text-[#0d0d0d]">
                  {holders.length} more number{holders.length === 1 ? '' : 's'}
                </span>
                .
              </>
            )}
            {sponsors.length === 0 && holders.length > 0 && (
              <>
                You&rsquo;re holding{' '}
                <span className="font-bold text-[#0d0d0d]">
                  {holders.length} number{holders.length === 1 ? '' : 's'}
                </span>{' '}
                waiting on the kids behind them.
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
            {/* ── Kids first ─────────────────────────────────────────
                Sponsors come here to see their kids. Newsletter and
                CTA sit around them, not above them. */}
            {sponsors.length > 0 && (
              <section className="mb-14">
                <div className="flex items-baseline justify-between mb-6">
                  <h2
                    className="text-2xl md:text-3xl text-[#0d0d0d] leading-none"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Your kids.
                  </h2>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#888]">
                    {sponsors.length} sponsored
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sponsors.map(row => (
                    <KidCard
                      key={row.recordId}
                      row={row}
                      milestone={milestoneByKidId.get(row.recordId) ?? null}
                    />
                  ))}
                </div>
              </section>
            )}

            {holders.length > 0 && (
              <section className="mb-14">
                <div className="flex items-baseline justify-between mb-6">
                  <h2
                    className="text-xl md:text-2xl text-[#0d0d0d] leading-none"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Numbers you&rsquo;re holding.
                  </h2>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#888]">
                    {holders.length}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {holders.map(row => (
                    <KidCard
                      key={row.recordId}
                      row={row}
                      milestone={milestoneByKidId.get(row.recordId) ?? null}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── One CTA, chosen by state ──────────────────────────
                Points at the freshest thing waiting for the sponsor.
                Fresh kid update > fresh newsletter > add-another. */}
            <MeContextualCTA state={ctaState} />

            {/* ── Campus snapshot (newsletter) ──────────────────────
                Now below the kids, above the recent-visits strip.
                Renders the NEW pill when this browser hasn't opened
                the letter yet. */}
            {latestNewsletter && (
              <section className="mb-14">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-4">
                  This month at the campus
                </p>
                <Link
                  href="/news"
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
                        className="text-xl md:text-2xl leading-tight mb-3"
                        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                      >
                        {latestNewsletter.title || latestNewsletter.subject || 'Latest from Uganda'}
                      </p>
                      <p className="text-xs uppercase tracking-wider text-[#D4A843] font-bold group-hover:underline">
                        Read this issue &rarr;
                      </p>
                    </div>
                  </div>
                </Link>
              </section>
            )}

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
  const { child, monthlyOrHolder, startDate, latestUpdate, revealedAt } = row;
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
  const href = hasClaimedNumber && child.shirtNumber
    ? `/children/${child.shirtNumber}`
    : child.recordId
    ? `/meet/${child.recordId}`
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
            adds a red NEW pill next to the "Latest" kicker. */}
        {latestUpdate && !child.departed && (
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
