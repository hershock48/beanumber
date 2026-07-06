'use client';

/**
 * UnreadYourKidsDot — small red dot rendered next to the "Your kids"
 * label in the top nav when at least one of the viewer's kids has a
 * personal update published after this browser's last visit to that
 * kid's page.
 *
 * Fetches /api/me/updates-digest on mount (server tells us the latest
 * publishedAt per sponsored kid). Combines with localStorage seen-map
 * to decide unread. Silent when no unread.
 *
 * SSR-safe: renders nothing on first paint, then hydrates. The nav
 * link's clickable area doesn't shift — the dot is absolutely
 * positioned relative to a wrapper the parent provides.
 */

import { useEffect, useState } from 'react';
import { isUnread } from '@/lib/updates-seen';

type DigestItem = {
  childIdLegacy: string;
  latestPublishedAt: string;
};

export function UnreadYourKidsDot() {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/updates-digest', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items?: DigestItem[] };
        const items = Array.isArray(data.items) ? data.items : [];
        if (cancelled) return;
        const anyUnread = items.some(item =>
          isUnread(item.childIdLegacy, item.latestPublishedAt)
        );
        setHasUnread(anyUnread);
      } catch {
        // Silent failure — no dot is a better UX than error state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasUnread) return null;

  return (
    <span
      className="inline-block w-1.5 h-1.5 bg-[#c0392b] rounded-full ml-1 align-middle"
      aria-label="You have new updates"
      title="New update from the campus"
    />
  );
}
