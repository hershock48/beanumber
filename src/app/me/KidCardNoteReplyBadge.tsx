'use client';

/**
 * KidCardNoteReplyBadge — small red "NEW" pill rendered next to the
 * "Reply from [Kid]" kicker in KidCardNotesPreview whenever the reply
 * arrived AFTER the sponsor's last visit to the kid's page.
 *
 * Piggybacks on the existing localStorage seen-tracker (updates-seen.ts)
 * that already powers KidCardUnreadBadge for personal updates. The
 * kid-page mount fires markSeen(childIdLegacy) — one visit clears both
 * the update-freshness signal AND this reply-freshness signal, so a
 * sponsor who reads the reply on /children/[N] comes back to /me with
 * a clean card.
 *
 * Client-only because the seen state lives in localStorage. Hydration
 * guard prevents a flash of NEW-then-gone during SSR. Subscribes to
 * SEEN_CHANGE_EVENT so an in-tab visit (e.g., sponsor tabs to a kid
 * page and back) re-evaluates without a remount.
 *
 * Silent when childIdLegacy is null (no key to store against) or the
 * reply date is empty — same defensive posture as KidCardUnreadBadge.
 */

import { useEffect, useState, useCallback } from 'react';
import { isUnread, SEEN_CHANGE_EVENT } from '@/lib/updates-seen';

export function KidCardNoteReplyBadge({
  childIdLegacy,
  replyArrivedAt,
}: {
  childIdLegacy: string | null;
  replyArrivedAt: string | null;
}) {
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(false);

  const evaluate = useCallback(() => {
    setUnread(isUnread(childIdLegacy, replyArrivedAt));
  }, [childIdLegacy, replyArrivedAt]);

  useEffect(() => {
    evaluate();
    setReady(true);
    const onChange = () => evaluate();
    window.addEventListener(SEEN_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => {
      window.removeEventListener(SEEN_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, [evaluate]);

  if (!ready || !unread) return null;

  return (
    <span
      className="inline-flex items-center gap-1 bg-[#c0392b] text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm ml-1"
      aria-label="New reply since your last visit"
    >
      <span
        className="inline-block w-1.5 h-1.5 bg-white rounded-full"
        aria-hidden="true"
      />
      New
    </span>
  );
}
