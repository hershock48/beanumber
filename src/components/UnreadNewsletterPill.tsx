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
 * SSR-safe; hydrates then decides.
 */

import { useEffect, useState } from 'react';

const NEWSLETTER_SEEN_KEY = 'ban-newsletter-seen-v1';

export function UnreadNewsletterPill({
  latestNewsletterPublishedAt,
}: {
  latestNewsletterPublishedAt: string | null | undefined;
}) {
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (!latestNewsletterPublishedAt) {
      setReady(true);
      return;
    }
    try {
      const seenAt = window.localStorage.getItem(NEWSLETTER_SEEN_KEY);
      setUnread(!seenAt || seenAt < latestNewsletterPublishedAt);
    } catch {
      setUnread(false);
    }
    setReady(true);
  }, [latestNewsletterPublishedAt]);

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
 * with the newsletter's publishedAt so future /me visits clear the
 * pill for THIS browser.
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
      }
    } catch {
      // Silent — private browsing or quota.
    }
  }, [publishedAt]);
  return null;
}
