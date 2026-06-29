'use client';

/**
 * One-time tooltip below the Your Kids strip explaining what it is.
 *
 * Shown the first time a viewer has 2+ kids in their account (i.e.
 * sponsored a second kid, or claimed a 2nd number). Until they have
 * a second kid, the strip is just their current kid + an "Add" tile,
 * which doesn't really need explanation. The "wait, why is there a
 * row of other people's faces" moment is at the second-kid mark.
 *
 * Behavior:
 *   - localStorage gate (`ban-your-kids-coachmark-v1`) so it shows
 *     exactly once per device, then never again.
 *   - Visible immediately on mount when the gate is open AND
 *     kidsCount >= 2.
 *   - Dismisses on click (×) or after 14 seconds (the read window for
 *     a one-sentence prompt at this length).
 *   - Sets the localStorage flag on dismiss so we don't re-show even
 *     if they refresh before the auto-timeout fires.
 *
 * Voice: short, direct, no exclamation point. Matches the rest of
 * the brand. The point is to teach the affordance, not to celebrate
 * the new kid.
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ban-your-kids-coachmark-v1';

export function YourKidsCoachmark({ kidsCount }: { kidsCount: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (kidsCount < 2) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // localStorage disabled (private mode) — show every visit
      // rather than skip; the prompt is small and dismissable.
    }
    setVisible(true);

    const timer = window.setTimeout(() => {
      dismiss();
    }, 14000);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidsCount]);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-5xl mx-auto px-5 pointer-events-none"
    >
      <div className="relative inline-flex items-center gap-3 mt-2 px-4 py-2.5 bg-[#0d0d0d] text-[#FFF8F0] text-sm shadow-lg pointer-events-auto"
           style={{ borderLeft: '3px solid #D4A843' }}>
        {/* Up arrow notch pointing back to the strip */}
        <span
          aria-hidden
          className="absolute -top-1.5 left-6 w-3 h-3 bg-[#0d0d0d] rotate-45"
        />
        <span aria-hidden className="text-[#D4A843] text-base leading-none">↑</span>
        <span>All your kids live up here. Tap any face to switch.</span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="ml-2 text-[#888] hover:text-[#FFF8F0] transition-colors text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
