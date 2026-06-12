/**
 * /campus — the campus, by faces.
 *
 * Discovery surface. No checkout. The page&rsquo;s entire job is to put
 * every enrolled kid&rsquo;s face in front of the visitor and let them
 * tap through to /meet/[id] for the relationship. Sponsorship CTAs
 * live on /[N] (for owners of that Number) and /meet/[id] (for
 * visitors adding a relationship). Do not reintroduce a kid-picker
 * here — that violates core_model.md §0b and rolls back the
 * sponsorship/campus rename we just shipped.
 *
 * Server-rendered.
 *   - Kids are fetched on the request and rendered into the HTML on
 *     first paint. No client spinner, no fetch waterfall, no
 *     shuffle-on-every-visit. The previous version was 'use client'
 *     end-to-end with an Airtable round-trip in a useEffect — the
 *     cold visitor saw two screens of pitch and a loading state
 *     before the first kid face appeared.
 *   - Order is a deterministic shuffle seeded by the UTC day, so the
 *     campus reads stably within a 24-hour window (Mary, returning
 *     Thursday after meeting a kid on Tuesday, can find them again)
 *     but rotates day-over-day so the page doesn&rsquo;t go stale.
 *
 * State-aware.
 *   - Signed-in sponsor → the hero recognizes them by their kid&rsquo;s
 *     first name, their own kids&rsquo; tiles get a "Your kid" badge in
 *     the grid, and the bottom CTA drops the Get-a-Shirt push.
 *   - Cold visitor → straight discovery, Get a Shirt CTA at the
 *     bottom (after they&rsquo;ve met the kids), pitch lives on /shirts.
 *
 * What used to live here that&rsquo;s gone.
 *   - The "How sponsorship works / What your sponsorship provides /
 *     What you&rsquo;ll receive as a sponsor" info block: same audience
 *     content already lives on /shirts (for shirt buyers) and
 *     /meet/[id] (for direct-discovery sponsors). On /campus it was
 *     friction between the visitor and the kid faces.
 *   - The four-step "How it works" sequence: it&rsquo;s the /shirts brand
 *     mechanic. We cross-link to /shirts in the bottom CTA instead.
 *   - The 11-question FAQ: 4–5 questions overlapped /shirts verbatim.
 *     The remainder belongs on /shirts; cross-link there.
 *   - The carousel-thumbnails + paginated expanded cards: two views
 *     of the same data, both lossy, the carousel meaningless to
 *     navigate, the pagination implying there are kids you haven&rsquo;t
 *     seen yet. Replaced with one responsive grid that shows every
 *     kid at once.
 */

import { cookies } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { SESSION } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── Types ─────────────────────────────────────────────────────────

interface CampusChild {
  recordId: string;
  firstName: string;
  displayName: string;
  age?: number;
  homeVillage?: string;
  loves?: string;
  photoUrl?: string;
}

interface AirtableChildRecord {
  id: string;
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    DateOfBirth?: string;
    HomeVillage?: string;
    Loves?: string;
    ProfilePhoto?: Array<{ url: string }>;
    ShirtNumber?: number;
    Status?: string;
    ReservedForAuction?: boolean;
  };
}

interface ViewerKid {
  recordId: string;
  firstName: string;
}

// ── Constants ─────────────────────────────────────────────────────

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const CAMPUS_CAPACITY = 380;

// ── Helpers: age, status, shuffle ─────────────────────────────────

function computeAge(dob?: string): number | undefined {
  if (!dob) return undefined;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
  return years >= 0 ? years : undefined;
}

/**
 * Status values in Airtable have inconsistent casing ("active" vs
 * "Active") &mdash; mirror /api/children&rsquo;s permissive normalizer.
 */
function isVisibleStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  if (s === 'graduated' || s === 'archived' || s === 'inactive') return false;
  return true;
}

