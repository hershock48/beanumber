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

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { NoteThreadEntry } from '@/lib/db/queries';
import { NotesThread } from './NotesThread';
import { SendNoteComposer } from './SendNoteComposer';
import { PenpalBoxSponsorCta } from './PenpalBoxSponsorCta';

export interface PenpalBoxProps {
  firstName: string;
  shirtNumber: number;
  /** Sponsor's real thread — omitted for non-sponsors. */
  thread?: NoteThreadEntry[];
  /** Composer props — required for sponsors, omitted for others. */
  childRecordId?: string;
  childIdLegacy?: string | null;
  /**
   * Legacy child_id (e.g. "HSP/BAN-017"). Required for the holder
   * and signed-in-visitor conversion CTA — /api/create-sponsor-
   * checkout expects both the record id and this legacy string id
   * in the POST body.
   */
  childId?: string | null;
  /**
   * Display name used in the checkout session's line item description.
   */
  childDisplayName?: string;
  /**
   * Which surface the viewer sees. Determines whether we render the
   * real thread+composer, the holder-oriented conversion preview, or
   * the anon-oriented sign-in preview.
   *
   * 'signed_in_visitor' is a fourth state added 2026-07-08 (audit
   * fix): the visitor is signed in as a sponsor of some OTHER kid,
   * viewing this kid's page. Kevin's audit caught that folding this
   * case into 'holder' misled them into "sponsor to start writing"
   * copy with a broken CTA. The signed-in-visitor copy makes the
   * add-on nature explicit ("Sponsor {firstName} too — $25/month")
   * and the same checkout flow runs.
   */
  viewerState: 'sponsor' | 'holder' | 'signed_in_visitor' | 'anon';
  /**
   * 2026-07-10 "one letter included with the shirt" mechanic.
   * When true AND viewerState === 'holder', we render the real
   * composer (not the frosted upgrade preview) so the shirt-holder
   * can send their included letter without subscribing first. The
   * server enforces the same gate via sponsorships.included_letter_sent_at.
   * Ignored when viewerState !== 'holder'.
   */
  holderCycleAvailable?: boolean;
  /**
   * Renders BELOW the thread + composer for active monthly sponsors.
   * Used to inline the "personal photo updates from the campus" block
   * (letters, photos, report cards) as part of the same Penpal
   * surface — Kevin's 2026-07-08 restructure: don't split penpal
   * from the update stream; sponsors get one unified inbox.
   * Silently omitted when the viewer isn't a sponsor.
   */
  sponsorPortal?: ReactNode;
}

// Per-state copy — the anon block leads with the school-funding
// impact (Kevin's 2026-07-08 round-3 note: some visitors are drawn
// by the sponsorship story, others by the penpal relationship;
// blend both into one block instead of picking a lane). Holder and
// signed_in_visitor keep the tighter penpal-first framing because
// those audiences already know the value of the shirt/relationship.
const VALUE_PROP =
  'You get a penpal, monthly photos, report cards, and campus updates.';

