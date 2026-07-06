/**
 * AwardsTimeline — every Student of the Month a kid has won,
 * newest first, rendered on the sponsor-gated view of the kid page.
 *
 * This is the retention accumulator. The single current-month badge
 * at the top of the page tells sponsors "here's what's happening
 * now." This section says "look at the arc." A kid who was picked
 * three times over two years reads as a real, growing person to
 * their sponsor — the specific opposite of a beneficiary in a
 * spreadsheet.
 *
 * Server component. Zero client JS. Gated by the parent (only
 * rendered when viewer_is_sponsor || viewer_is_holder).
 *
 * Silent when the kid has no archived awards. That's the right
 * default: an empty "Awards from the campus" section is louder
 * than helpful, and the section only becomes meaningful the first
 * time Simon nominates and Kevin approves.
 */

import {
  gradeLabelForSponsor,
  isGradeCode,
  type GradeCode,
} from '@/lib/grades';
import type { SotmHistoryEntry } from '@/lib/db/queries';

export function AwardsTimeline({
  firstName,
  awards,
}: {
  firstName: string;
  awards: SotmHistoryEntry[];
}) {
  if (awards.length === 0) return null;

  return (
    <section className="mb-10 md:mb-14 max-w-2xl mx-auto">
      <div className="mb-6 md:mb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
          Awards from the campus
        </p>
        <h2
          className="text-2xl md:text-3xl text-[#0d0d0d] leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {awards.length === 1
            ? `${firstName} has been named Student of the Month.`
            : `${firstName} has been named Student of the Month ${awards.length} times.`}
        </h2>
      </div>
      <ol className="space-y-4">
        {awards.map(award => {
          const gradeLabel =
            isGradeCode(award.gradeCode)
              ? gradeLabelForSponsor(award.gradeCode as GradeCode)
              : '';
          return (
            <li
              key={award.id}
              className="bg-white border border-[#e8e0d4] p-5 md:p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="inline-block text-lg text-[#D4A843]"
                  aria-hidden="true"
                >
                  ★
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843]">
                    {award.month}
                    {gradeLabel && (
                      <span className="text-[#888] font-normal normal-case tracking-normal ml-2">
                        &middot; {gradeLabel}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <p
                className="text-base text-[#333] leading-relaxed italic"
                style={{ fontFamily: 'var(--font-lora), serif' }}
              >
                &ldquo;{award.reason}&rdquo;
              </p>
              <p className="text-xs text-[#888] mt-2 not-italic">
                &mdash; From the campus
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
