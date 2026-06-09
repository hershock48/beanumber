'use client';

import { useState } from 'react';

/**
 * Sign-in card on /[number] for visitors who aren't already
 * authenticated for this kid. Handles two cases via one form,
 * server-side:
 *
 *   1. SIGN-IN. The visitor already owns this number — they're an
 *      existing Sponsor (Active monthly) or Holder (shirt-only). They
 *      enter their email and get a one-tap link to land back in their
 *      authenticated view.
 *
 *   2. CLAIM. The visitor wears the shirt with this number but no
 *      Sponsorship row exists for them yet. The server creates a
 *      Status=Holder row tying their email to this number, then sends
 *      the same magic link. Clicking it makes the number theirs.
 *
 * Visual hierarchy: this card sits ABOVE the monthly sponsor CTA on
 * the kid page. The two cards read as separate decisions — identity
 * (free, no commitment) vs. monthly sponsorship ($25/mo ongoing).
 * Different surface treatments enforce that:
 *
 *   - This card: dark charcoal background, white text, neutral
 *     border. Reads as a system / identity action.
 *   - Sponsor CTA below: gold-bordered cream card, $25 in gold
 *     serif. Reads as the brand commitment moment.
 *
 * Privacy: the success message is identical whether the email was
 * matched, claimable, or already taken. No info leaked.
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

  // ─── COLLAPSED: identity prompt ───
  if (!expanded) {
    return (
      <div className="bg-[#1a1208] text-white p-6 md:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
          Sign in
        </p>
        <p
          className="text-2xl md:text-3xl mb-2 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Is this your number?
        </p>
        <p className="text-[#d8cfc1] text-sm md:text-base leading-relaxed mb-5">
          Sign in so we recognize you here. It&rsquo;s free &mdash; no
          payment, no password. Just confirms #{shirtNumber} is yours.
        </p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-2 bg-white hover:bg-[#f5f0e8] text-[#1a1208] text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
        >
          Email me a sign-in link &rarr;
        </button>
      </div>
    );
  }

  // ─── SENT: confirmation ───
  if (state === 'sent') {
    return (
      <div className="bg-[#1a1208] text-white p-6 md:p-7 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
          Check your email
        </p>
        <p
          className="text-xl md:text-2xl mb-3 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          A one-tap link is on its way.
        </p>
        <p className="text-[#d8cfc1] text-sm leading-relaxed">
          Click it to open #{shirtNumber}&rsquo;s page already signed in.
          The link expires in 30 minutes.
        </p>
        <p className="text-xs text-[#a89e8d] leading-relaxed mt-3">
          Nothing showing up? Email{' '}
          <a href="mailto:Kevin@beanumber.org" className="text-[#D4A843] hover:underline">
            Kevin@beanumber.org
          </a>{' '}
          and I&rsquo;ll get you in.
        </p>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setState('idle');
            setEmail('');
          }}
          className="mt-4 text-xs text-[#a89e8d] hover:text-white underline transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // ─── EXPANDED: email form ───
  return (
    <form
      onSubmit={submit}
      className="bg-[#1a1208] text-white p-6 md:p-7"
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
        Sign in to #{shirtNumber}
      </p>
      <p
        className="text-2xl md:text-3xl mb-3 leading-tight"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
      >
        What&rsquo;s your email?
      </p>
      <p className="text-[#d8cfc1] text-sm leading-relaxed mb-5">
        We&rsquo;ll send a one-tap link. Click it and you&rsquo;re signed
        in. No payment, no password. If the number&rsquo;s open, you claim
        it; if it&rsquo;s already yours, you sign in. Same link either
        way.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="flex-1 px-3 py-3 bg-[#2a1f14] border border-[#3a2d20] text-white placeholder:text-[#7d7164] text-sm focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors"
          disabled={state === 'sending'}
        />
        <button
          type="submit"
          disabled={!email || state === 'sending'}
          className="px-5 py-3 bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
        >
          {state === 'sending' ? 'Sending…' : 'Send link'}
        </button>
      </div>
      {state === 'error' && (
        <p className="text-sm text-[#e89090] mb-2">{errorMessage}</p>
      )}
      <p className="text-xs text-[#a89e8d] leading-relaxed">
        Stuck? Email{' '}
        <a href="mailto:Kevin@beanumber.org" className="text-[#D4A843] hover:underline">
          Kevin@beanumber.org
        </a>{' '}
        and I&rsquo;ll sort it out.
      </p>
      <button
        type="button"
        onClick={() => {
          setExpanded(false);
          setEmail('');
          setState('idle');
        }}
        className="mt-3 text-xs text-[#a89e8d] hover:text-white underline transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}