export function PenpalBox({
  firstName,
  shirtNumber,
  thread,
  childRecordId,
  childIdLegacy,
  childId,
  childDisplayName,
  viewerState,
  holderCycleAvailable,
  sponsorPortal,
}: PenpalBoxProps) {
  // Sponsor: real experience. Thread + composer + inline campus updates.
  //
  // Also: shirt-holders with their included letter still available
  // (2026-07-10 mechanic — see src/lib/penpal-cycle.ts) get the real
  // composer path. The composer itself renders a "First letter's on
  // us" banner when passed `firstLetterIncluded` so the sponsor knows
  // they're using their included cycle. Once they use it, the next
  // page load flips them to viewerState 'holder' cycle_used and
  // routes to the frosted upgrade preview below.
  const isHolderFirstLetter =
    viewerState === 'holder' && !!holderCycleAvailable;
  const showComposerPath =
    (viewerState === 'sponsor' || isHolderFirstLetter) && childRecordId;

  if (showComposerPath) {
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
            firstLetterIncluded={isHolderFirstLetter}
          />
        </div>
        {/* Personal photo updates from the campus land here — kept
            visually attached to the penpal thread so the sponsor's
            single Naume "inbox" is one surface, not two.
            Holder-first-letter users don't get sponsorPortal — that
            requires monthly. */}
        {sponsorPortal && viewerState === 'sponsor' ? (
          <div className="mt-10">{sponsorPortal}</div>
        ) : null}
      </div>
    );
  }

  // Holder / signed-in visitor / anon: blurred preview + CTA.
  //
  // The three states have distinct copy but only two CTA behaviors:
  //   - anon                → link to /signin?n=N (magic-link flow)
  //   - holder + signed_in  → POST to /api/create-sponsor-checkout
  //     _visitor              via the PenpalBoxSponsorCta client
  //                           component
  //
  // Heading is chosen to NOT duplicate the outer SectionHeader
  // ("Write {firstName}. {firstName} writes back."), which is the
  // promise; the overlay heading is the CTA-adjacent reason to click.
  let heading: string;
  if (viewerState === 'holder') {
    // Holders reaching this branch have USED their included letter
    // cycle — the "not yet" path renders the composer above. Copy
    // matches the state: they've done one round-trip, now the ask
    // is to keep going.
    heading = `Keep writing to ${firstName}.`;
  } else if (viewerState === 'signed_in_visitor') {
    heading = `Add ${firstName} to your campus.`;
  } else {
    // Anon: lead with the sponsorship story — the school-day framing
    // is what makes a cold visitor care. The penpal is the surprise
    // upside they discover in the body copy below.
    heading = `Sponsor ${firstName}. Meet him for real.`;
  }

  // Anon-only href. Holder + signed_in_visitor use the client CTA
  // component below, which POSTs to create-sponsor-checkout.
  const anonCtaHref = `/signin?n=${shirtNumber}`;
  const anonCtaLabel = `Sign in to write ${firstName}`;

  // Holder who has already used their included letter cycle AND has
  // a real thread (their sent letter + kid's reply): show the real
  // exchange ABOVE the frosted upgrade card, so they don't lose the
  // artifact of what they wrote and what came back. Their next-step
  // ask is to keep going at $25/mo.
  const showRealHolderThread =
    viewerState === 'holder' && !!thread && thread.length > 0;

  return (
    <div className="mt-12 md:mt-16">
      {showRealHolderThread ? (
        <>
          <SectionHeader firstName={firstName} />
          <div className="mt-6 mb-8">
            <NotesThread firstName={firstName} thread={thread} />
          </div>
        </>
      ) : null}
      {/* SectionHeader intentionally omitted for holder / anon /
          signed_in_visitor variants (2026-07-08 fix).
          The frosted overlay heading below already IS the primary
          message for these audiences ("Sponsor Marvin. Meet him
          for real." etc.), and the anon two-CTA overlay content
          was tall enough to overflow the frosted card and step
          on the SectionHeader h2 above it — Kevin's screenshot
          showed "Write Marvin. Marvin writes back." rendering on
          top of "Sponsor Marvin. Meet him for real."
          Sponsor branch above still renders SectionHeader as
          the anchor for the real thread + composer. */}
      <div className="relative border border-[#e8e0d4] bg-white">
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
            {viewerState === 'anon' ? (
              /* Two-sided anon pitch — school-day funder on top so
                 sponsorship-motivated visitors see the point of the
                 $25 first; the penpal upside sits underneath as
                 what-you-get-in-return. Kevin's 2026-07-08 round-3
                 request: some visitors are pulled by "I sent him
                 to school," others by "I have a penpal in Uganda,"
                 and we shouldn't force them to pick a story. */
              <div className="mb-6">
                <p className="text-[16px] md:text-[17px] text-[#0d0d0d] leading-snug mb-3 font-semibold">
                  <span className="font-bold text-[#0d0d0d]">$25/month</span>{' '}
                  covers {firstName}&rsquo;s school day.
                </p>
                <p className="text-[14px] md:text-[15px] text-[#555] leading-relaxed">
                  You get a real penpal on the other end &mdash; letters back
                  and forth, monthly photos, report cards, and updates
                  from the campus. Cancel anytime.
                </p>
              </div>
            ) : (
              <p className="text-[15px] text-[#333] leading-relaxed mb-6">
                {VALUE_PROP}{' '}
                <span className="font-bold text-[#0d0d0d]">$25/month.</span>{' '}
                Cancel anytime.
              </p>
            )}
            {viewerState === 'anon' ? (
              /* Anon variant: TWO CTAs stacked. Anon covers both
                 populations:
                   - Existing sponsors on a new device / signed out
                     → primary "Sign in to write" (magic link)
                   - Cold visitors who don't yet sponsor
                     → secondary "Sponsor {firstName} — $25/month"
                     which routes through /shirts (shirt-first per
                     non-negotiable #4).
                 Split visually so the choice is obvious — the same
                 button pretending to be both roles was Kevin's
                 complaint in the previous round. */
              <div className="flex flex-col gap-3 items-center">
                <Link
                  href={anonCtaHref}
                  className="inline-block w-full max-w-xs text-center bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
                >
                  {anonCtaLabel}
                </Link>
                <p className="text-xs uppercase tracking-[0.15em] text-[#888] font-bold">
                  or, new here?
                </p>
                <Link
                  href="/shirts"
                  className="inline-block w-full max-w-xs text-center bg-white border-2 border-[#0d0d0d] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#0d0d0d] hover:text-white transition-colors"
                >
                  Sponsor {firstName} &mdash; $25/month
                </Link>
                <p className="text-xs text-[#888] leading-relaxed max-w-xs text-center mt-1">
                  We&rsquo;ll ship you a shirt with {firstName}&rsquo;s number
                  on the back. Then this whole page is yours.
                </p>
              </div>
            ) : childRecordId && childId && childDisplayName ? (
              <PenpalBoxSponsorCta
                firstName={firstName}
                childRecordId={childRecordId}
                childId={childId}
                childDisplayName={childDisplayName}
                variant={viewerState === 'holder' ? 'holder' : 'signed_in_visitor'}
              />
            ) : (
              /* Missing checkout props (shouldn't happen given page.tsx
                 always passes them for signed-in viewers). Fall back
                 to /shirts as the shirt-first entry point. */
              <Link
                href="/shirts"
                className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
              >
                Get a shirt to sponsor {firstName}
              </Link>
            )}
            <p className="text-xs text-[#888] mt-4 leading-relaxed">
              The campus team translates in both directions.
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
