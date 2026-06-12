'use client';

/**
 * Direct-to-Stripe sponsor button for /meet/[childId].
 *
 * The /meet page is the numberless kid profile someone lands on after
 * clicking a tile in "Other kids at the campus." When they hit
 * "Sponsor [name]" here, they have already picked. There's no reason
 * to bounce them through /campus's browse grid.
 *
 * This button POSTs straight to the create-sponsor-checkout API and
 * redirects to Stripe in one click. Two clicks total from kid tile to
 * Stripe instead of "tile → meet → sponsorship → find kid in grid →
 * sponsor → Stripe."
 *
 * If the API errors, we surface a small inline message in place of a
 * full-page alert — kid pages are otherwise quiet, and surprise alerts
 * feel broken.
 */

import { useState } from 'react';

interface MeetSponsorButtonProps {
  childRecordId: string;
  childId: string;
  childDisplayName: string;
  firstName: string;
}

export function MeetSponsorButton({
  childRecordId,
  childId,
  childDisplayName,
  firstName,
}: MeetSponsorButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleClick = async () => {
    setState('loading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/create-sponsor-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childRecordId,
          childId,
          childDisplayName,
          // Preserve context: if they back out of Stripe, send them
          // back to this kid's meet page instead of the generic
          // /campus browse grid where they'd have to find the
          // same kid again.
          returnPath: `/meet/${childRecordId}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not start checkout.');
      }
      if (!data.url) {
        throw new Error('No checkout URL returned.');
      }
      // Hand off to Stripe.
      window.location.href = data.url;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Something went wrong.';
      setErrorMessage(msg);
      setState('error');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'loading'}
        className="inline-block w-full text-center px-5 py-3 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === 'loading'
          ? 'Opening checkout...'
          : `Start sponsoring ${firstName} — $25/mo`}
      </button>
      {state === 'error' && errorMessage && (
        <p className="mt-3 text-xs text-[#a85a3a]">
          {errorMessage} Try again, or email{' '}
          <a
            href="mailto:Kevin@beanumber.org"
            className="underline hover:text-[#0d0d0d]"
          >
            Kevin@beanumber.org
          </a>
          .
        </p>
      )}
    </>
  );
}
