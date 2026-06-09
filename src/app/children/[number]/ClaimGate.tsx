'use client';

/**
 * ClaimGate — soft conversion gate that sits over the bio + CTA
 * section of /[N] for buyers who haven't claimed yet.
 *
 * The conversion shape Kevin wants:
 *
 *   1. Hold-to-meet reveals the photo + name (RevealOverlay handles
 *      this — the hero stays clear).
 *   2. The rest of the kid's content (bio, teacher quote, sponsor
 *      ask) is blurred behind a panel that says "You bought #N.
 *      Claim it." The panel has two CTAs:
 *        - Claim #N → /signin?n=N (existing magic-link flow)
 *        - Maybe later → dismisses the gate, unblurs the content,
 *          page renders normally (the cold-visitor sponsor ask
 *          shows, which is the same fallback we had before).
 *   3. After clicking the magic link, the user returns to
 *      /[N]?just_signed_in=1. The gate detects that flag, marks
 *      claimed in localStorage, and never appears again on this
 *      device. Server-side viewer_is_holder also gates this, so
 *      either path keeps the gate down.
 *
 * Why the gate is client-side and not server-side: the underlying
 * Sponsorship-row recognition can be flaky (existing Holder rows
 * with blank Children links don't match the email-by-child lookup,
 * so a freshly-claimed user can land back here and be misread as
 * a stranger). The localStorage breadcrumb hides that bug from the
 * UX while the data layer gets sorted out separately.
 *
 * Who sees the gate:
 *   - viewerLooksLikeBuyer is true (their cookie or shirt_assigned
 *     flag says they're the buyer for this number)
 *   - AND viewerIsRecognized is false (server didn't mark them as
 *     sponsor or holder)
 *   - AND localStorage doesn't have ban-claimed-N or
 *     ban-claim-dismissed-N set
 *   - AND the reveal animation has finished (so we don't stack two
 *     overlays during the hold-to-meet)
 *
 * Cold visitors (non-buyers) never see the gate — children render
 * passthrough.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ClaimGateProps {
  shirtNumber: number;
  firstName: string;
  /** Whether this viewer looks like the person who bought this
      number (cookie match or shirt_assigned flag). Cold visitors
      get passthrough. */
  viewerLooksLikeBuyer: boolean;
  /** Whether the server already recognizes the viewer as the
      sponsor or holder of this kid. If yes, the gate never shows. */
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
  // 'pending' — haven't decided yet (SSR + initial client render).
  // 'show'    — render the gate over blurred content.
  // 'hide'    — pass children through unmodified.
  const [state, setState] = useState<'pending' | 'show' | 'hide'>('pending');
  const [revealDone, setRevealDone] = useState(false);

  // Decide initial state once on mount.
  useEffect(() => {
    // Server already recognized them — gate stays down.
    if (viewerIsRecognized) {
      setState('hide');
      return;
    }
    // Not the buyer for this number — no claim to offer.
    if (!viewerLooksLikeBuyer) {
      setState('hide');
      return;
    }
    if (typeof window === 'undefined') return;

    // Coming back from the magic-link callback — mark claimed and
    // never gate them on this device again.
    const params = new URLSearchParams(window.location.search);
    if (params.get('just_signed_in') === '1') {
      try {
        localStorage.setItem(`ban-claimed-${shirtNumber}`, 'yes');
      } catch {
        // Private mode / quota — fine, gate just won't persist.
      }
      setState('hide');
      return;
    }

    // Previously claimed or dismissed on this device.
    try {
      if (localStorage.getItem(`ban-claimed-${shirtNumber}`) === 'yes') {
        setState('hide');
        return;
      }
      if (localStorage.getItem(`ban-claim-dismissed-${shirtNumber}`) === 'yes') {
        setState('hide');
        return;
      }
    } catch {
      // localStorage unavailable — fall through and show the gate.
    }

    setState('show');
  }, [shirtNumber, viewerLooksLikeBuyer, viewerIsRecognized]);

  // Wait for the reveal animation to finish before the gate
  // appears, so we don't pile a second overlay on top of the
  // hold-to-meet experience. Return visits (alreadyRevealed) fire
  // the same flag client-side via localStorage so the gate doesn't
  // wait on an event that already happened.
  useEffect(() => {
    if (state !== 'show') return;
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(`ban-revealed-${shirtNumber}`) === 'yes') {
        setRevealDone(true);
        return;
      }
    } catch {
      // ignore
    }
    const handler = () => setRevealDone(true);
    window.addEventListener('ban-reveal-done', handler);
    return () => window.removeEventListener('ban-reveal-done', handler);
  }, [shirtNumber, state]);

  const gateVisible = state === 'show' && revealDone;

  const handleDismiss = () => {
    try {
      localStorage.setItem(`ban-claim-dismissed-${shirtNumber}`, 'yes');
    } catch {
      // ignore
    }
    setState('hide');
  };

  return (
    <>
      {/* Claim panel sits as a normal block element ABOVE the blurred
          bio. No absolute / sticky / fixed — keeps the gate strictly
          section-scoped so nothing can ever overlay or push around
          the hero photo + name above it. */}
      {gateVisible && (
        <div className="mt-8 md:mt-10 bg-[#1a1208] text-white p-6 md:p-7 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
            Welcome back
          </p>
          <p
            className="text-2xl md:text-[28px] mb-3 leading-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            You bought #{shirtNumber}. Claim it.
          </p>
          <p className="text-[#d8cfc1] text-sm md:text-base leading-relaxed mb-5 max-w-xl">
            Lock #{shirtNumber} in as yours. Every update from{' '}
            {firstName}&rsquo;s campus comes back to this page &mdash;
            no payment, no password.
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
      )}

      <div
        className="transition-[filter,opacity] duration-500"
        style={{
          filter: gateVisible ? 'blur(10px)' : 'none',
          opacity: gateVisible ? 0.55 : 1,
          pointerEvents: gateVisible ? 'none' : 'auto',
          // Hide blurred content from assistive tech / selection.
          ...(gateVisible ? { userSelect: 'none' as const } : {}),
        }}
        aria-hidden={gateVisible}
      >
        {children}
      </div>
    </>
  );
}
