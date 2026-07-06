'use client';

/**
 * UnreadYourKidsDot — small red dot rendered next to the "My campus"
 * label in the top nav when at least one of the viewer's kids has a
 * personal update published after this browser's last visit to that
 * kid's page.
 *
 * Fetches /api/me/updates-digest on mount (server tells us the latest
 * publishedAt per sponsored kid). Caches the digest in state.
 * Re-evaluates against localStorage every time seen-state changes —
 * either from an in-tab mark-seen (SEEN_CHANGE_EVENT), a cross-tab
 * storage event, or the tab regaining focus. Never re-fetches on
 * seen-change; only the local view of "unread" changes.
 *
 * SSR-safe: renders nothing on first paint, then hydrates.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { isUnread, SEEN_CHANGE_EVENT } from '@/lib/updates-seen';

type DigestItem = {
  childIdLegacy: string;
  latestPublishedAt: string;
};

export function UnreadYourKidsDot() {
  const [hasUnread, setHasUnread] = useState(false);
  const digestRef = useRef<DigestItem[]>([]);

  const evaluate = useCallback(() => {
    const anyUnread = digestRef.current.some(item =>
      isUnread(item.childIdLegacy, item.latestPublishedAt)
    );
    setHasUnread(anyUnread);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/updates-digest', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items?: DigestItem[] };
        digestRef.current = Array.isArray(data.items) ? data.items : [];
        evaluate();
      } catch {
        // Silent failure — no dot is a better UX than error state.
      }
    })();

    const onChange = () => evaluate();
    window.addEventListener(SEEN_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(SEEN_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, [evaluate]);

  if (!hasUnread) return null;

  return (
    <span
      className="inline-block w-1.5 h-1.5 bg-[#c0392b] rounded-full ml-1 align-middle"
      aria-label="You have new updates"
      title="New update from the campus"
    />
  );
}
