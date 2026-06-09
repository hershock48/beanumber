'use client';

import { useEffect, useState } from 'react';
import { SignInModal } from '@/components/SignInModal';

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
}: {
  shirtNumber: number;
  firstName: string;
}) {
  const [signInOpen, setSignInOpen] = useState(false);
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
          Make it yours
        </p>
        <p
          className="text-2xl md:text-[28px] mb-3 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          You just met {firstName}. Make #{shirtNumber} yours.
        </p>
        <p className="text-[#d8cfc1] text-sm md:text-base leading-relaxed mb-5">
          Save your spot in {firstName}&rsquo;s story. We&rsquo;ll email
          you a one-tap link. No payment, no password &mdash; a place
          to come back to.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={() => setSignInOpen(true)}
            className="inline-flex items-center justify-center bg-white hover:bg-[#f5f0e8] text-[#1a1208] text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
          >
            Claim #{shirtNumber} &rarr;
          </button>
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
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}