/**
 * Deterministic Fisher–Yates seeded with a mulberry32 PRNG. Same
 * array + same seed → same order. We seed by UTC date so the campus
 * order is STABLE within a 24-hour window (return visits within a
 * day land on the same layout) but rotates day-over-day for variety.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const rnd = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const j = Math.floor(rnd * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function daySeed(): number {
  const d = new Date();
  return (
    d.getUTCFullYear() * 10000 +
    (d.getUTCMonth() + 1) * 100 +
    d.getUTCDate()
  );
}

// ── Data fetching ─────────────────────────────────────────────────

async function fetchAllChildren(): Promise<CampusChild[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];
  try {
    // Same scope as /api/children GET — kids with a ShirtNumber, not
    // reserved-for-auction, not in a hidden status.
    const formula = encodeURIComponent('NOT({ShirtNumber}=BLANK())');
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        CHILDREN_TABLE
      )}?filterByFormula=${formula}&pageSize=100`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { records: AirtableChildRecord[] };
    return data.records
      .filter(r => !r.fields.ReservedForAuction)
      .filter(r => isVisibleStatus(r.fields.Status))
      .map<CampusChild>(r => {
        const f = r.fields;
        return {
          recordId: r.id,
          firstName:
            f.FirstName || f.DisplayName?.split(' ')[0] || 'Child',
          displayName: f.DisplayName || f.FirstName || 'Child',
          age: computeAge(f.DateOfBirth),
          homeVillage: f.HomeVillage,
          loves: f.Loves,
          photoUrl: f.ProfilePhoto?.[0]?.url,
        };
      });
  } catch {
    return [];
  }
}

async function getViewerEmail(): Promise<string | null> {
  try {
    const store = await cookies();
    const raw = store.get(SESSION.COOKIE_NAME);
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
 * Returns the kids the signed-in viewer is in a relationship with
 * (Active sponsor OR Holder). Used to (a) recognize them in the
 * hero and (b) badge their own kids&rsquo; tiles in the grid so they
 * aren&rsquo;t shown to themselves as strangers.
 */
