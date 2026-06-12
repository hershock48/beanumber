'use client';

/**
 * Direct-to-Stripe sponsor button for /meet/[childId].
 *
 * Only rendered for signed-in viewers (see /meet/[childId]/page.tsx —
 * cold visitors see &ldquo;Get a Shirt to meet your kid&rdquo; instead, per
 * core_model.md §0b: every sponsorship traces back to a Number).
 * For a signed-in user who lands here from the &ldquo;Other kids at the
 * campus&rdquo; rail on their /[N] page, the button POSTs straight to
 * /api/create-sponsor-checkout and redirects to Stripe — they&rsquo;ve
 * already picked, no reason to bounce them anywhere else.
 *
 * The API also gates server-side on the sponsor_session cookie. If
 * a session expires between page render and click, the API returns
 * 401 with { redirect: '/shirts' } and we surface the message inline.
 *
 * cancel_url on the Stripe session falls back to /meet/[childRecordId]
 * so backing out preserves context (the kid they were about to sponsor)
 * instead of dumping them on a generic page.
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
          // back to this kid's meet page instead of the API's default
          // /shirts fallback. Same kid in front of them, no lost
          // thread.
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
