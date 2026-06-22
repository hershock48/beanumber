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
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RecentKidsStrip } from '@/components/RecentKidsStrip';
import { SESSION } from '@/lib/constants';
import { getRecentCampusNewsletters } from '@/lib/newsletter-feed';
import {
  getViewerSponsorships,
  getLatestUpdateForChild,
} from '@/lib/db/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SponsorshipRow {
  recordId: string;
  sponsorCode: string;
  status: string;
  monthlyAmount: number;
  monthlyOrHolder: 'monthly' | 'holder';
  startDate?: string;
  child: {
    recordId: string;
    childId: string;
    shirtNumber?: number;
    displayName: string;
    firstName: string;
    photoUrl?: string;
    departed: boolean;
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
        },
      };
    });
  } catch {
    return [];
  }
}

export default async function MePage() {
  const email = await getViewerEmail();
  if (!email) {
    // No session — route to the sign-in page with context. The
    // ?next=/me param tells /signin what they were trying to reach
    // so it can frame the page accordingly. Previously we redirected
    // to home with ?signin=needed which silently dropped them on
    // the homepage with no indication of why.
    redirect('/signin?next=/me&reason=your-kids');
  }

  const [rawRows, recentNewsletters] = await Promise.all([
    fetchSponsorshipsForEmail(email),
    getRecentCampusNewsletters(1),
  ]);

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

  const monthlyTotal = rows
    .filter(r => r.monthlyOrHolder === 'monthly')
    .reduce((sum, r) => sum + (r.monthlyAmount || 0), 0);

  const sponsors = rows.filter(r => r.monthlyOrHolder === 'monthly');
  const holders = rows.filter(r => r.monthlyOrHolder === 'holder');
  const latestNewsletter = recentNewsletters[0];

  return (
    <div className="bg-[#FFF8F0] min-h-screen flex flex-col">
      <BANNavigation currentPath="/me" />
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 py-8 md:py-14">
        {/* ── Header ── */}
        <div className="mb-10 md:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
            Signed in
          </p>
          <h1
            className="text-3xl md:text-5xl text-[#0d0d0d] mb-3 leading-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Your campus.
          </h1>
          <p className="text-base md:text-lg text-[#666] leading-relaxed max-w-2xl">
            Every kid you have a relationship with, in one place.
            {sponsors.length > 0 && (
              <>
                {' '}You sponsor{' '}
                <span className="font-bold text-[#0d0d0d]">
                  {sponsors.length} kid{sponsors.length === 1 ? '' : 's'}
                </span>{' '}
                at <span className="font-bold text-[#0d0d0d]">${monthlyTotal}/month</span> total.
              </>
            )}
            {holders.length > 0 && sponsors.length > 0 && <> You hold </>}
            {holders.length > 0 && sponsors.length === 0 && <> You hold </>}
            {holders.length > 0 && (
              <>
                <span className="font-bold text-[#0d0d0d]">
                  {holders.length} number{holders.length === 1 ? '' : 's'}
                </span>{' '}
                without monthly.
              </>
            )}
          </p>
        </div>

        {/* Campus snapshot — pulls the latest newsletter so /me reads
            like the campus is alive when you visit, not a static
            list of your relationships. Renders only when we have a
            newsletter to surface; quiet otherwise. */}
        {latestNewsletter && (
          <Link
            href="/news"
            className="group block bg-[#1a1208] text-white mb-10 md:mb-14 overflow-hidden hover:ring-2 hover:ring-[#D4A843] transition"
          >
            <div className="flex flex-col md:flex-row">
              {latestNewsletter.heroPhotoUrl && (
                <div className="md:w-1/3 aspect-[16/10] md:aspect-auto relative bg-[#2a1f14]">
                  <Image
                    src={latestNewsletter.heroPhotoUrl}
                    alt={latestNewsletter.title || 'From the campus'}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              )}
              <div className="p-6 md:p-7 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-2">
                  From the campus
                  {latestNewsletter.publishedAt && (
                    <span className="text-[#d8cfc1] font-normal normal-case tracking-normal ml-2">
                      &middot; {formatRelativeMonth(latestNewsletter.publishedAt)}
                    </span>
                  )}
                </p>
                <p
                  className="text-xl md:text-2xl leading-tight mb-2"
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
        )}

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
            {/* ── Sponsors (paying monthly) ── */}
            {sponsors.length > 0 && (
              <section className="mb-12">
                <h2
                  className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-5"
                >
                  Your sponsored kids
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {sponsors.map(row => (
                    <KidCard key={row.recordId} row={row} />
                  ))}
                </div>
              </section>
            )}

            {/* ── Holders (own the number, not paying monthly) ── */}
            {holders.length > 0 && (
              <section className="mb-12">
                <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-[#888] mb-5">
                  Numbers you own
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {holders.map(row => (
                    <KidCard key={row.recordId} row={row} />
                  ))}
                </div>
              </section>
            )}

            {/* ── Kids you've recently met (client-side localStorage) ── */}
            <RecentKidsStrip />

            {/* ── Grow your campus ── */}
            <section className="mt-10 md:mt-14 border-t border-[#e8e0d4] pt-10">
              <h2
                className="text-2xl md:text-3xl text-[#0d0d0d] mb-3 leading-tight"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Add another kid.
              </h2>
              <p className="text-[#666] leading-relaxed mb-5 max-w-2xl">
                Every shirt is a new number. Every number is another
                kid. Your relationships aren&rsquo;t locked to one.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/shirts"
                  className="px-6 py-3 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors text-center"
                >
                  Shop another shirt
                </Link>
                <Link
                  href="/campus"
                  className="px-6 py-3 bg-white border border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors text-center"
                >
                  Meet the campus
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
      <BANFooter />
    </div>
  );
}

function KidCard({ row }: { row: SponsorshipRow }) {
  const { child, monthlyOrHolder, monthlyAmount, startDate, latestUpdate } =
    row;
  const monthsActive = startDate ? monthsBetween(new Date(startDate), new Date()) : null;
  const href = child.shirtNumber ? `/children/${child.shirtNumber}` : '#';

  return (
    <Link
      href={href}
      className="block bg-white border border-[#e8e0d4] hover:border-[#D4A843] transition-colors"
    >
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
      <div className="p-4">
        {child.shirtNumber && (
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
              Sponsor · ${monthlyAmount}/mo
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
            we don't have one yet. */}
        {latestUpdate && !child.departed && (
          <div className="mt-3 pt-3 border-t border-[#e8e0d4]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
              Latest &middot; {formatRelativeDate(latestUpdate.publishedAt)}
            </p>
            <p className="text-sm text-[#333] leading-snug line-clamp-2">
              {latestUpdate.title}
            </p>
          </div>
        )}

        <p className="text-xs font-bold uppercase tracking-wider text-[#0d0d0d] hover:text-[#D4A843] transition-colors mt-3">
          Open page &rarr;
        </p>
      </div>
    </Link>
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
