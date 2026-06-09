'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Slim "already sponsoring?" banner at the very top of /[N] for
 * unsigned visitors. Specifically targets existing sponsors who land
 * here on a new device — Samantha's panic scenario. One-line, gold
 * accent, dismissible per-kid via localStorage. Cold visitors and
 * shirt buyers can ignore or dismiss it; it costs them nothing.
 */
export function AlreadySponsoringBanner({
  shirtNumber,
}: {
  shirtNumber: number;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [revealDone, setRevealDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    try {
      const wasDismissed =
        localStorage.getItem(`ban-banner-dismissed-${shirtNumber}`) === 'yes';
      if (wasDismissed) {
        setDismissed(true);
        return;
      }
    } catch {}

    // If this kid's reveal has already happened on a prior visit, the
    // RevealOverlay skips itself and we never get a 'ban-reveal-done'
    // event — show the banner straight away with a brief settle delay.
    let alreadyRevealed = false;
    try {
      alreadyRevealed =
        localStorage.getItem(`ban-revealed-${shirtNumber}`) === 'yes';
    } catch {}

    if (alreadyRevealed) {
      const t = window.setTimeout(() => {
        if (!cancelled) setRevealDone(true);
      }, 250);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    // First-time visit: wait for the reveal to finish broadcasting
    // 'ban-reveal-done'. That fires after the hold completes, the
    // split-flap board exits, and the page underneath unblurs
    // (~3.8s after the hold).
    function onRevealDone() {
      if (cancelled) return;
      setRevealDone(true);
    }
    window.addEventListener('ban-reveal-done', onRevealDone);
    return () => {
      cancelled = true;
      window.removeEventListener('ban-reveal-done', onRevealDone);
    };
  }, [shirtNumber]);

  if (dismissed || !revealDone) return null;

  return (
    <div className="relative bg-[#1a1208] text-white border-b border-[#D4A843]/40 overflow-hidden ban-banner-shimmer-host">
      {/* Diagonal gold shimmer that sweeps across once on load (1s
          delay) and again at 6s, then stops. Pure-CSS pseudo-element
          via the .ban-banner-shimmer-host::after rule below. */}
      <style>{`
        @keyframes banBannerShimmer {
          0% {
            transform: translateX(-120%) skewX(-18deg);
            opacity: 0;
          }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% {
            transform: translateX(120%) skewX(-18deg);
            opacity: 0;
          }
        }
        .ban-banner-shimmer-host::after {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 35%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 230, 150, 0.0) 20%,
            rgba(255, 230, 150, 0.55) 50%,
            rgba(255, 230, 150, 0.0) 80%,
            transparent 100%
          );
          pointer-events: none;
          animation:
            banBannerShimmer 1.6s ease-out 0.9s,
            banBannerShimmer 1.6s ease-out 6.5s;
          animation-fill-mode: both;
          mix-blend-mode: screen;
        }
      `}</style>
      <div className="relative max-w-5xl mx-auto px-5 py-2.5 flex items-center justify-between gap-3 z-10">
        <p className="text-sm leading-tight flex-1 min-w-0">
          <span className="text-[#D4A843] font-bold uppercase tracking-wider text-xs mr-2">
            Already sponsoring?
          </span>
          <Link
            href={`/signin?n=${shirtNumber}`}
            className="underline hover:text-[#D4A843] transition-colors"
          >
            Sign in to see your view
          </Link>
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(
                `ban-banner-dismissed-${shirtNumber}`,
                'yes'
              );
            } catch {}
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="text-[#a89e8d] hover:text-white transition-colors flex-shrink-0 z-10 relative"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
