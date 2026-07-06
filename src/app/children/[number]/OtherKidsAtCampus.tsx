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
import { or, eq } from 'drizzle-orm';
import { listAllChildren } from '@/lib/db/queries';
import { db } from '@/lib/db/client';
import { sponsorships as sponsorshipsTable } from '@/lib/db/schema';
import type { Child } from '@/lib/db/schema';
import {
  gradeLabelForSponsor,
  isGradeCode,
  type GradeCode,
} from '@/lib/grades';

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

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Score how "filled out" a profile is — drives preference. */
function profileCompleteness(c: Child): number {
  let score = 0;
  if (c.loves && c.loves.trim().length > 0) score += 1;
  if (c.familyContext && c.familyContext.trim().length > 0) score += 1;
  if (c.childQuote && c.childQuote.trim().length > 0) score += 1;
  if (c.nameMeaning && c.nameMeaning.trim().length > 0) score += 1;
  if (c.notes && c.notes.trim().length > 50) score += 1;
  return score;
}

/**
 * Build a Set of child UUIDs that currently have at least one Active
 * or Holder sponsorship. Used to bucket "popular kids" higher in the
 * selection order.
 */
async function fetchKidsWithSponsors(childIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (childIds.length === 0) return out;
  const candidateSet = new Set(childIds);
  const rows = await db
    .select({ childId: sponsorshipsTable.childId })
    .from(sponsorshipsTable)
    .where(
      or(
        eq(sponsorshipsTable.status, 'Active'),
        eq(sponsorshipsTable.status, 'Holder')
      )
    );
  for (const r of rows) {
    if (r.childId && candidateSet.has(r.childId)) out.add(r.childId);
  }
  return out;
}

async function pickFeaturedKids(
  excludeRecordId: string,
  count: number = 4
): Promise<KidCard[]> {
  const all = await listAllChildren({ onlyWithPhoto: true });

  const filtered = all
    .filter(c => c.id !== excludeRecordId)
    .filter(c => !c.reservedForAuction)
    .filter(c => !c.departedAt)
    .filter(c => typeof c.shirtNumber === 'number');

  const sponsoredSet = await fetchKidsWithSponsors(filtered.map(c => c.id));

  const eligible: KidCard[] = filtered
    .map(c => ({
      recordId: c.id,
      shirtNumber: c.shirtNumber as number,
      firstName: c.firstName || c.displayName?.split(' ')[0] || 'Child',
      displayName: c.displayName || c.firstName || 'Child',
      gradeClass: c.gradeClass ?? undefined,
      photoUrl: c.profilePhotoUrl ?? undefined,
      loves: c.loves ?? undefined,
      completenessScore: profileCompleteness(c),
      hasSponsors: sponsoredSet.has(c.id),
    }))
    // Need at least 2 filled-out fields — otherwise the click is a dead end.
    .filter(k => k.completenessScore >= 2);

  if (eligible.length === 0) return [];

  // Three buckets in preference order. Within each bucket, randomize so the
  // surfaced kids vary across page views.
  const wellProfiledWithSponsors = eligible.filter(
    k => k.completenessScore >= 3 && k.hasSponsors
  );
  const wellProfiledOrSponsored = eligible
    .filter(k => k.completenessScore >= 3 || k.hasSponsors)
    .filter(k => !wellProfiledWithSponsors.includes(k));
  const restEligible = eligible.filter(
    k =>
      !wellProfiledWithSponsors.includes(k) &&
      !wellProfiledOrSponsored.includes(k)
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
  currentShirtNumber,
  currentFirstName,
}: {
  currentRecordId: string;
  /** The shirt number the viewer is currently on. Passed through to
      /meet/[id] as ?from=N so the viewer can hop back to their own
      kid's page after exploring. Without this they'd be stranded on
      the explored kid's page with only "Back to home" as an exit. */
  currentShirtNumber?: number;
  /** First name of the kid the viewer is currently on. Surfaced in
      the back link as "Back to Marvin" rather than "Back to #38". */
  currentFirstName?: string;
}) {
  const kids = await pickFeaturedKids(currentRecordId, 4);
  if (kids.length === 0) return null;

  // Build the back-link query params once so each card link has the
  // same context appended.
  const backQuery = currentShirtNumber
    ? `?from=${currentShirtNumber}${
        currentFirstName
          ? `&fromname=${encodeURIComponent(currentFirstName)}`
          : ''
      }`
    : '';

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
          Your Shirt put you in this campus. The relationships are real,
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
                 they didn't earn. ?from=N&fromname=Marvin lets the
                 explorer return to their own kid's page. See
                 src/app/meet/[childId]/page.tsx. */
              href={`/meet/${kid.recordId}${backQuery}`}
              className="group block bg-white border border-[#e8e0d4] hover:border-[#D4A843] transition-colors"
            >
              <div className="aspect-[4/5] bg-[#f5f0e8] overflow-hidden relative">
                {kid.photoUrl && (
                  <Image
                    src={kid.photoUrl}
                    alt={kid.displayName}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
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
                    {isGradeCode(kid.gradeClass)
                      ? gradeLabelForSponsor(kid.gradeClass as GradeCode)
                      : kid.gradeClass /* legacy fallback */}
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
