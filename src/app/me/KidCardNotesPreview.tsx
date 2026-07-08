/**
 * KidCardNotesPreview — compact block on the /me KidCard summarizing
 * the sponsor's correspondence with this specific kid.
 *
 * Leads with whichever event is newest:
 *   - Kid replied to a note                → "[Kid] wrote back."
 *   - Sponsor's most recent note delivered → "Delivered [date]."
 *   - Sponsor's most recent note translated→ "On its way." (with date)
 *   - Sponsor's most recent note pending   → "Waiting to leave the campus."
 *
 * Snippet of the body (~90 chars) under the status line so the
 * sponsor sees what the last thing said was without opening the kid
 * page. "See all N notes" affordance at the bottom when there's
 * more than one entry in the thread.
 *
 * Silent when the sponsor has never written to this kid — the whole
 * component returns null.
 *
 * Server component, zero client JS. Placed inside the KidCard's
 * bottom block after the "Latest [update]" digest and before the
 * "Open page →" affordance.
 */

import type { KidCardNotePreview } from '@/lib/db/queries';
import { KidCardNoteReplyBadge } from './KidCardNoteReplyBadge';

const MAX_SNIPPET = 90;

function truncate(text: string, cap: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= cap) return trimmed;
  return `${trimmed.slice(0, cap - 1).trimEnd()}…`;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    // Clamp to zero so a slightly-future timestamp (server clock skew,
    // or a translation stamped microseconds ago that rounds forward)
    // reads as "today" rather than "-1 days ago".
    const days = Math.max(
      0,
      Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    );
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function statusLine(preview: KidCardNotePreview, firstName: string): string {
  const when = formatShortDate(preview.latestDate);
  if (preview.latestKind === 'reply') {
    return `${firstName} wrote back ${when}.`;
  }
  switch (preview.latestStatus) {
    case 'delivered':
      return `Your note reached the campus ${when}.`;
    case 'translated':
      return `On its way — translated ${when}.`;
    case 'pending':
      return `Waiting to leave the campus (sent ${when}).`;
    default:
      return `You wrote ${when}.`;
  }
}

export function KidCardNotesPreview({
  preview,
  firstName,
  kidHref,
  childIdLegacy,
}: {
  preview: KidCardNotePreview | null;
  firstName: string;
  kidHref: string | null;
  /**
   * The kid's legacy id ("HSP/BAN-017"). Used by the client-side
   * reply-freshness badge to look up whether the sponsor has visited
   * this kid's page since the reply arrived. Null when the kid doesn't
   * have one yet (rare, pre-migration).
   */
  childIdLegacy: string | null;
}) {
  if (!preview) return null;

  const total = preview.outboundCount + preview.replyCount;
  const showSeeAll = kidHref && total > 1;
  const isReply = preview.latestKind === 'reply';
  // When Simon uploaded a scan without a typed translation (the kid
  // wrote in English), latestBody is empty. Fall back to a friendly
  // line so the italic quote block never renders empty quotes.
  const rawBody = preview.latestBody.trim();
  const fallback =
    isReply && preview.latestImageUrl
      ? `${firstName} wrote you a letter. Open it to read.`
      : '';
  const snippet = truncate(rawBody.length > 0 ? rawBody : fallback, MAX_SNIPPET);

  return (
    <div className="mt-3 pt-3 border-t border-[#e8e0d4]">
      {/* Kicker: server-rendered as a neutral "Reply from [Kid]" — the
          "NEW" pill next to it is client-only and only shows when the
          reply arrived after this viewer's last visit to the kid page.
          That way sponsors who already read the reply on /children/[N]
          come back to /me and see the card without a stale "new" claim.
          Outbound uses the same tracking-color as the existing "Latest"
          kicker so it reads as ambient status, not an alert. */}
      <p
        className={
          isReply
            ? 'text-[10px] font-bold uppercase tracking-[0.2em] text-[#c0392b] mb-1 flex items-center'
            : 'text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1'
        }
      >
        {isReply ? (
          <>
            <span>Reply from {firstName}</span>
            <KidCardNoteReplyBadge
              childIdLegacy={childIdLegacy}
              replyArrivedAt={preview.latestDate}
            />
          </>
        ) : (
          'Your penpal'
        )}
      </p>
      <p className="text-xs text-[#0d0d0d] font-semibold leading-snug mb-1">
        {statusLine(preview, firstName)}
      </p>
      {/* Scanned handwritten reply thumbnail — 2026-07-08 workflow.
          Only rendered when the latest event is a reply that has
          a photo attached. Small — the point is "there's a
          handwritten letter waiting for you," not to read it here.
          The italic English snippet still renders below as caption. */}
      {isReply && preview.latestImageUrl ? (
        <div className="mt-1 mb-2 flex justify-start">
          <img
            src={preview.latestImageUrl}
            alt={`Letter from ${firstName}`}
            loading="lazy"
            className="block h-24 w-auto max-w-full border border-[#e8e0d4] bg-white"
          />
        </div>
      ) : null}
      {snippet ? (
        <p
          className="text-sm text-[#555] leading-snug italic line-clamp-2"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          &ldquo;{snippet}&rdquo;
        </p>
      ) : null}
      {/* Small "+ N photos" tag when the latest event is the sponsor's
          own outgoing note with attachments. Reply-with-photo state
          already shows a thumbnail above, so this branch only lights
          up on the sent side. */}
      {!isReply && preview.latestAttachmentCount > 0 && (
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#D4A843]">
          + {preview.latestAttachmentCount}{' '}
          {preview.latestAttachmentCount === 1 ? 'photo' : 'photos'} attached
        </p>
      )}
      {showSeeAll && (
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#888]">
          {total} penpal notes total &middot;{' '}
          <span className="text-[#0d0d0d]">
            open {firstName}&rsquo;s page to see the thread
          </span>
        </p>
      )}
    </div>
  );
}
