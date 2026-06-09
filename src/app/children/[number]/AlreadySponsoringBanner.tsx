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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const wasDismissed =
        localStorage.getItem(`ban-banner-dismissed-${shirtNumber}`) === 'yes';
      if (wasDismissed) setDismissed(true);
    } catch {}
    setHydrated(true);
  }, [shirtNumber]);

  if (!hydrated || dismissed) return null;

  return (
    <div className="bg-[#1a1208] text-white border-b border-[#D4A843]/40">
      <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center justify-between gap-3">
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
          className="text-[#a89e8d] hover:text-white transition-colors flex-shrink-0"
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
