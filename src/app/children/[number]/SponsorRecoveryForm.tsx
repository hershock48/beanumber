'use client';

import { useState } from 'react';

/**
 * Inline magic-link recovery form on /[number] for unidentified
 * visitors who say "this is my kid." Tap the prompt, enter email,
 * submit. Server emails them a one-tap link back into sponsor mode.
 *
 * Privacy: the success message doesn't say whether their email was
 * actually matched — same response regardless. That prevents the
 * form from being used as a sponsor-enumeration oracle.
 */
export function SponsorRecoveryForm({ shirtNumber }: { shirtNumber: number }) {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || state === 'sending') return;
    setState('sending');
    setErrorMessage('');
    try {
      const res = await fetch('/api/sponsor/recover/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, shirtNumber }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setState('error');
        setErrorMessage(data?.error || 'Could not send link. Try again.');
        return;
      }
      setState('sent');
    } catch (err: any) {
      setState('error');
      setErrorMessage(err?.message || 'Network error. Try again.');
    }
  }

  if (!expanded) {
    return (
      <div className="mt-6 text-center">
        <p className="text-sm text-[#666] mb-1">
          Already a sponsor?
        </p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm font-bold text-[#D4A843] hover:text-[#0d0d0d] underline transition-colors"
        >
          Sign in to see your sponsor view &rarr;
        </button>
      </div>
    );
  }

  if (state === 'sent') {
    return (
      <div className="bg-white border border-[#e8e0d4] p-5 mt-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
          Check your email
        </p>
        <p className="text-[#555] text-sm leading-relaxed">
          If we have an active sponsorship for that email on this kid,
          a one-tap link is on its way. The link expires in 30 minutes.
        </p>
        <p className="text-xs text-[#aaa] leading-relaxed mt-2">
          Nothing showing up? Email{' '}
          <a href="mailto:Kevin@beanumber.org" className="text-[#D4A843] hover:underline">Kevin@beanumber.org</a>{' '}
          and I&rsquo;ll get you back in.
        </p>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setState('idle');
            setEmail('');
          }}
          className="mt-3 text-xs text-[#aaa] hover:text-[#666]"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white border border-[#e8e0d4] p-5 mt-6"
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
        Get back into your sponsor view
      </p>
      <p className="text-[#555] text-sm leading-relaxed mb-4">
        Enter the email you used to sponsor this kid. We&rsquo;ll send a
        one-tap link that puts you straight back into your sponsor view
        here. Link expires in 30 minutes.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 px-3 py-2 border border-[#e8e0d4] bg-white text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors"
          disabled={state === 'sending'}
        />
        <button
          type="submit"
          disabled={!email || state === 'sending'}
          className="px-4 py-2 bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider hover:bg-[#c49a3a] transition-colors disabled:opacity-60"
        >
          {state === 'sending' ? 'Sending…' : 'Send link'}
        </button>
      </div>
      {state === 'error' && (
        <p className="text-xs text-red-600 mt-2">{errorMessage}</p>
      )}
      <p className="text-xs text-[#aaa] mt-3 leading-relaxed">
        Don&rsquo;t remember which email, or stuck for any other reason? Email{' '}
        <a href="mailto:Kevin@beanumber.org" className="text-[#D4A843] hover:underline">Kevin@beanumber.org</a>{' '}
        and I&rsquo;ll get you back in.
      </p>
      <button
        type="button"
        onClick={() => {
          setExpanded(false);
          setEmail('');
          setState('idle');
        }}
        className="block mt-3 text-xs text-[#aaa] hover:text-[#666]"
      >
        Cancel
      </button>
    </form>
  );
}
