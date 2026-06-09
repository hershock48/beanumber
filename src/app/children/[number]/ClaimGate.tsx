'use client';

/**
 * ClaimGate — soft conversion gate that sits over the bio + CTA
 * section of /[N] for buyers who haven't claimed yet.
 *
 * Conversion shape:
 *   1. Hold-to-meet plays out (RevealOverlay) — hero is revealed.
 *   2. Once the reveal completes, this gate renders over the bio
 *      section: blurred children + a "You bought #N. Claim it."
 *      panel on top with two CTAs:
 *        - Claim #N → /signin?n=N (existing magic-link flow)
 *        - Maybe later → dismisses, unblurs, page renders normally
 *   3. After the magic-link callback, the user returns to
 *      /[N]?just_signed_in=1. The gate detects that flag, sets a
 *      localStorage breadcrumb, and stays down forever on this
 *      device. Server-side viewer_is_holder gates this too — either
 *      path keeps the gate down.
 *
 * IMPORTANT structural rule: this component must NEVER render any
 * wrapping element when the gate isn't actively showing. Every
 * non-gating path returns <>{children}</> directly. This is what
 * keeps the gate's CSS strictly scoped to the gating case — the
 * hero photo + name above the gate, and any unrelated stacking
 * context, are guaranteed untouched.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ClaimGateProps {
  shirtNumber: number;
  firstName: string;
  /** Cookie or shirt_assigned flag says they're the buyer for this
      number. Cold visitors are passthrough. */
  viewerLooksLikeBuyer: boolean;
  /** Server already marked them sponsor or holder. Gate never shows. */
  viewerIsRecognized: boolean;
  children: React.ReactNode;
}

export function ClaimGate({
  shirtNumber,
  firstName,
  viewerLooksLikeBuyer,
  viewerIsRecognized,
  children,
}: ClaimGateProps) {
  // Three independent flags that ALL must be true for the gate to
  // actually render its CSS-affecting wrapper:
  //   decided      — we've checked viewer state + localStorage
  //   shouldShow   — viewer qualifies for the gate
  //   revealDone   — the hold-to-meet animation finished
  //   !dismissed   — user hasn't clicked "Maybe later"
  const [decided, setDecided] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [revealDone, setRevealDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setDecided(true);
      return;
    }

    // Server already recognized them — gate stays down.
    if (viewerIsRecognized) {
      setShouldShow(false);
      setDecided(true);
      return;
    }

    // Not the buyer for this number — no claim to offer.
    if (!viewerLooksLikeBuyer) {
      setShouldShow(false);
      setDecided(true);
      return;
    }

    // Coming back from the magic-link callback — mark claimed and
    // never gate them on this device again.
    const params = new URLSearchParams(window.location.search);
    if (params.get('just_signed_in') === '1') {
      try {
        localStorage.setItem(`ban-claimed-${shirtNumber}`, 'yes');
      } catch {
        // Private mode / quota — fine.
      }
      setShouldShow(false);
      setDecided(true);
      return;
    }

    // Previously claimed or dismissed on this device.
    try {
      if (localStorage.getItem(`ban-claimed-${shirtNumber}`) === 'yes') {
        setShouldShow(false);
        setDecided(true);
        return;
      }
      if (localStorage.getItem(`ban-claim-dismissed-${shirtNumber}`) === 'yes') {
        setShouldShow(false);
        setDecided(true);
        return;
      }
    } catch {
      // localStorage unavailable — fall through and show the gate.
    }

    setShouldShow(true);
    setDecided(true);

    // Also check whether the reveal has already happened on this
    // device. Return visits short-circuit RevealOverlay, so the
    // ban-reveal-done event won't fire — we infer from the
    // localStorage flag RevealOverlay sets.
    try {
      if (localStorage.getItem(`ban-revealed-${shirtNumber}`) === 'yes') {
        setRevealDone(true);
      }
    } catch {
      // ignore
    }
  }, [shirtNumber, viewerLooksLikeBuyer, viewerIsRecognized]);

  // Listen for ban-reveal-done on first visits. Registered after
  // shouldShow is decided so we don't burn a listener on visitors
  // who'll never see the gate.
  useEffect(() => {
    if (!shouldShow || revealDone) return;
    const handler = () => setRevealDone(true);
    window.addEventListener('ban-reveal-done', handler);
    return () => window.removeEventListener('ban-reveal-done', handler);
  }, [shouldShow, revealDone]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(`ban-claim-dismissed-${shirtNumber}`, 'yes');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  // ── Hard passthrough cases. These return children directly with
  // NO wrapping element of any kind. CSS / stacking / layout in the
  // surrounding page is guaranteed untouched.

  // SSR + first client tick before useEffect runs.
  if (!decided) return <>{children}</>;
  // Server recognized them, or they're not a buyer, or they already
  // claimed/dismissed on this device.
  if (!shouldShow) return <>{children}</>;
  // Buyer qualifies but they just clicked Maybe later.
  if (dismissed) return <>{children}</>;
  // Buyer qualifies but the reveal animation hasn't finished —
  // RevealOverlay's own blur is doing the work right now.
  if (!revealDone) return <>{children}</>;

  // ── Gate is active. ONLY in this branch do we add any wrapping
  // div, blur, or overlay. The hero photo above this component is
  // completely outside our render tree and cannot be affected.
  return (
    <div className="relative">
      <div
        className="pointer-events-none select-none transition-all duration-500"
        style={{
          // Softer than the earlier 18 px attempt. The goal is to
          // tell the viewer "there's a story here, claim it to
          // read" — shapes and paragraph rhythm need to show
          // through. Too heavy reads as "broken" rather than
          // "locked." 8 px lets the eye recognize structure
          // without parsing the words.
          filter: 'blur(8px)',
          opacity: 0.55,
        }}
      >
        {children}
      </div>

      <div className="absolute inset-x-0 top-0 z-10 px-4 pt-6 md:pt-8 pointer-events-none">
        <div className="bg-[#1a1208] text-white p-6 md:p-7 shadow-2xl max-w-2xl mx-auto pointer-events-auto">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
            Welcome back
          </p>
          <p
            className="text-2xl md:text-[28px] mb-3 leading-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            You bought #{shirtNumber}. Claim it.
          </p>
          <p className="text-[#d8cfc1] text-sm md:text-base leading-relaxed mb-5">
            Read who {firstName} is. Lock #{shirtNumber} in as yours
            and every update from their campus comes back to this
            page &mdash; no payment, no password.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Link
              href={`/signin?n=${shirtNumber}`}
              className="inline-flex items-center justify-center bg-white hover:bg-[#f5f0e8] text-[#1a1208] text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
            >
              Claim #{shirtNumber} &rarr;
            </Link>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs text-[#d8cfc1]/80 hover:text-white underline px-3 py-2"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