async function fetchViewerKids(email: string): Promise<ViewerKid[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];
  try {
    const safe = email.replace(/"/g, '\\"');
    const formula = encodeURIComponent(
      `AND(LOWER({SponsorEmail})="${safe}", OR({Status}="Active",{Status}="Holder"))`
    );
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}?filterByFormula=${formula}&pageSize=100`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      records: Array<{
        fields: { Children?: string[]; ChildDisplayName?: string };
      }>;
    };
    const out: ViewerKid[] = [];
    const seen = new Set<string>();
    for (const r of data.records) {
      const rid = r.fields.Children?.[0];
      if (!rid || seen.has(rid)) continue;
      seen.add(rid);
      const first =
        (r.fields.ChildDisplayName || '').split(' ')[0] || 'them';
      out.push({ recordId: rid, firstName: first });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Copy helpers ──────────────────────────────────────────────────

/**
 * Compose a hero headline for a signed-in sponsor. Caps at three
 * names then collapses to "and N more" so a sponsor with a dozen
 * kids doesn&rsquo;t get a comma-soup hero.
 */
function ownerHeroHeadline(kids: ViewerKid[]): string {
  // Curly apostrophe via Unicode escape (U+2019) so the string can
  // pass through React text nodes as-is &mdash; entity refs like
  // &rsquo; only decode inside JSX literals, not inside string
  // values, so a templated `You&rsquo;re...` would render literally.
  const ap = '’';
  if (kids.length === 1) return `You${ap}re with ${kids[0].firstName}.`;
  if (kids.length === 2)
    return `You${ap}re with ${kids[0].firstName} and ${kids[1].firstName}.`;
  if (kids.length === 3)
    return `You${ap}re with ${kids[0].firstName}, ${kids[1].firstName}, and ${kids[2].firstName}.`;
  return `You${ap}re with ${kids[0].firstName}, ${kids[1].firstName}, and ${kids.length - 2} more.`;
}

/**
 * "Loves football" works as a tile subtitle. Free-form sentences
 * ("She loves her brother and her granddad and helping in the
 * garden") do not. If the Loves field reads as a sentence or is
 * too long for a tile line, drop it and let the village or age
 * carry the line instead.
 */
function lovesPhrase(loves?: string): string | null {
  if (!loves) return null;
  const trimmed = loves.trim();
  if (!trimmed) return null;
  const firstClause = trimmed.split(/[.,;]/)[0].trim();
  if (firstClause.length === 0 || firstClause.length > 28) return null;
  const lower = firstClause.toLowerCase();
  // Don&rsquo;t double up if the field already starts with "loves".
  return lower.startsWith('loves ')
    ? firstClause.charAt(0).toUpperCase() + firstClause.slice(1)
    : `Loves ${lower}`;
}

// ── Page ──────────────────────────────────────────────────────────

export default async function CampusPage() {
  const email = await getViewerEmail();

  const [allChildren, viewerKids] = await Promise.all([
    fetchAllChildren(),
    email ? fetchViewerKids(email) : Promise.resolve([] as ViewerKid[]),
  ]);

  // Only kids with a photo go in the discovery grid. A faceless tile
  // defeats the whole "meet the kid" purpose. The trust strip still
  // reports the true enrolled headcount so we don&rsquo;t undercount the
  // campus just because intake photography is lagging.
  const enrolledCount = allChildren.length;
  const displayChildren = allChildren.filter(c => !!c.photoUrl);
  const orderedChildren = seededShuffle(displayChildren, daySeed());

  const ownedRecordIds = new Set(viewerKids.map(k => k.recordId));
  const ownsAnyKid = viewerKids.length > 0;

  // Age range across the visible roster, for the trust strip. If
  // either bound is missing (no DOBs filled in), we drop the stat
  // gracefully instead of saying "Ages undefined to undefined".
  const ages = allChildren
    .map(c => c.age)
    .filter((n): n is number => typeof n === 'number');
  const ageRange =
    ages.length > 0
      ? { min: Math.min(...ages), max: Math.max(...ages) }
      : null;

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/campus" />

      {/* ========== HERO — state-aware, no funnel CTA ========== */}
      <section className="pt-24 pb-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
            The campus
          </p>
          {ownsAnyKid ? (
            <>
              <h1
                className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                {ownerHeroHeadline(viewerKids)}
              </h1>
              <p className="text-lg text-[#777] max-w-2xl mx-auto leading-relaxed">
                These are the other kids at the campus.
              </p>
            </>
          ) : (
            <>
              <h1
                className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                Meet the kids at the campus.
              </h1>
              <p className="text-lg text-[#777] max-w-2xl mx-auto leading-relaxed">
                All real. All enrolled.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ========== TRUST STRIP — one line of context, no pitch ========== */}
      <section className="pb-10 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white border border-[#e8e0d4] px-6 py-5 flex flex-col sm:flex-row gap-4 sm:gap-8 items-center justify-center text-center">
            <Stat number={enrolledCount} label="enrolled" />
            {ageRange && (
              <>
                <Divider />
                <Stat
                  text={`Ages ${ageRange.min}–${ageRange.max}`}
                />
              </>
            )}
            <Divider />
            <Stat number={CAMPUS_CAPACITY} label="campus capacity" />
          </div>
        </div>
      </section>

      {/* ========== KID GRID — every face, server-rendered ========== */}
      <section className="pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          {orderedChildren.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
              {orderedChildren.map(child => (
                <KidTile
                  key={child.recordId}
                  child={child}
                  ownsThis={ownedRecordIds.has(child.recordId)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========== BOTTOM — quiet for owners, shirt-first for cold ========== */}
      <section className="pb-20 px-6 border-t border-[#e8e0d4] pt-12">
        <div className="max-w-2xl mx-auto text-center">
          {ownsAnyKid ? (
            <p className="text-[#777] leading-relaxed">
              See someone who moves you? Tap their face and use the
              sponsor button on their page to add them.
            </p>
          ) : (
            <>
              <h2
                className="text-3xl text-[#0d0d0d] mb-3"
                style={{
                  fontFamily: 'var(--font-lora), serif',
                  fontWeight: 600,
                }}
              >
                Get on the campus.
              </h2>
              <p className="text-[#777] leading-relaxed mb-6 max-w-md mx-auto">
                Every Shirt has a Number. Every Number is one of these
                kids. Pick a color, get a Shirt, meet your kid.
              </p>
              <Link
                href="/shirts"
                className="inline-block px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
              >
                Get a Shirt
              </Link>
              <p className="text-xs text-[#aaa] mt-6">
                Want the full breakdown of how this works?{' '}
                <Link
                  href="/shirts"
                  className="text-[#D4A843] hover:underline"
                >
                  See /shirts
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </section>

      <BANFooter />
    </div>
  );
}

// ── Inline subcomponents (server, no client state) ────────────────

function Stat({
  number,
  label,
  text,
}: {
  number?: number;
  label?: string;
  text?: string;
}) {
  if (typeof text === 'string') {
    return (
      <span className="text-sm text-[#0d0d0d]">
        <span
          className="text-xl text-[#0d0d0d] tabular-nums mr-1"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {text}
        </span>
      </span>
    );
  }
  return (
    <span className="text-sm">
      <span
        className="text-2xl text-[#D4A843] tabular-nums mr-2"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
      >
        {number}
      </span>
      <span className="text-[#777]">{label}</span>
    </span>
  );
}

function Divider() {
  return (
    <span
      className="hidden sm:block w-px h-6 bg-[#e8e0d4]"
      aria-hidden="true"
    />
  );
}

function KidTile({
  child,
  ownsThis,
}: {
  child: CampusChild;
  ownsThis: boolean;
}) {
  const phrase = lovesPhrase(child.loves);
  // Prefer "Loves X" over the village line — it&rsquo;s warmer and more
  // specific. Fall back to the village if Loves is missing or too
  // free-form. If neither is present we just show age, or "On campus".
  const subLine = phrase || child.homeVillage || null;
  return (
    <Link
      href={`/meet/${child.recordId}`}
      className="group block bg-white border border-[#e8e0d4] overflow-hidden hover:border-[#D4A843] transition-colors"
    >
      <div className="aspect-[4/5] relative bg-[#f5f0e8]">
        {child.photoUrl && (
          <Image
            src={child.photoUrl}
            alt={`Photo of ${child.displayName}`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}
        {ownsThis && (
          <span className="absolute top-2 left-2 px-2 py-1 bg-[#0d0d0d]/90 text-[#FFF8F0] text-[10px] font-bold uppercase tracking-wider">
            Your kid
          </span>
        )}
      </div>
      <div className="px-3 py-3">
        <p className="font-semibold text-[#0d0d0d] truncate">
          {child.firstName}
        </p>
        <p className="text-xs text-[#999] truncate">
          {child.age ? `Age ${child.age}` : 'On campus'}
          {subLine ? ` · ${subLine}` : ''}
        </p>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="bg-white border border-[#e8e0d4] p-8 max-w-lg mx-auto">
        <h3
          className="text-2xl text-[#0d0d0d] mb-3"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          The campus isn&rsquo;t loading right now.
        </h3>
        <p className="text-[#777] mb-6 leading-relaxed">
          The roster is being updated. Try again in a minute, or drop
          us a note and we&rsquo;ll let you know when profiles are back up.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/contact"
            className="px-6 py-3 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors text-center"
          >
            Get Notified
          </Link>
          <Link
            href="/shirts"
            className="px-6 py-3 border border-[#ccc] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#f5f0e8] transition-colors text-center"
          >
            See the Shirts
          </Link>
        </div>
      </div>
    </div>
  );
}
