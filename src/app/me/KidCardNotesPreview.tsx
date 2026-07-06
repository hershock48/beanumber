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

import Link from 'next/link';
import type { KidCardNotePreview } from '@/lib/db/queries';

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
    const days = Math.floor(
      (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
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
}: {
  preview: KidCardNotePreview | null;
  firstName: string;
  kidHref: string | null;
}) {
  if (!preview) return null;

  const total = preview.outboundCount + preview.replyCount;
  const showSeeAll = kidHref && total > 1;
  const snippet = truncate(preview.latestBody, MAX_SNIPPET);
  const isReply = preview.latestKind === 'reply';

  return (
    <div className="mt-3 pt-3 border-t border-[#e8e0d4]">
      <p
        className={
          isReply
            ? 'text-[10px] font-bold uppercase tracking-[0.2em] text-[#c0392b] mb-1'
            : 'text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1'
        }
      >
        {isReply ? `New reply from ${firstName}` : 'Your correspondence'}
      </p>
      <p className="text-xs text-[#0d0d0d] font-semibold leading-snug mb-1">
        {statusLine(preview, firstName)}
      </p>
      <p
        className="text-sm text-[#555] leading-snug italic line-clamp-2"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        &ldquo;{snippet}&rdquo;
      </p>
      {showSeeAll && (
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#888]">
          {total} notes total &middot;{' '}
          <span className="text-[#0d0d0d]">
            open {firstName}&rsquo;s page to see the thread
          </span>
        </p>
      )}
    </div>
  );
}
