'use client';

/**
 * AnonStripShimmer — client-only wrapper that hides the anon
 * viewer-state strip until the RevealOverlay curtain finishes.
 *
 * History: originally a two-job wrapper — (1) hide until the reveal
 * completes, and (2) gate a gold shimmer animation on the strip. The
 * shimmer was killed 2026-07-12 when the strip's copy switched from a
 * soft sign-in nudge ("Sign in to your view") to a two-audience
 * conversion pitch ("Sponsor {Kid} for $25/mo") — animated gold on a
 * kid's page with a price attached read as marketing polish, not a
 * warm nudge. Only the reveal-hiding half of this wrapper is still
 * doing real work; name kept for continuity, could be renamed to
 * something like `HideDuringReveal` in a future cleanup pass.
 *
 * The `data-anon-strip-ready` attribute below is dead — no CSS reads
 * it anymore — but kept for symmetry with the opacity gate. Cheap to
 * leave, easy to reintroduce a shimmer-style effect later if we ever
 * want one that only fires post-reveal.
 *
 * The `ready` flag flips once one of:
 *   - The `ban-reveal-done` window event fires
 *   - localStorage['ban-revealed-{N}'] === 'yes' (RevealOverlay
 *     short-circuits on return visits and doesn't dispatch the
 *     event; we infer completion from its persistent flag)
 *   - A 4s safety timeout (RevealOverlay finishes at ~3.8s; the
 *     safety fallback catches the case where the event dispatch
 *     was suppressed for whatever reason)
 *
 * Renders children immediately with opacity: 0, then fades in
 * ~250ms after ready. Pointer events also gated so the invisible
 * strip doesn't intercept clicks during the reveal moment.
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
      style={{
        // Hide the strip entirely until the reveal completes. On
        // first-visit cold pages, the strip would otherwise show
        // through the sides of the RevealOverlay's "Every number is
        // a name" card and compete with the moment. Fades in ~250ms
        // after the reveal finishes so it doesn't pop in abruptly.
        // Return visitors (localStorage flag set) hit ready=true on
        // mount so they see no transition at all.
        opacity: ready ? 1 : 0,
        transition: 'opacity 250ms ease-out',
        // While hidden, don't intercept clicks either — a fully-
        // transparent strip still absorbs pointer events by default.
        pointerEvents: ready ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
}
