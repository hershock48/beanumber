'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Post-reveal claim prompt on /[N].
 *
 * The missing rung in the conversion ladder. After someone holds to
 * meet the kid (the brand's emotional peak), they're at their highest
 * engagement — but with nothing to do that isn't already a $25/mo
 * commitment. This card sits between the bio and the sponsor CTA and
 * asks for the smallest possible commitment: sign in so we remember
 * who you are. No payment. No password.
 *
 * Psychology:
 *   - hold-to-meet says "introduce me"
 *   - this card says "remember us together"
 *
 * Mechanics:
 *   - Only shows for unsigned visitors. Existing sponsors (cookie)
 *     never see it.
 *   - Delays entrance by ~5s after mount so it doesn't compete with
 *     the reveal animation. The reveal finishes around 3.8s; this
 *     card appears after a beat of stillness.
 *   - "Maybe later" persists per-kid in localStorage so dismissal
 *     sticks across return visits to this number.
 *   - Click → opens the existing SignInModal pre-filled with this
 *     number (the modal pulls the number from the URL).
 *
 * Brand voice (per voice.md): direct, specific, no "just," no jargon.
 */
export function ClaimThisNumberCard({
  shirtNumber,
  firstName,
  viewerLooksLikeBuyer,
}: {
  shirtNumber: number;
  firstName: string;
  /** True when we detect a ban_buyer_session cookie matching a recent
      shirt purchase. Raises the confidence of the prompt — instead of
      asking "is this yours?" we tell them "you bought this." */
  viewerLooksLikeBuyer?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const wasDismissed =
        localStorage.getItem(`ban-claim-dismissed-${shirtNumber}`) === 'yes';
      if (wasDismissed) {
        setDismissed(true);
        return;
      }
    } catch {}
    // Hold a beat after the reveal animation lands (~3.8s total) so
    // this card doesn't compete with the moment. Soft fade in after.
    const t = window.setTimeout(() => setVisible(true), 4800);
    return () => clearTimeout(t);
  }, [shirtNumber]);

  if (dismissed) return null;

  return (
    <>
      <div
        className="bg-[#1a1208] text-white p-7 md:p-8 transition-all duration-700 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          pointerEvents: visible ? 'auto' : 'none',
        }}
        aria-hidden={!visible}
      >
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
          {viewerLooksLikeBuyer ? 'Welcome back' : 'Make it yours'}
        </p>
        <p
          className="text-2xl md:text-[28px] mb-3 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {viewerLooksLikeBuyer
            ? `You bought #${shirtNumber}. Claim it.`
            : `Got a Shirt with #${shirtNumber}?`}
        </p>
        <p className="text-[#d8cfc1] text-sm md:text-base leading-relaxed mb-5">
          {viewerLooksLikeBuyer
            ? `Sign in to lock #${shirtNumber} in as yours. Every update from ${firstName}'s campus comes back to this page — no payment, no password.`
            : `If you got a Shirt with this Number on the back, sign in and #${shirtNumber} is yours. We'll remember you on this device for 30 days. No payment, no password.`}
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Link
            href={`/signin?n=${shirtNumber}`}
            className="inline-flex items-center justify-center bg-white hover:bg-[#f5f0e8] text-[#1a1208] text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
          >
            {viewerLooksLikeBuyer
              ? `Claim #${shirtNumber}`
              : `Yes, claim #${shirtNumber}`} &rarr;
          </Link>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(
                  `ban-claim-dismissed-${shirtNumber}`,
                  'yes'
                );
              } catch {}
              setDismissed(true);
            }}
            className="text-xs text-[#a89e8d] hover:text-white underline transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </>
  );
}
