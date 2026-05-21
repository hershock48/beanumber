'use client';

import { useState } from 'react';

/**
 * Renders on /[number] when the server detects:
 *   - The visitor has a ban_buyer_session cookie pointing at a real
 *     Shirt + Stay subscription donation
 *   - No Sponsorship has been created for that subscription yet
 *
 * Tapping the claim button POSTs to /api/sponsor/claim-match with the
 * current shirt number. The server creates the Sponsorship, generates a
 * sponsor code, drops the sponsor_session cookie, and returns success.
 * We then reload the page so it renders in authenticated sponsor mode.
 *
 * Copy stays personal and certain — by the time a buyer reaches this
 * page, they're literally looking at the child their shirt belongs to.
 * Asking "is this your kid?" is gentle confirmation, not a hard prompt.
 */
export function ClaimMatchCard({
  shirtNumber,
  firstName,
}: {
  shirtNumber: number;
  firstName: string;
}) {
  const [state, setState] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  async function handleClaim() {
    setState('submitting');
    setErrorMessage('');
    try {
      const res = await fetch('/api/sponsor/claim-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shirtNumber }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setState('error');
        setErrorMessage(data?.error || 'Something went wrong. Try again or email Kevin.');
        return;
      }
      // Reload so server-side render picks up the new sponsor_session
      // cookie and renders the authenticated /[number] view.
      window.location.reload();
    } catch (err: any) {
      setState('error');
      setErrorMessage(err?.message || 'Network error. Try again.');
    }
  }

  return (
    <div className="bg-white border-2 border-[#D4A843]/40 p-6 md:p-8 mb-8">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
        Looks like this is your kid
      </p>
      <h2
        className="text-2xl md:text-3xl text-[#0d0d0d] mb-3"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
      >
        Claim {firstName} as your match.
      </h2>
      <p className="text-[#555] leading-relaxed mb-5">
        Your monthly sponsorship is already active. Tap below to link it to{' '}
        {firstName} and unlock your sponsor view on this page &mdash; updates,
        photos, and letters will land here over the coming months.
      </p>
      <button
        type="button"
        onClick={handleClaim}
        disabled={state === 'submitting'}
        className={`w-full sm:w-auto px-8 py-4 font-bold uppercase tracking-wider text-sm transition-colors ${
          state === 'submitting'
            ? 'bg-[#bbb] text-white cursor-wait'
            : 'bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] cursor-pointer'
        }`}
      >
        {state === 'submitting' ? 'Claiming…' : `Yes — claim ${firstName}`}
      </button>
      {state === 'error' && errorMessage && (
        <p className="text-sm text-red-600 mt-4">{errorMessage}</p>
      )}
      <p className="text-xs text-[#999] mt-4 leading-relaxed">
        Not the right kid? Double-check the number on the back of your shirt
        and try that one instead. You can only claim one match per
        subscription &mdash; tap carefully.
      </p>
    </div>
  );
}
