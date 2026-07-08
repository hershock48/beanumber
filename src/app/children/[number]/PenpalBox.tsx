/**
 * PenpalBox — the correspondence surface on /children/[N], placed
 * directly under the child's bio/info section.
 *
 * Three viewer states:
 *   - Sponsor:  real thread + composer (existing NotesThread +
 *               SendNoteComposer, imported and rendered).
 *   - Holder:   frosted preview + $25/mo conversion CTA. They
 *               already own the shirt, so the ask is "unlock the
 *               penpal thread by going monthly."
 *   - Anon:     same frosted preview + sign-in CTA. They haven't
 *               claimed the number yet, so the ask is "sign in and
 *               either the number is yours or unlock the penpal
 *               relationship."
 *
 * The frosted preview is a static fake thread bubble (one sponsor
 * message + one kid reply) with a backdrop-filter blur + gold overlay
 * pill saying "Unlock penpal + photos + report cards." Aspirational,
 * not gated-with-nothing-visible — the holder/anon should see what
 * they'd get.
 *
 * Value prop line, used across the site verbatim, per Kevin (2026-07-08):
 *   "You get a penpal, monthly photos, report cards, and campus updates.
 *   $25/month."
 *
 * Server component — the sub-composer is a client component; NotesThread
 * is server. Sponsor branch renders both directly.
 */

import Link from 'next/link';
import type { NoteThreadEntry } from '@/lib/db/queries';
import { NotesThread } from './NotesThread';
import { SendNoteComposer } from './SendNoteComposer';

export interface PenpalBoxProps {
  firstName: string;
  shirtNumber: number;
  /** Sponsor's real thread — omitted for non-sponsors. */
  thread?: NoteThreadEntry[];
  /** Composer props — required for sponsors, omitted for others. */
  childRecordId?: string;
  childIdLegacy?: string | null;
  /**
   * Which surface the viewer sees. Determines whether we render the
   * real thread+composer, the holder-oriented conversion preview, or
   * the anon-oriented sign-in preview.
   */
  viewerState: 'sponsor' | 'holder' | 'anon';
}

const VALUE_PROP =
  'You get a penpal, monthly photos, report cards, and campus updates.';

export function PenpalBox({
  firstName,
  shirtNumber,
  thread,
  childRecordId,
  childIdLegacy,
  viewerState,
}: PenpalBoxProps) {
  // Sponsor: real experience. Thread (if any) + composer.
  if (viewerState === 'sponsor' && childRecordId) {
    return (
      <div className="mt-12 md:mt-16">
        <SectionHeader firstName={firstName} />
        {thread && thread.length > 0 ? (
          <div className="mt-6">
            <NotesThread firstName={firstName} thread={thread} />
          </div>
        ) : null}
        <div className="mt-6">
          <SendNoteComposer
            childRecordId={childRecordId}
            childIdLegacy={childIdLegacy ?? null}
            firstName={firstName}
          />
        </div>
      </div>
    );
  }

  // Holder or anon: blurred preview + CTA.
  const isHolder = viewerState === 'holder';
  const ctaHref = isHolder
    ? `/children/${shirtNumber}?intent=sponsor`
    : `/children/${shirtNumber}?intent=sign-in`;
  const ctaLabel = isHolder
    ? `Sponsor ${firstName} — $25/month`
    : `Sign in to write ${firstName}`;
  const heading = isHolder
    ? `Write ${firstName}. ${firstName} writes back.`
    : `You could be ${firstName}'s penpal.`;

  return (
    <div className="mt-12 md:mt-16">
      <SectionHeader firstName={firstName} />
      <div className="relative mt-6 border border-[#e8e0d4] bg-white">
        {/* Frosted preview — a fake sample thread. Reads like the
            real surface would look. */}
        <div
          className="relative overflow-hidden"
          style={{ filter: 'blur(3.5px) saturate(1.1)' }}
          aria-hidden="true"
        >
          <div className="p-6 md:p-8 space-y-4">
            <div className="text-xs uppercase tracking-wider text-[#999] font-bold">
              Sample &middot; not a real letter
            </div>
            <div className="bg-[#FFF8F0] border-l-4 border-[#D4A843] p-5">
              <p
                className="text-[15px] text-[#333] leading-relaxed italic"
                style={{ fontFamily: 'var(--font-lora), serif' }}
              >
                &ldquo;Dear {firstName}, I saw your photo from the campus
                and I wanted you to know I&rsquo;m thinking about you.
                What&rsquo;s your favorite subject? Mine was math. I&rsquo;m
                praying you have a great week.&rdquo;
              </p>
              <p className="text-xs uppercase tracking-wider text-[#999] font-bold mt-3">
                Your penpal note &middot; sample
              </p>
            </div>
            <div className="bg-white border border-[#e8e0d4] p-5 ml-6">
              <p
                className="text-[15px] text-[#333] leading-relaxed italic"
                style={{ fontFamily: 'var(--font-lora), serif' }}
              >
                &ldquo;Hello! My favorite subject is English because I
                like reading stories. My teacher gave me a book about
                animals. I run fast on the football field. Thank you
                for being my penpal.&rdquo;
              </p>
              <p className="text-xs uppercase tracking-wider text-[#999] font-bold mt-3">
                {firstName}&rsquo;s reply &middot; sample
              </p>
            </div>
          </div>
        </div>

        {/* Overlay pill + CTA. Sits on top of the blur, non-blurred. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[1px]">
          <div className="max-w-md w-full mx-auto text-center px-6 py-8">
            <p
              className="text-2xl md:text-[26px] text-[#0d0d0d] mb-3 leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {heading}
            </p>
            <p className="text-[15px] text-[#333] leading-relaxed mb-6">
              {VALUE_PROP}{' '}
              <span className="font-bold text-[#0d0d0d]">$25/month.</span>{' '}
              Cancel anytime.
            </p>
            <Link
              href={ctaHref}
              className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
            >
              {ctaLabel}
            </Link>
            <p className="text-xs text-[#888] mt-4 leading-relaxed">
              The campus team translates in both directions. Photos land
              a few times a year.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ firstName }: { firstName: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
        Penpal
      </p>
      <h2
        className="text-2xl md:text-3xl text-[#0d0d0d]"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
      >
        Write {firstName}. {firstName} writes back.
      </h2>
    </div>
  );
}
