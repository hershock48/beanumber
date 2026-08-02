'use client';

/**
 * SponsorIntentRunner — completes the anon→sponsor funnel.
 *
 * The journey: anonymous visitor on /children/N taps "Sponsor {kid} —
 * $25/month" → /signin?n=N&intent=sponsor → magic link (intent rides
 * the callback URL) → lands back here as
 * /children/N?just_signed_in=1&intent=sponsor. This component sees
 * the intent param and POSTs /api/create-sponsor-checkout, then
 * redirects to Stripe — so the promise the sign-in page made ("tap
 * the link, land at checkout") is kept literally.
 *
 * Only mounted by the page for signed-in NON-sponsors of this kid
 * (a sponsor with a stale link shouldn't be re-charged a checkout
 * trip; the server render already knows the role). Additional client
 * guards:
 *
 *   - reads window.location.search in an effect — no useSearchParams,
 *     so no CSR bailout risk on this server-rendered page.
 *   - strips intent+just_signed_in from the URL via replaceState
 *     BEFORE firing, so refresh/back can't re-launch checkout.
 *   - sessionStorage one-shot per kid: backing out of Stripe returns
 *     via bfcache with the effect already run; even a cold reload
 *     won't re-fire. The visible card stays with a manual button, so
 *     "changed my mind, actually yes" is one tap, not a dead end.
 *
 * While working it renders a quiet gold-bordered card ("Taking you to
 * checkout…") in the reading column; on failure the card swaps to an
 * inline error + manual button. Renders nothing when no intent param
 * is present (the overwhelmingly common case).
 */

import { useEffect, useState } from 'react';

interface Props {
  firstName: string;
  shirtNumber: number;
  childRecordId: string;
  childId: string;
  childDisplayName: string;
}

export function SponsorIntentRunner({
  firstName,
  shirtNumber,
  childRecordId,
  childId,
  childDisplayName,
}: Props) {
  const [phase, setPhase] = useState<
    'idle' | 'launching' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function launch() {
    setPhase('launching');
    setErrorMessage('');
    try {
      const res = await fetch('/api/create-sponsor-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          childRecordId,
          childId,
          childDisplayName,
          returnPath: `/children/${shirtNumber}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url as string;
        return;
      }
      setPhase('error');
      setErrorMessage(
        data?.error ||
          'Checkout didn’t start. The sponsor button below works — or tap here to retry.'
      );
    } catch (err) {
      setPhase('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Network hiccup — tap to retry.'
      );
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('intent') !== 'sponsor') return;

    // Scrub the URL first so refresh/back never re-enters the funnel.
    params.delete('intent');
    params.delete('just_signed_in');
    const rest = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : '')
    );

    // One-shot per kid per tab session.
    const key = `ban_sponsor_intent_fired::${shirtNumber}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    void launch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'idle') return null;

  return (
    <div className="max-w-2xl mx-auto mt-6 mb-2 border-2 border-[#D4A843] bg-[#FFF8F0] px-6 py-5">
      {phase === 'launching' ? (
        <p className="text-[#0d0d0d] text-base leading-relaxed">
          <span className="font-bold">You&rsquo;re signed in.</span>{' '}
          Taking you to {firstName}&rsquo;s $25/month checkout&hellip;
        </p>
      ) : (
        <div>
          <p className="text-[#0d0d0d] text-base leading-relaxed mb-3">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => void launch()}
            className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-3 px-6 hover:bg-[#c49a3a] transition-colors"
          >
            Sponsor {firstName} &mdash; $25/month
          </button>
        </div>
      )}
    </div>
  );
}
