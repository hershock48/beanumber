'use client';

import { useState } from 'react';

/**
 * Memo §2 secondary CTA on the /[number] reveal page. For visitors who
 * aren't ready to start a recurring sponsorship today, capture the
 * email and put them on the monthly newsletter so they stay in the
 * loop. No payment, no commitment, no guilt.
 */
export function NewsletterSignup({
  shirtNumber,
  firstName,
  childDisplayName,
}: {
  shirtNumber: number;
  firstName: string;
  childDisplayName: string;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/children/newsletter-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          shirtNumber,
          childDisplayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Something went wrong.');
        setState('error');
        return;
      }
      setState('success');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error.');
      setState('error');
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center text-sm text-[#555] leading-relaxed">
        <p className="font-semibold text-[#0d0d0d] mb-1">
          You&rsquo;re in.
        </p>
        <p>
          We&rsquo;ll send you monthly updates from the campus where {firstName} goes to school.
          No pressure to sponsor later — though if you change your mind, the door is open.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="text-center">
      <p className="text-sm text-[#666] leading-relaxed mb-3">
        Not ready today? Get monthly updates from {firstName}&rsquo;s campus instead. No commitment, unsubscribe anytime.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          disabled={state === 'submitting'}
          className="flex-1 px-4 py-3 text-sm text-[#0d0d0d] bg-white border border-[#e8e0d4] placeholder-[#aaa] focus:outline-none focus:border-[#D4A843] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={state === 'submitting'}
          className="px-5 py-3 bg-white text-[#0d0d0d] border border-[#0d0d0d] font-bold uppercase tracking-wider text-xs hover:bg-[#FFF8F0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {state === 'submitting' ? 'Subscribing…' : 'Send me updates'}
        </button>
      </div>
      {errorMsg && (
        <p className="text-xs text-red-600 mt-2 text-left">{errorMsg}</p>
      )}
    </form>
  );
}
