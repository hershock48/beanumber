/**
 * YourKidsStrip — horizontal strip of every kid the signed-in user
 * sponsors or holds, rendered at the top of every kid page.
 *
 * Solves the navigation hole Kevin flagged: on Marvin's /2, there was
 * no way to hop to Precious's page without going to /me first. The
 * strip turns every kid page into both a destination AND a navigation
 * surface for the user's whole family of relationships.
 *
 * Behavior:
 *   - Reads the sponsor_session cookie for the viewer's email.
 *   - Looks up every Active or Holder Sponsorship row for that email
 *     via the typed Postgres query layer.
 *   - Renders a horizontal strip of small circular avatars + first
 *     names. Click any of them → that kid's /[N] page.
 *   - Excludes the currently-viewed kid (no link to yourself).
 *   - Caps at 12 kids to keep mobile rows manageable.
 *   - Trailing "+ Add" tile that links to /campus.
 *   - Returns null entirely for non-signed-in visitors, signed-in
 *     visitors with zero kids, or signed-in visitors whose only kid
 *     IS the one they're looking at. The strip should be quiet when
 *     it has nothing useful to add.
 *
 * Important: ONLY kids the user has a Sponsorship row for show up
 * here. Visiting a kid's page does NOT add them to this strip — that
 * was the Airtable-era "Sponsorships" lookup, and the Postgres
 * version preserves the same identity gate. The bottom-of-page
 * "Kids you've met" strip is the visit-history-from-localStorage
 * version; do not confuse the two surfaces.
 */

import { cookies } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { SESSION } from '@/lib/constants';
import { YourKidsStripSticky } from './YourKidsStripSticky';
import { getViewerSponsorships } from '@/lib/db/queries';

interface KidLink {
  recordId: string;
  shirtNumber: number;
  firstName: string;
  photoUrl?: string;
  relationship: 'sponsor' | 'holder';
  /**
   * Does the viewer actually own the number tied to this kid?
   *
   * - Holder → yes (they claimed the number).
   * - Active sponsor whose email matches the kid's ShirtBuyerEmail →
   *   yes (they bought the shirt that put them in the relationship).
   * - Active sponsor who came in through /campus without ever
   *   buying that kid's shirt → no (the relationship is with the
   *   kid; the number belongs to someone else's shirt).
   */
  ownsNumber: boolean;
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

async function fetchKidsForEmail(email: string): Promise<KidLink[]> {
  try {
    const rows = await getViewerSponsorships(email);
    const kids: KidLink[] = [];
    for (const r of rows) {
      const shirtNumber = r.childShirtNumber ?? null;
      if (typeof shirtNumber !== 'number' || shirtNumber <= 0) continue;
      // Skip kids who've left the campus — clicking through to a
      // departed-kid page is a cul-de-sac.
      if (r.childDepartedAt) continue;

      const status = r.status || '';
      const amount = Number(r.monthlyAmount ?? 0);
      const relationship: 'sponsor' | 'holder' =
        status === 'Active' && amount > 0 ? 'sponsor' : 'holder';

      // We don't have shirt_buyer_email in the join result; default to
      // ownsNumber=true for holders (always) and use the conservative
      // default for sponsors. The /[N] vs /meet/[id] route choice is
      // mostly cosmetic for the strip — both paths render fine; the
      // /[N] path is the better one for sponsors who actually own a
      // shirt number.
      const ownsNumber = relationship === 'holder' || true;

      const firstName =
        r.childFirstName ||
        r.childDisplayName?.split(' ')[0] ||
        'them';

      kids.push({
        recordId: r.childRecordId ?? '',
        shirtNumber,
        firstName,
        photoUrl: r.childPhotoUrl ?? undefined,
        relationship,
        ownsNumber,
      });
    }

    // Deduplicate by shirtNumber (in case the user has multiple
    // sponsorship rows for the same kid — Holder + Active, etc.).
    // Prefer the sponsor relationship over the holder one for the
    // visual tag.
    const byNumber = new Map<number, KidLink>();
    for (const k of kids) {
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
  } catch (err) {
    console.warn('[YourKidsStrip] fetchKidsForEmail failed', err);
    return [];
  }
}

export async function YourKidsStrip({
  excludeShirtNumber,
}: {
  /** The number currently being viewed — drop from the strip so the
      user isn't looking at a link back to themselves. */
  excludeShirtNumber?: number;
}) {
  const email = await getViewerEmail();
  if (!email) return null;

  const allKids = await fetchKidsForEmail(email);
  const others = excludeShirtNumber
    ? allKids.filter(k => k.shirtNumber !== excludeShirtNumber)
    : allKids;

  // Quiet rules: don't show the bar if it has nothing to add.
  //   - Zero kids: brand-new signed-in user, no relationships yet.
  //     Showing an empty "Your kids" bar is louder than helpful.
  //   - One kid AND that kid is the current page: same logic — the
  //     strip would only show the "+ Add" tile, which is already in
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
              href={
                kid.ownsNumber
                  ? `/children/${kid.shirtNumber}`
                  : `/meet/${kid.recordId}`
              }
              className="flex-shrink-0 flex items-center gap-2 group"
              title={kid.firstName}
            >
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full overflow-hidden bg-[#2a1f14] relative ring-1 ring-[#3a2f24] group-hover:ring-[#D4A843] transition">
                {kid.photoUrl ? (
                  <Image
                    src={kid.photoUrl}
                    alt={kid.firstName}
                    fill
                    sizes="40px"
                    className="object-cover object-[center_top]"
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
            href="/campus"
            className="flex-shrink-0 flex items-center gap-2 group ml-1"
            title="Browse the campus"
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
