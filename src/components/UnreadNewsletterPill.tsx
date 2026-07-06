'use client';

/**
 * UnreadNewsletterPill — small red NEW pill rendered on the campus
 * snapshot card when the latest newsletter was published after THIS
 * browser last opened /news (or clicked into the newsletter itself).
 *
 * Uses the same localStorage machinery as the per-kid seen tracker,
 * but a separate key so the two signals stay independent (the nav
 * dot's "one of your kids did something" meaning doesn't get mixed
 * up with campus-wide newsletter freshness).
 *
 * SSR-safe; hydrates then decides. Subscribes to the shared
 * SEEN_CHANGE_EVENT so an in-tab MarkNewsletterSeen write (e.g., the
 * sponsor navigates to /news and back) re-evaluates the pill without
 * a hard reload.
 */

import { useEffect, useState, useCallback } from 'react';
import { SEEN_CHANGE_EVENT } from '@/lib/updates-seen';

const NEWSLETTER_SEEN_KEY = 'ban-newsletter-seen-v1';

function readNewsletterSeenAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(NEWSLETTER_SEEN_KEY);
  } catch {
    return null;
  }
}

export function UnreadNewsletterPill({
  latestNewsletterPublishedAt,
}: {
  latestNewsletterPublishedAt: string | null | undefined;
}) {
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(false);

  const evaluate = useCallback(() => {
    if (!latestNewsletterPublishedAt) {
      setUnread(false);
      return;
    }
    const seenAt = readNewsletterSeenAt();
    setUnread(!seenAt || seenAt < latestNewsletterPublishedAt);
  }, [latestNewsletterPublishedAt]);

  useEffect(() => {
    evaluate();
    setReady(true);

    // Re-evaluate on: in-tab mark-seen (custom event dispatched by
    // MarkNewsletterSeen), cross-tab localStorage change (native),
    // and tab visibility change (sponsor returned from another tab).
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
      className="inline-flex items-center gap-1 bg-[#c0392b] text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm"
      aria-label="New issue since your last visit"
    >
      <span
        className="inline-block w-1.5 h-1.5 bg-white rounded-full"
        aria-hidden="true"
      />
      New
    </span>
  );
}

/**
 * Mark-seen side-effect component. Placed on /news (and inline on any
 * page that renders the full newsletter body). Stamps localStorage
 * with the newsletter's publishedAt AND dispatches the shared
 * SEEN_CHANGE_EVENT so the nav dot + /me pill re-evaluate immediately
 * (in-tab), not just on next mount.
 */
export function MarkNewsletterSeen({
  publishedAt,
}: {
  publishedAt: string | null | undefined;
}) {
  useEffect(() => {
    if (!publishedAt) return;
    try {
      const current = window.localStorage.getItem(NEWSLETTER_SEEN_KEY);
      if (!current || current < publishedAt) {
        window.localStorage.setItem(NEWSLETTER_SEEN_KEY, publishedAt);
        window.dispatchEvent(new CustomEvent(SEEN_CHANGE_EVENT));
      }
    } catch {
      // Silent — private browsing or quota.
    }
  }, [publishedAt]);
  return null;
}
