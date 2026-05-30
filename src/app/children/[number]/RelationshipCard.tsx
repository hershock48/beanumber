/**
 * Relationship card — sits between the kid's bio/CTA grid and the
 * public campus newsfeed on /[number]. Frames the read.
 *
 * Two variants:
 *
 *  ── Non-sponsor ──
 *     The newsletter below is the campus's life. The campus's life is
 *     what their shirt purchase started. Convert here with the same
 *     $25/mo ask the bio CTA uses, but framed as relationship-with-
 *     this-kid, not transactional sponsorship.
 *
 *  ── Verified sponsor ──
 *     Quiet acknowledgment. "You're already in this with {firstName}."
 *     No CTA. The acknowledgment IS the surface — they earned the
 *     read; the newsletter is what their $25/mo is funding.
 *
 * Departed kids never see this card (the page handles that upstream
 * by skipping the newsfeed entirely).
 */

import { SponsorButton } from './SponsorButton';

interface RelationshipCardProps {
  firstName: string;
  shirtNumber: number;
  viewerIsSponsor: boolean;
  childRecordId: string | null;
  childId: string;
  displayName: string;
  existingCustomerId?: string;
  buyerEmail?: string;
  viewerLooksLikeBuyer: boolean;
  sponsorCode?: string;
}

export function RelationshipCard({
  firstName,
  shirtNumber,
  viewerIsSponsor,
  childRecordId,
  childId,
  displayName,
  existingCustomerId,
  buyerEmail,
  viewerLooksLikeBuyer,
}: RelationshipCardProps) {
  if (viewerIsSponsor) {
    return (
      <div className="relative bg-white border-2 border-[#D4A843]/30 px-6 py-7 md:px-10 md:py-9 mb-8 md:mb-10">
        <div className="absolute -top-3 left-6 md:left-8 bg-[#FFF8F0] px-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#D4A843]">
            ★ Sponsor
          </span>
        </div>
        <p
          className="text-2xl md:text-3xl text-[#0d0d0d] leading-snug mb-3"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          You&rsquo;re already in this with {firstName}.
        </p>
        <p className="text-[#555] leading-relaxed text-base md:text-[17px] max-w-2xl">
          What you&rsquo;re about to read &mdash; the campus, the
          classrooms, the kids around {firstName} &mdash; runs because
          you and a handful of others keep showing up every month.
          Thank you for being one of {firstName}&rsquo;s people.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#FFF8F0] border-2 border-[#D4A843] px-6 py-7 md:px-10 md:py-9 mb-8 md:mb-10 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
        Before you read on
      </p>
      <p
        className="text-2xl md:text-[32px] text-[#0d0d0d] leading-tight mb-4"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
      >
        {firstName} is the kid on the back of #{shirtNumber}.
      </p>
      <p className="text-[#444] leading-relaxed text-base md:text-[17px] mb-5 max-w-2xl">
        The newsletter below tells you what&rsquo;s happening at the
        campus where {firstName} learns, eats, and sees a doctor. Be
        the one who keeps showing up for {firstName} every month.
        Same shirt number, same kid, $25 a month.
      </p>

      <div className="flex items-baseline gap-2 mb-5">
        <span
          className="text-4xl md:text-5xl text-[#D4A843] leading-none"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
        >
          $25
        </span>
        <span className="text-[#888] text-sm md:text-base">
          /month &middot; cancel anytime
        </span>
      </div>

      {childRecordId && (
        <SponsorButton
          childRecordId={childRecordId}
          childId={childId}
          childDisplayName={displayName}
          firstName={firstName}
          shirtAssigned={viewerLooksLikeBuyer}
          existingCustomerId={existingCustomerId}
          buyerEmail={buyerEmail}
        />
      )}

      <p className="text-xs text-[#999] mt-3">
        Your monthly $25 goes to the pool that funds the whole campus
        &mdash; school, meals, the on-site clinic, teachers&rsquo;
        salaries. {firstName} is the face you stay close to.
      </p>
    </div>
  );
}
