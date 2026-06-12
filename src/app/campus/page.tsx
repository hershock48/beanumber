/**
 * /campus — the signed-in browse surface.
 *
 * Sign-in gated. Cold visitors get redirected to /shirts. Reasoning:
 * a public &ldquo;browse all the kids&rdquo; grid undermines the brand mechanic
 * (shirt → number → kid → revelation) because a buyer can scout
 * the roster before purchase and the reveal becomes &ldquo;did I get the
 * one I wanted&rdquo; instead of meeting the kid the shirt connected
 * them to. The public grid also looks like the conventional
 * sponsorship-org directory we&rsquo;re deliberately not — and publishing
 * 100 minors&rsquo; photos, names, ages, and home villages on a single
 * Google-crawlable URL is exposure surface worth declining.
 *
 * The page is also removed from the main nav (BANNavigationClient)
 * and from the public footer. Signed-in sponsors still reach it
 * contextually: from /me (the &ldquo;Add another kid&rdquo; CTAs) and from the
 * YourKidsStrip &ldquo;+Add&rdquo; tile. That&rsquo;s the audience the page actually
 * serves — Mary adding a second relationship, Holders exploring the
 * campus they&rsquo;re already part of, sponsors looking up a kid by name.
 *
 * Cold-direct sponsorship per core_model §0b still works at the
 * per-kid level: every /meet/[id] page is public, individually
 * indexable, and shareable. The collection is what we hide, not the
 * individual stories. A cold visitor who finds a kid via the
 * homepage carousel, a press link, or a Google search for that
 * kid&rsquo;s name can still sponsor them directly.
 *
 * noindex/nofollow on the metadata so the gated page isn&rsquo;t crawled.
 *
 * Server-rendered. Grid is in the HTML on first paint. Daily-stable
 * shuffle so returning sponsors find the kid they were thinking
 * about, rotating across days for variety.
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { SESSION } from '@/lib/constants';
import {
  getRecentCampusNewsletters,
  type CampusNewsletterEntry,
} from '@/lib/newsletter-feed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Page metadata. noindex/nofollow because the page is sign-in gated
 * — surfacing it in Google would point search traffic at a redirect.
 * Per-kid /meet/[id] pages remain indexable on their own merits.
 */
export const metadata: Metadata = {
  title: 'Campus | Be A Number',
  robots: { index: false, follow: false },
};

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
  // Sign-in gate. Cold visitors get pushed to /shirts (the brand
  // mechanic) before any data fetching happens — no point loading
  // the roster for someone we&rsquo;re about to redirect.
  const email = await getViewerEmail();
  if (!email) {
    redirect('/shirts');
  }

  // Three fetches in parallel: the roster, the viewer&rsquo;s
  // sponsored-kid set, and the most recent campus newsletter (the
  // bridge card below the grid). All three return empty/empty/null
  // on failure so the page renders gracefully if Airtable is flaky.
  const [allChildren, viewerKids, recentNewsletters] = await Promise.all([
    fetchAllChildren(),
    fetchViewerKids(email),
    getRecentCampusNewsletters(1),
  ]);
  const latestNewsletter: CampusNewsletterEntry | null =
    recentNewsletters[0] || null;

  // Only kids with a photo go in the grid. A faceless tile defeats
  // the whole &ldquo;meet the kid&rdquo; purpose.
  const displayChildren = allChildren.filter(c => !!c.photoUrl);
  const orderedChildren = seededShuffle(displayChildren, daySeed());

  const ownedRecordIds = new Set(viewerKids.map(k => k.recordId));
  const ownsAnyKid = viewerKids.length > 0;

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/campus" />

      {/* ========== HERO — signed-in only; the cold-visitor branch
          was removed when the page became gated, and the trust strip
          + &ldquo;All real. All enrolled.&rdquo; subhead were removed because
          the campus paragraph below already does the trust work. */}
      <section className="pt-24 pb-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
            The campus
          </p>
          {ownsAnyKid ? (
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
            >
              {ownerHeroHeadline(viewerKids)}
            </h1>
          ) : (
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
            >
              The kids at the campus.
            </h1>
          )}
        </div>
      </section>

      {/* ========== CAMPUS-AS-PLACE — three sentences, names the
          place, the team, the buildings. The page is named "campus"
          so the campus should appear on it. Sits above the grid
          because it&rsquo;s context for what the visitor is about to see. */}
      <section className="pb-12 px-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-[#444] leading-relaxed text-center text-base md:text-lg">
            Six acres in Omoro District, Northern Uganda. Simon Peter
            Wilobo and thirty teachers, nurses, and mentors run the
            day. The campus has a nursery, a primary school, an
            on-site clinic, vocational training for local women, and
            a lodge for sponsors who come visit.
          </p>
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

      {/* ========== FROM THE CAMPUS THIS WEEK — pulls the most recent
          published newsletter as a single bridge card. Makes the
          page feel alive instead of static. Hides if there&rsquo;s no
          newsletter yet so we don&rsquo;t render a placeholder. */}
      {latestNewsletter && (
        <FromTheCampus newsletter={latestNewsletter} />
      )}

      {/* ========== BOTTOM — quiet sponsor-only message. The cold-
          visitor branch was removed when the page became gated. */}
      <section className="pb-20 px-6 border-t border-[#e8e0d4] pt-12">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[#777] leading-relaxed">
            See someone who moves you? Tap their face and use the
            sponsor button on their page to add them.
          </p>
        </div>
      </section>

      <BANFooter />
    </div>
  );
}

// ── Inline subcomponents (server, no client state) ────────────────

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

/**
 * Bridge card to the newsletter archive. Renders the most recent
 * Sent campus newsletter as a hero photo + label + title + date,
 * linking to /news where the full body lives on every kid page.
 *
 * Date format: "June 5, 2026" via toLocaleDateString — month name
 * spelled out reads warmer than 6/5/26 and matches the date style
 * on /me and the kid pages.
 *
 * Image: Airtable signed URL via next/image; falls back to a
 * cream-tone tile if the newsletter has no HeroPhoto attached.
 */
function FromTheCampus({
  newsletter,
}: {
  newsletter: CampusNewsletterEntry;
}) {
  const dateLabel = newsletter.publishedAt
    ? new Date(newsletter.publishedAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  return (
    <section className="pb-16 px-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/news"
          className="group block bg-white border border-[#e8e0d4] overflow-hidden hover:border-[#D4A843] transition-colors"
        >
          <div className="grid md:grid-cols-5">
            <div className="md:col-span-2 aspect-[4/3] md:aspect-auto relative bg-[#f5f0e8]">
              {newsletter.heroPhotoUrl ? (
                <Image
                  src={newsletter.heroPhotoUrl}
                  alt={newsletter.title || 'From the campus'}
                  fill
                  sizes="(max-width: 768px) 100vw, 40vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              ) : null}
            </div>
            <div className="md:col-span-3 p-6 md:p-8 flex flex-col justify-center">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
                From the campus
              </p>
              <h3
                className="text-2xl md:text-3xl text-[#0d0d0d] leading-tight mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                {newsletter.title || 'A note from the campus'}
              </h3>
              {dateLabel && (
                <p className="text-sm text-[#999] mb-4">{dateLabel}</p>
              )}
              <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#D4A843] group-hover:text-[#0d0d0d] transition-colors">
                Read the latest &rarr;
              </span>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}

