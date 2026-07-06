'use client';

/**
 * KidCardUnreadBadge — small "NEW" pill rendered in a KidCard when
 * there's a personal update published after this viewer's last visit
 * to the kid's page.
 *
 * Rendered inline where the /me KidCard's "Latest · X days ago" line
 * already lives. When unread, the pill draws focus and pairs with
 * the existing latest-update snippet so the sponsor can see BOTH
 * "something new is here" AND "here's the headline."
 *
 * Client-only because the read/unread state lives in localStorage
 * (per-browser). Hydration guard renders nothing until we've read
 * localStorage — avoids a flash of NEW-then-not-NEW during SSR.
 * Subscribes to SEEN_CHANGE_EVENT so in-tab writes (e.g., another
 * kid card whose page the sponsor just visited) re-evaluate this
 * one without a remount.
 */

import { useEffect, useState, useCallback } from 'react';
import { isUnread, SEEN_CHANGE_EVENT } from '@/lib/updates-seen';

export function KidCardUnreadBadge({
  childIdLegacy,
  latestUpdatePublishedAt,
}: {
  childIdLegacy: string | null;
  latestUpdatePublishedAt: string | null;
}) {
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(false);

  const evaluate = useCallback(() => {
    setUnread(isUnread(childIdLegacy, latestUpdatePublishedAt));
  }, [childIdLegacy, latestUpdatePublishedAt]);

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
      aria-label="New update since your last visit"
    >
      <span
        className="inline-block w-1.5 h-1.5 bg-white rounded-full"
        aria-hidden="true"
      />
      New
    </span>
  );
}
