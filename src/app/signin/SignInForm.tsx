'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Sign-in form, hosted as a full page at /signin. Two states:
 *
 *   idle  — the form (email + optional shirt number)
 *   sent  — confirmation: "check your email"
 *
 * Reads ?n= from the URL to pre-fill the shirt number when arriving
 * from a kid page's Claim card.
 */
export function SignInForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [shirtNumber, setShirtNumber] = useState<string>('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Pre-fill shirt number from ?n= if the page was opened from /[N].
  useEffect(() => {
    const n = params.get('n');
    if (n && /^\d+$/.test(n)) {
      setShirtNumber(n);
    }
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || state === 'sending') return;
    const trimmed = shirtNumber.trim();
    const n = trimmed ? parseInt(trimmed, 10) : undefined;
    if (trimmed && (!Number.isFinite(n) || (n as number) < 1)) {
      setState('error');
      setErrorMessage('That doesn’t look like a shirt number.');
      return;
    }
    setState('sending');
    setErrorMessage('');
    try {
      const res = await fetch('/api/sponsor/recover/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n ? { email, shirtNumber: n } : { email }),
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

  if (state === 'sent') {
    return (
      <div className="bg-white border border-[#e8e0d4] p-7 md:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-2">
          Check your email
        </p>
        <h1
          className="text-3xl md:text-4xl text-[#0d0d0d] mb-3 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Link sent.
        </h1>
        <p className="text-[#555] text-base leading-relaxed mb-2">
          Open the email and tap the button. You&rsquo;ll be signed in
          on this device for 30 days.
        </p>
        <p className="text-sm text-[#888] leading-relaxed mb-5">
          Link expires in 30 minutes.
        </p>
        <p className="text-sm text-[#888] leading-relaxed">
          Not showing up after a minute? Email{' '}
          <a
            href="mailto:Kevin@beanumber.org"
            className="text-[#D4A843] hover:underline font-bold"
          >
            Kevin@beanumber.org
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e8e0d4] p-7 md:p-9">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-2">
        Sign in
      </p>
      <h1
        className="text-3xl md:text-4xl text-[#0d0d0d] mb-3 leading-tight"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
      >
        Sign in to your view.
      </h1>
      <p className="text-[#555] text-base leading-relaxed mb-6">
        Enter your email. We&rsquo;ll send a one-tap link. Tap it and
        you&rsquo;re in.
      </p>

      <form onSubmit={submit}>
        <label className="block mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[#0d0d0d] mb-1.5 block">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            className="w-full px-3 py-3 bg-white border border-[#e8e0d4] text-[#0d0d0d] placeholder:text-[#bbb] text-base focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors"
            disabled={state === 'sending'}
          />
        </label>

        <label className="block mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-[#0d0d0d] mb-1.5 block">
            Shirt number{' '}
            <span className="text-[#888] font-normal normal-case tracking-normal">
              (optional)
            </span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={shirtNumber}
            onChange={e => setShirtNumber(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 38"
            min={1}
            className="w-full px-3 py-3 bg-white border border-[#e8e0d4] text-[#0d0d0d] placeholder:text-[#bbb] text-base focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors"
            disabled={state === 'sending'}
          />
          <span className="text-xs text-[#888] mt-1.5 block">
            Skip it if you&rsquo;re a returning sponsor &mdash;
            we&rsquo;ll find you by email.
          </span>
        </label>

        <button
          type="submit"
          disabled={!email || state === 'sending'}
          className="w-full px-5 py-3.5 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] font-bold text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
        >
          {state === 'sending' ? 'Sending…' : 'Send link'}
        </button>

        {state === 'error' && (
          <p className="text-sm text-[#c0392b] mt-3">{errorMessage}</p>
        )}

        <p className="text-xs text-[#888] mt-5 leading-relaxed text-center">
          Stuck? Email{' '}
          <a
            href="mailto:Kevin@beanumber.org"
            className="text-[#D4A843] hover:underline font-bold"
          >
            Kevin@beanumber.org
          </a>
          .
        </p>
      </form>
    </div>
  );
}
