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
        {/* Framed penpal zone — 2026-07-10. Kevin's ask: the penpal
            surface should visually stand out as its own zone on the
            kid page. A quiet cream fill + gold top-border ties it to
            the brand's letter accent (same border-l gold used on the
            sample bubble + the letter-arrival card) without shouting. */}
        <div className="border-t-4 border-[#D4A843] bg-[#FFFAF0] px-5 py-8 md:px-8 md:py-10">
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

          {/* Holder using their included letter: the sponsorship ask
              rides directly under the composer. Kevin's 2026-08-02
              audit caught that this state — the single most
              conversion-ready person on the site, signed in, at their
              kid's page, free letter in hand — saw NO sponsor option
              anywhere: this branch returned early and every ask lived
              in the frosted preview it never reached. The composer
              stays first (deliver the promised letter, don't gate it);
              the ask sits right below, quiet but unmissable. */}
          {isHolderFirstLetter && childRecordId && childId && childDisplayName ? (
            <div className="mt-10 border-t border-[#e8d9c0] pt-8 text-center">
              <p
                className="text-xl md:text-2xl text-[#0d0d0d] mb-3 leading-tight"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Make it monthly. You and {firstName} keep writing.
              </p>
              <p className="text-[15px] text-[#333] leading-relaxed mb-5 max-w-md mx-auto">
                {VALUE_PROP}{' '}
                <span className="font-bold text-[#0d0d0d]">$25/month.</span>{' '}
                Cancel anytime.
              </p>
              <PenpalBoxSponsorCta
                firstName={firstName}
                childRecordId={childRecordId}
                childId={childId}
                childDisplayName={childDisplayName}
                variant="holder"
              />
            </div>
          ) : null}
        </div>
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
    // Singular "them" — the roster has both boys and girls (Naume,
    // Asenath, Amarorwot are female). Matches ReassignReveal's
    // pronoun handling. No per-kid gender lookup here because this
    // heading renders for anon visitors who haven't claimed yet.
    //   (non-breaking space) glues "for real." so no line break
    // can ever orphan the word "real." on its own line — Kevin caught
    // exactly that widow on Naume's page (2026-07-16). text-balance
    // on the rendering <p> does the aesthetic work in modern
    // browsers (splits roughly "Sponsor Naume." / "Meet them for
    // real."); the nbsp is the guarantee everywhere else.
    heading = `Sponsor ${firstName}. Meet them for real.`;
  }

  // Anon-only href. Holder + signed_in_visitor use the client CTA
  // component below, which POSTs to create-sponsor-checkout.
  //
  // Anon CTA is SIGN-IN-FIRST (Kevin, 2026-07-16). The realistic anon
  // visitor on /[N] bought a shirt, read #N off the back, and typed it
  // in — probably their first visit. Until they sign in we can't tell
  // a monthly sponsor from a holder from a stranger, and sponsorship
  // itself is gated behind a session anyway (non-negotiable #4). So
  // the pitch leads to sign-in, and the holder-upgrade / sponsor view
  // takes over from there. /shirts is the secondary for genuinely
  // cold visitors — with honest copy: a NEW shirt carries its own
  // Number and its own kid, it does not carry {firstName}'s.
  //
  // The label says WRITE, not sponsor (Kevin, same day): the heading
  // and pitch above already make the $25/mo case, but the button is
  // the door for three different people — the monthly sponsor whose
  // view comes back, the shirt-holder whose included letter is
  // waiting, and the buyer who hasn't decided anything yet. 'Sign in
  // to sponsor' read as a payment commitment to the exact person the
  // shirt insert just promised a free letter. The letter is also the
  // stronger hook: it's what the physical insert told them to come
  // here and do.
  // 2026-07-18: 'Sign in to write' → 'Claim … to write'. Same
  // reasoning as the anon strip: 'sign in' is membership language
  // and the realistic reader has never signed up for anything —
  // claiming the Number IS their first act here.
  const anonCtaHref = `/signin?n=${shirtNumber}`;
  const anonCtaLabel = `Claim #${shirtNumber} to write ${firstName}`;

  // Holder who has already used their included letter cycle AND has
  // a real thread (their sent letter + kid's reply): show the real
  // exchange ABOVE a clean upgrade card, so they don't lose the
  // artifact of what they wrote and what came back. Their next-step
  // ask is to keep going at $25/mo.
  //
  // When this is true, we suppress the frosted fake-sample thread
  // below the upgrade card — it would sit BELOW the real thread and
  // read as a second confusing sample. The overlay's heading + CTA
  // are enough on their own once they've seen the real thing.
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
          the anchor for the real thread + composer.
          The showRealHolderThread branch renders SectionHeader
          just above (with the real thread), so the header exists
          in that case too — this comment applies to the anon /
          signed-in-visitor / no-thread-yet holder cases. */}
      <div className="relative border border-[#e8e0d4] bg-white overflow-hidden">
        {showRealHolderThread ? (
          /* Clean upgrade card — no fake-sample thread. The viewer
             just scrolled past their real letter and their kid's
             real reply; they don't need a blurred sample below it.
             Kevin's audit 2026-07-10: 'no duplicate fake thread
             once they've seen the real one.' */
          <div className="p-8 md:p-10 text-center bg-[#FFF8F0]">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
              One letter, one reply &middot; done
            </p>
            <p
              className="text-2xl md:text-[26px] text-[#0d0d0d] mb-4 leading-tight text-balance"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {heading}
            </p>
            <p className="text-[15px] text-[#333] leading-relaxed mb-6 max-w-md mx-auto">
              You get monthly photos, report cards, and campus
              updates &mdash; and you and {firstName} keep writing.{' '}
              <span className="font-bold text-[#0d0d0d]">$25/month.</span>{' '}
              Cancel anytime.
            </p>
            <div className="max-w-md mx-auto">
              {childRecordId && childId && childDisplayName ? (
                <PenpalBoxSponsorCta
                  firstName={firstName}
                  childRecordId={childRecordId}
                  childId={childId}
                  childDisplayName={childDisplayName}
                  variant="holder"
                />
              ) : (
                <Link
                  href="/shirts"
                  className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
                >
                  Sponsor {firstName} &mdash; $25/month
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
        {/* Frosted preview — a fake sample thread. Reads like the
            real surface would look.

            LAYERING FIX 2026-07-16. This used to be the in-flow
            element with the CTA absolutely positioned on top
            (absolute inset-0 + flex-center). The CTA content is
            TALLER than the sample thread on most viewports, so it
            overflowed the card — the heading spilled above the top
            border, buttons landed on the sample quotes through a
            white/40 frost, and the whole section read as broken
            (Kevin's screenshot, kid #230). Layers are now inverted:
            the samples are the absolutely-positioned BACKDROP
            (cropped by the card's overflow-hidden) and the CTA is
            in normal flow, so the card is always exactly as tall as
            its content and nothing can ever collide. */}
        <div
          className="absolute inset-0"
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

        {/* CTA layer. In normal flow (sizes the card); the frost is
            stronger than the old white/40 so the sample letters ghost
            through as texture instead of fighting the copy for
            legibility. */}
        <div className="relative bg-white/85 backdrop-blur-[2px]">
          <div className="max-w-md w-full mx-auto text-center px-6 py-10 md:py-12">
            <p
              className="text-2xl md:text-[26px] text-[#0d0d0d] mb-3 leading-tight text-balance"
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
              /* Anon variant, rebuilt 2026-07-16 per Kevin. The old
                 secondary CTA said "Sponsor {firstName} — $25/month →
                 we'll ship you a shirt with {firstName}'s number on
                 the back," which is backwards: a new shirt carries
                 whatever Number is next in the batch, not this kid's
                 — this kid's Number is on the shirt the visitor is
                 probably already holding. The realistic anon visitor
                 bought a shirt, typed the number off the back, and
                 landed here for the first time. So:
                   - Primary: sign in to sponsor. Sign-in is the gate
                     for everyone — it tells us whether they're a
                     monthly sponsor (view comes back), a holder
                     (one-tap upgrade takes over), or new (claim).
                   - Secondary: /shirts for genuinely cold visitors,
                     with honest copy about what a new shirt is. */
              <div className="flex flex-col gap-3 items-center">
                <Link
                  href={anonCtaHref}
                  className="inline-block w-full max-w-xs text-center bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
                >
                  {anonCtaLabel}
                </Link>
                <p className="text-xs text-[#888] leading-relaxed max-w-xs text-center">
                  Got the shirt with #{shirtNumber}? Signing in makes
                  this page yours &mdash; and the letter included with
                  your shirt is ready to send. Already sponsoring
                  monthly? Your view comes right back, nothing new
                  gets charged.
                </p>
                <p className="text-xs uppercase tracking-[0.15em] text-[#888] font-bold mt-2">
                  no shirt yet?
                </p>
                <Link
                  href="/shirts"
                  className="inline-block w-full max-w-xs text-center bg-white border-2 border-[#0d0d0d] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#0d0d0d] hover:text-white transition-colors"
                >
                  Start with a shirt
                </Link>
                <p className="text-xs text-[#888] leading-relaxed max-w-xs text-center mt-1">
                  Every shirt carries its own Number, and every Number
                  is a real kid to meet.
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
          </>
        )}
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
