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
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RecentKidsStrip } from '@/components/RecentKidsStrip';
import { SESSION } from '@/lib/constants';

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
    shirtNumber?: number;
    displayName: string;
    firstName: string;
    photoUrl?: string;
    departed: boolean;
  };
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

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

async function fetchSponsorshipsForEmail(email: string): Promise<SponsorshipRow[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];
  const safe = email.toLowerCase().replace(/"/g, '\\"');
  const formula = encodeURIComponent(
    `AND(LOWER({SponsorEmail})="${safe}", OR({Status}="Active",{Status}="Holder"))`
  );
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}?filterByFormula=${formula}&pageSize=100`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const sponsorshipRecords: Array<{
      id: string;
      fields: {
        SponsorCode?: string;
        Status?: string;
        MonthlyAmount?: number;
        SponsorshipStartDate?: string;
        Children?: string[];
        ChildDisplayName?: string;
        StripeSubscriptionID?: string;
      };
    }> = data.records || [];

    // Hydrate each sponsorship with its linked Child record.
    const rows: SponsorshipRow[] = [];
    for (const sp of sponsorshipRecords) {
      const f = sp.fields;
      const childRecordId = f.Children?.[0];
      let childInfo = {
        recordId: childRecordId || '',
        shirtNumber: undefined as number | undefined,
        displayName: f.ChildDisplayName || 'A kid at the campus',
        firstName: (f.ChildDisplayName || '').split(' ')[0] || 'them',
        photoUrl: undefined as string | undefined,
        departed: false,
      };
      if (childRecordId) {
        try {
          const childRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
              CHILDREN_TABLE
            )}/${childRecordId}`,
            { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: 'no-store' }
          );
          if (childRes.ok) {
            const c = await childRes.json();
            const cf = c.fields || {};
            childInfo = {
              recordId: c.id,
              shirtNumber: typeof cf.ShirtNumber === 'number' ? cf.ShirtNumber : undefined,
              displayName: cf.DisplayName || cf.FirstName || childInfo.displayName,
              firstName: cf.FirstName || childInfo.firstName,
              photoUrl: cf.ProfilePhoto?.[0]?.url,
              departed: !!cf.DepartedAt,
            };
          }
        } catch {}
      }
      const monthlyOrHolder: 'monthly' | 'holder' =
        f.Status === 'Active' && (f.MonthlyAmount || 0) > 0 ? 'monthly' : 'holder';
      rows.push({
        recordId: sp.id,
        sponsorCode: f.SponsorCode || '',
        status: f.Status || '',
        monthlyAmount: typeof f.MonthlyAmount === 'number' ? f.MonthlyAmount : 0,
        monthlyOrHolder,
        startDate: f.SponsorshipStartDate,
        child: childInfo,
      });
    }
    return rows;
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

  const rows = await fetchSponsorshipsForEmail(email);

  const monthlyTotal = rows
    .filter(r => r.monthlyOrHolder === 'monthly')
    .reduce((sum, r) => sum + (r.monthlyAmount || 0), 0);

  const sponsors = rows.filter(r => r.monthlyOrHolder === 'monthly');
  const holders = rows.filter(r => r.monthlyOrHolder === 'holder');

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
                href="/sponsorship"
                className="px-6 py-3 bg-white border border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Sponsor a kid
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
                  href="/sponsorship"
                  className="px-6 py-3 bg-white border border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors text-center"
                >
                  Sponsor a new kid
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
  const { child, monthlyOrHolder, monthlyAmount, startDate } = row;
  const monthsActive = startDate ? monthsBetween(new Date(startDate), new Date()) : null;
  const href = child.shirtNumber ? `/children/${child.shirtNumber}` : '#';

  return (
    <Link
      href={href}
      className="block bg-white border border-[#e8e0d4] hover:border-[#D4A843] transition-colors"
    >
      <div className="aspect-[4/5] bg-[#f5f0e8] overflow-hidden">
        {child.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={child.photoUrl}
            alt={child.displayName}
            className="w-full h-full object-cover"
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
