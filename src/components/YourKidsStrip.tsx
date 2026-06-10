/**
 * YourKidsStrip — horizontal strip of every kid the signed-in user
 * sponsors or holds, rendered at the top of every kid page.
 *
 * Solves the navigation hole Kevin flagged: on Marvin&rsquo;s /2, there was
 * no way to hop to Precious&rsquo;s page without going to /me first. The
 * strip turns every kid page into both a destination AND a navigation
 * surface for the user&rsquo;s whole family of relationships.
 *
 * Behavior:
 *   - Reads the sponsor_session cookie for the viewer&rsquo;s email.
 *   - Looks up every Active or Holder Sponsorship row for that email.
 *   - Renders a horizontal strip of small circular avatars + first
 *     names. Click any of them → that kid&rsquo;s /[N] page.
 *   - Excludes the currently-viewed kid (no link to yourself).
 *   - Caps at 12 kids to keep mobile rows manageable.
 *   - Trailing &ldquo;+ Add&rdquo; tile that links to /sponsorship.
 *   - Returns null entirely for non-signed-in visitors, signed-in
 *     visitors with zero kids, or signed-in visitors whose only kid
 *     IS the one they&rsquo;re looking at. The strip should be quiet when
 *     it has nothing useful to add.
 *
 * Server component so we can read the cookie + hit Airtable without
 * a client round-trip. The kid page is already `dynamic = 'force-
 * dynamic'`, so we&rsquo;re not blowing any caching budget.
 */

import { cookies } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { SESSION } from '@/lib/constants';
import { YourKidsStripSticky } from './YourKidsStripSticky';

interface KidLink {
  shirtNumber: number;
  firstName: string;
  photoUrl?: string;
  relationship: 'sponsor' | 'holder';
}

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

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

async function fetchKidsForEmail(email: string): Promise<KidLink[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];
  const safe = email.replace(/"/g, '\\"');
  const formula = encodeURIComponent(
    `AND(LOWER({SponsorEmail})="${safe}", OR({Status}="Active",{Status}="Holder"))`
  );
  try {
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
    const data = await res.json();
    const sponsorships: Array<{
      fields: {
        Status?: string;
        MonthlyAmount?: number;
        Children?: string[];
      };
    }> = data.records || [];

    // Resolve each sponsorship to a kid record. Parallelize so a
    // 6-kid family doesn&rsquo;t do 6 sequential fetches.
    const kids = await Promise.all(
      sponsorships.map(async sp => {
        const childRecordId = sp.fields?.Children?.[0];
        if (!childRecordId) return null;
        try {
          const childRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
              CHILDREN_TABLE
            )}/${childRecordId}`,
            {
              headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
              cache: 'no-store',
            }
          );
          if (!childRes.ok) return null;
          const c = await childRes.json();
          const cf = c.fields || {};
          const shirtNumber =
            typeof cf.ShirtNumber === 'number' ? cf.ShirtNumber : null;
          if (!shirtNumber) return null;
          // Skip kids who have left the campus — clicking through to a
          // departed-kid page is a cul-de-sac.
          if (cf.DepartedAt) return null;
          const status = (sp.fields?.Status as string) || '';
          const amount = (sp.fields?.MonthlyAmount as number) || 0;
          const relationship: 'sponsor' | 'holder' =
            status === 'Active' && amount > 0 ? 'sponsor' : 'holder';
          return {
            shirtNumber,
            firstName:
              cf.FirstName ||
              (cf.DisplayName as string | undefined)?.split(' ')[0] ||
              'them',
            photoUrl: cf.ProfilePhoto?.[0]?.url as string | undefined,
            relationship,
          } satisfies KidLink;
        } catch {
          return null;
        }
      })
    );

    // Deduplicate by shirtNumber (in case the user has multiple
    // sponsorship rows for the same kid — Holder + Active, etc.).
    // Prefer the sponsor relationship over the holder one for the
    // visual tag.
    const byNumber = new Map<number, KidLink>();
    for (const k of kids) {
      if (!k) continue;
      const existing = byNumber.get(k.shirtNumber);
      if (!existing) {
        byNumber.set(k.shirtNumber, k);
      } else if (existing.relationship === 'holder' && k.relationship === 'sponsor') {
        byNumber.set(k.shirtNumber, k);
      }
    }
    return Array.from(byNumber.values()).sort(
      (a, b) => a.shirtNumber - b.shirtNumber
    );
  } catch {
    return [];
  }
}

export async function YourKidsStrip({
  excludeShirtNumber,
}: {
  /** The number currently being viewed — drop from the strip so the
      user isn&rsquo;t looking at a link back to themselves. */
  excludeShirtNumber?: number;
}) {
  const email = await getViewerEmail();
  if (!email) return null;

  const allKids = await fetchKidsForEmail(email);
  const others = excludeShirtNumber
    ? allKids.filter(k => k.shirtNumber !== excludeShirtNumber)
    : allKids;

  // Quiet rules: don&rsquo;t show the bar if it has nothing to add.
  //   - Zero kids: brand-new signed-in user, no relationships yet.
  //     Showing an empty "Your kids" bar is louder than helpful.
  //   - One kid AND that kid is the current page: same logic — the
  //     strip would only show the &ldquo;+ Add&rdquo; tile, which is already in
  //     /me. Skip.
  if (others.length === 0 && allKids.length <= 1) return null;

  const display = others.slice(0, 12);
  const overflow = Math.max(0, others.length - 12);

  return (
    <YourKidsStripSticky>
    <div className="bg-[#1a1208] text-white border-b border-[#3a2f24]">
      <div className="max-w-5xl mx-auto px-5 py-3">
        <div className="flex items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] flex-shrink-0">
            Your kids
          </p>
          {display.map(kid => (
            <Link
              key={kid.shirtNumber}
              href={`/children/${kid.shirtNumber}`}
              className="flex-shrink-0 flex items-center gap-2 group"
              title={`${kid.firstName} (#${kid.shirtNumber})`}
            >
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full overflow-hidden bg-[#2a1f14] relative ring-1 ring-[#3a2f24] group-hover:ring-[#D4A843] transition">
                {kid.photoUrl ? (
                  <Image
                    src={kid.photoUrl}
                    alt={kid.firstName}
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#D4A843]">
                    {kid.firstName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-xs md:text-sm font-semibold text-[#f5f0e8] group-hover:text-[#D4A843] transition-colors whitespace-nowrap">
                {kid.firstName}
              </span>
            </Link>
          ))}
          {overflow > 0 && (
            <Link
              href="/me"
              className="flex-shrink-0 text-xs text-[#d8cfc1] hover:text-[#D4A843] transition-colors whitespace-nowrap"
            >
              +{overflow} more
            </Link>
          )}
          <Link
            href="/sponsorship"
            className="flex-shrink-0 flex items-center gap-2 group ml-1"
            title="Sponsor another kid"
          >
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full border border-dashed border-[#666] flex items-center justify-center text-[#d8cfc1] group-hover:border-[#D4A843] group-hover:text-[#D4A843] transition-colors">
              <span className="text-xl leading-none -mt-1">+</span>
            </div>
            <span className="text-xs text-[#d8cfc1] group-hover:text-[#D4A843] transition-colors whitespace-nowrap">
              Add
            </span>
          </Link>
        </div>
      </div>
    </div>
    </YourKidsStripSticky>
  );
}
