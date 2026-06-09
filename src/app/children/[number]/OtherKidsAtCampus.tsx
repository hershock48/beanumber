/**
 * "Other kids at the campus" — invitation to explore, rendered on
 * every kid page below the sponsor CTA.
 *
 * The pool model rendered as a feature: every kid matters, your
 * relationship isn't locked to one shirt. Surfacing well-profiled
 * kids alongside the one you came for makes the campus feel
 * populated and growable, and gives sponsors a reason to come back.
 *
 * Selection criteria (in order of preference):
 *   1. Has a profile photo
 *   2. Has at least 2 structured fields filled (Loves, FamilyContext,
 *      ChildQuote, Notes, NameMeaning) — well-profiled kids first so
 *      the click-through actually rewards the visitor with content
 *   3. Not the current kid being viewed
 *   4. Status active, not departed, not reserved-for-auction
 *   5. Has at least 1 active or holder sponsorship (popular kids
 *      preferred — they're known and loved)
 *
 * Returns 4 kids in a 2x2 mobile / 1x4 desktop grid.
 */

import Image from 'next/image';
import Link from 'next/link';

interface KidCard {
  recordId: string;
  shirtNumber: number;
  firstName: string;
  displayName: string;
  gradeClass?: string;
  photoUrl?: string;
  loves?: string;
  completenessScore: number;
  hasSponsors: boolean;
}

interface AirtableChildRecord {
  id: string;
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    GradeClass?: string;
    ProfilePhoto?: Array<{ url: string; filename: string }>;
    Notes?: string;
    Loves?: string;
    ChildQuote?: string;
    FamilyContext?: string;
    NameMeaning?: string;
    Status?: string;
    ShirtNumber?: number;
    ReservedForAuction?: boolean;
    DepartedAt?: string;
    'Associated Sponsorships'?: string[];
  };
}

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

async function fetchAllKids(): Promise<AirtableChildRecord[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];
  const out: AirtableChildRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CHILDREN_TABLE)}?${params.toString()}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: 'no-store',
      });
      if (!res.ok) break;
      const data = await res.json();
      out.push(...((data.records || []) as AirtableChildRecord[]));
      offset = data.offset;
    } catch {
      break;
    }
  } while (offset);
  return out;
}

function isVisibleStatus(status?: string): boolean {
  if (!status) return true; // treat blank as visible
  const n = status.trim().toLowerCase();
  if (n === 'graduated' || n === 'archived' || n === 'inactive') return false;
  return true;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Score how "filled out" a profile is — drives preference. */
function profileCompleteness(r: AirtableChildRecord): number {
  const f = r.fields;
  let score = 0;
  if (f.Loves && f.Loves.trim().length > 0) score += 1;
  if (f.FamilyContext && f.FamilyContext.trim().length > 0) score += 1;
  if (f.ChildQuote && f.ChildQuote.trim().length > 0) score += 1;
  if (f.NameMeaning && f.NameMeaning.trim().length > 0) score += 1;
  if (f.Notes && f.Notes.trim().length > 50) score += 1;
  return score;
}

async function pickFeaturedKids(excludeRecordId: string, count: number = 4): Promise<KidCard[]> {
  const all = await fetchAllKids();

  const eligible: KidCard[] = all
    .filter(r => r.id !== excludeRecordId)
    .filter(r => !r.fields.ReservedForAuction)
    .filter(r => !r.fields.DepartedAt)
    .filter(r => isVisibleStatus(r.fields.Status))
    .filter(r => typeof r.fields.ShirtNumber === 'number')
    .filter(r => !!r.fields.ProfilePhoto?.[0]?.url)
    .map(r => {
      const completeness = profileCompleteness(r);
      const f = r.fields;
      return {
        recordId: r.id,
        shirtNumber: f.ShirtNumber as number,
        firstName: f.FirstName || f.DisplayName?.split(' ')[0] || 'Child',
        displayName: f.DisplayName || f.FirstName || 'Child',
        gradeClass: f.GradeClass,
        photoUrl: f.ProfilePhoto?.[0]?.url,
        loves: f.Loves,
        completenessScore: completeness,
        hasSponsors: (f['Associated Sponsorships']?.length || 0) > 0,
      } as KidCard;
    })
    // Need at least 2 filled-out fields — otherwise the click is a dead end.
    .filter(k => k.completenessScore >= 2);

  if (eligible.length === 0) return [];

  // Three buckets in preference order. Within each bucket, randomize so the
  // surfaced kids vary across page views.
  const wellProfiledWithSponsors = eligible.filter(k => k.completenessScore >= 3 && k.hasSponsors);
  const wellProfiledOrSponsored = eligible.filter(
    k => k.completenessScore >= 3 || k.hasSponsors
  ).filter(k => !wellProfiledWithSponsors.includes(k));
  const restEligible = eligible.filter(
    k => !wellProfiledWithSponsors.includes(k) && !wellProfiledOrSponsored.includes(k)
  );

  const ordered = [
    ...shuffle(wellProfiledWithSponsors),
    ...shuffle(wellProfiledOrSponsored),
    ...shuffle(restEligible),
  ];

  return ordered.slice(0, count);
}

export async function OtherKidsAtCampus({
  currentRecordId,
}: {
  currentRecordId: string;
}) {
  const kids = await pickFeaturedKids(currentRecordId, 4);
  if (kids.length === 0) return null;

  return (
    <section className="max-w-5xl mx-auto px-5 py-12 md:py-16">
      <div className="border-t border-[#e8e0d4] pt-10 md:pt-14">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3 text-center">
          Other kids at the campus
        </p>
        <h2
          className="text-2xl md:text-3xl text-[#0d0d0d] text-center mb-2 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Meet someone else.
        </h2>
        <p className="text-center text-sm text-[#666] mb-8 md:mb-10 max-w-md mx-auto">
          Your shirt put you in this campus. The relationships are real,
          and they aren&rsquo;t locked to one kid.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {kids.map(kid => (
            <Link
              key={kid.recordId}
              /* /meet/[childId] — numberless route. The shirt-number
                 framing only applies when someone enters via their
                 own number. In exploration, the kid IS the kid; no
                 shirt number prominently displayed, no reveal ritual
                 they didn't earn. See src/app/meet/[childId]/page.tsx. */
              href={`/meet/${kid.recordId}`}
              className="group block bg-white border border-[#e8e0d4] hover:border-[#D4A843] transition-colors"
            >
              <div className="aspect-[4/5] bg-[#f5f0e8] overflow-hidden">
                {kid.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={kid.photoUrl}
                    alt={kid.displayName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
              </div>
              <div className="p-3 md:p-4">
                <p
                  className="text-base md:text-lg text-[#0d0d0d] leading-tight mb-1"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  {kid.firstName}
                </p>
                {kid.gradeClass && (
                  <p className="text-xs text-[#888] mb-3">
                    {kid.gradeClass}
                  </p>
                )}
                <p className="text-xs font-bold uppercase tracking-wider text-[#0d0d0d] group-hover:text-[#D4A843] transition-colors">
                  Meet {kid.firstName} &rarr;
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
