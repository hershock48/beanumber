'use client';

/**
 * AnonStripShimmer — client-only wrapper that gates the anon
 * viewer-state strip's gold shimmer animation on the reveal
 * completing.
 *
 * The shimmer was ported from the killed AlreadySponsoringBanner
 * onto the anon strip on 2026-07-08. The banner used to defer its
 * mount until the `ban-reveal-done` event fired, so the first
 * shimmer sweep landed after the RevealOverlay curtain lifted.
 * When the strip inherited the effect but not the mount gate,
 * cold visitors — the exact audience the shimmer is meant to
 * catch — lost the first sweep behind the reveal blur.
 *
 * This wrapper adds a `data-ready="true"` attribute (used by the
 * CSS `[data-ready] .ban-viewer-strip-shimmer-host::after {...}`
 * selector to actually start the animation) once one of:
 *   - The `ban-reveal-done` window event fires
 *   - localStorage['ban-revealed-{N}'] === 'yes' (RevealOverlay
 *     short-circuits on return visits and doesn't dispatch the
 *     event; we infer completion from its persistent flag)
 *   - A 4s safety timeout (RevealOverlay finishes at ~3.8s; the
 *     safety fallback catches the case where the event dispatch
 *     was suppressed for whatever reason so the strip never
 *     shimmerless)
 *
 * Renders children immediately either way — the strip is visible
 * from server render onwards. Only the shimmer animation is gated.
 */

import { useEffect, useRef, useState } from 'react';

const REVEAL_SAFETY_MS = 4000;

export function AnonStripShimmer({
  shirtNumber,
  children,
}: {
  shirtNumber: number;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Return visits — RevealOverlay persists a flag and skips the
    // animation. Detect that and mark ready immediately so the
    // shimmer runs on this pageview too.
    try {
      if (localStorage.getItem(`ban-revealed-${shirtNumber}`) === 'yes') {
        setReady(true);
        return;
      }
    } catch {
      // localStorage unavailable (private mode / quota) — fall
      // through to event listener + safety timer.
    }

    const onReveal = () => setReady(true);
    window.addEventListener('ban-reveal-done', onReveal);

    // Safety timer — if the event never fires (RevealOverlay bug,
    // signed-out visitor whose overlay path skips, etc.) still
    // trigger the shimmer within 4s of mount so the strip isn't
    // permanently static.
    timerRef.current = window.setTimeout(() => setReady(true), REVEAL_SAFETY_MS);

    return () => {
      window.removeEventListener('ban-reveal-done', onReveal);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [shirtNumber]);

  return (
    <div
      data-anon-strip-ready={ready ? 'true' : 'false'}
      className="anon-strip-shimmer-wrap"
    >
      {children}
    </div>
  );
}
