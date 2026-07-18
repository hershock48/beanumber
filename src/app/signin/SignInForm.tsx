'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Sign-in form, hosted as a full page at /signin. Three states:
 *
 *   idle    — the form (email + optional shirt number)
 *   sending — awaiting the send-link response
 *   sent    — confirmation: "check your email" + resend affordance
 *
 * The 'sent' state carries a Resend button gated by a client-side
 * cooldown that matches the server's throttle window. The server
 * silently succeeds during throttle, so the cooldown is really a UX
 * guardrail — it stops users from mashing the button when the email
 * is just taking a minute to arrive.
 *
 * Reads ?n= from the URL to pre-fill the shirt number when arriving
 * from a kid page's Claim card.
 */
const RESEND_COOLDOWN_SECONDS = 25;

export function SignInForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [shirtNumber, setShirtNumber] = useState<string>('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resends, setResends] = useState(0);
  const cooldownTimerRef = useRef<number | null>(null);

  // Contextual headline. /me bounces here with reason=your-kids when
  // someone taps 'Your kids' in the nav without a session. Other
  // redirects can pass their own reason. Magic-link callback failures
  // pass error=expired or error=unavailable.
  const reason = params.get('reason') || undefined;
  const errorParam = params.get('error') || undefined;

  // Pre-fill shirt number from ?n= if the page was opened from /[N].
  useEffect(() => {
    const n = params.get('n');
    if (n && /^\d+$/.test(n)) {
      setShirtNumber(n);
    }
  }, [params]);

  // Cooldown timer — ticks down once per second. Runs only while
  // active so it doesn't leak render cycles on the idle form.
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownTimerRef.current = window.setTimeout(() => {
      setCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => {
      if (cooldownTimerRef.current !== null) {
        window.clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [cooldown]);

  const send = useCallback(async () => {
    if (!email) return;
    const trimmed = shirtNumber.trim();
    const n = trimmed ? parseInt(trimmed, 10) : undefined;
    if (trimmed && (!Number.isFinite(n) || (n as number) < 1)) {
      setState('error');
      setErrorMessage('That doesn’t look like a Shirt Number.');
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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setState('error');
        setErrorMessage(data?.error || 'Could not send link. Try again.');
        return;
      }
      // The one non-silent branch: this number is already linked to a
      // different email. Telling the user beats sending them to watch
      // an inbox where nothing will ever arrive — the most common
      // cause is a typo'd purchase email or a spouse's address.
      if (data?.code === 'number_claimed') {
        setState('error');
        setErrorMessage(
          `#${n} is already linked to a different email. If that could be you, try the email you used when you got the shirt. Stuck? Email Kevin@beanumber.org and I'll sort it out.`
        );
        return;
      }
      setState('sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setState('error');
      setErrorMessage(err?.message || 'Network error. Try again.');
    }
  }, [email, shirtNumber]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    await send();
  }

  async function resend() {
    if (cooldown > 0 || state === 'sending') return;
    setResends(r => r + 1);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    // Keep the 'sent' state — we don't want to hop back to 'sending'
    // and hide the confirmation text. Fire-and-forget; the server
    // returns success regardless of throttle.
    try {
      const trimmed = shirtNumber.trim();
      const n = trimmed ? parseInt(trimmed, 10) : undefined;
      await fetch('/api/sponsor/recover/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n ? { email, shirtNumber: n } : { email }),
      });
    } catch {
      // Silent — the cooldown UI is the only thing that needs to
      // stay honest. If the network is out, resend fails silently
      // and the user can try again after the cooldown.
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
          Link sent to {email}.
        </h1>
        <p className="text-[#555] text-base leading-relaxed mb-2">
          Open the email and tap the button. This device will remember
          you from then on. Link is good for 24 hours.
        </p>
        {/* Escape hatch for typo&rsquo;d emails. Without this a user who
            mistyped had to refresh to get back to the form. */}
        <p className="text-sm text-[#888] mb-4">
          Wrong email?{' '}
          <button
            type="button"
            onClick={() => {
              setState('idle');
              setResends(0);
              setCooldown(0);
            }}
            className="text-[#D4A843] hover:underline font-bold"
          >
            Edit it
          </button>
          .
        </p>

        {/* Spam-folder hint. Deliverability WILL fail for a fraction
            of sends no matter what we do; the user needs to know
            without having to ask. */}
        <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-4 mb-5">
          <p className="text-sm text-[#555] leading-relaxed">
            <span className="font-bold text-[#0d0d0d]">Not seeing it?</span>{' '}
            Check your spam folder. Sometimes the first email from us
            lands there — mark it as safe and future links won&rsquo;t.
          </p>
        </div>

        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="w-full px-5 py-3 border-2 border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] font-bold text-sm uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#0d0d0d]"
        >
          {cooldown > 0
            ? `Resend in ${cooldown}s`
            : resends > 0
            ? 'Send another'
            : 'Resend'}
        </button>

        {resends > 0 && (
          <p className="text-xs text-[#888] mt-3 text-center leading-relaxed">
            Sent again. If the first one shows up too, either link works.
          </p>
        )}

        <p className="text-xs text-[#888] mt-5 leading-relaxed text-center">
          Still stuck? Email{' '}
          <a
            href="mailto:Kevin@beanumber.org"
            className="text-[#D4A843] hover:underline font-bold"
          >
            Kevin@beanumber.org
          </a>{' '}
          and I&rsquo;ll sort it out personally.
        </p>
      </div>
    );
  }

  // Headline + body adapt to context. /me bounces here for unsigned
  // users → make it obvious why they're here. Magic-link callback
  // failures → acknowledge the failure.
  //
  // The ?n= arrival gets CLAIM language, not sign-in language. The
  // realistic person landing here with a number is a shirt holder who
  // has never given us anything — a farmers-market cash buyer has no
  // account, no purchase email on file, nothing. To them "Sign in"
  // reads as "members only" and bounces exactly the person the page
  // exists for. There is no separate sign-up on Be A Number: one
  // door, and your first walk through it creates you. So the copy
  // names the action (claim the Number) and says out loud that
  // first-timers are expected.
  const arrivedWithNumber = /^\d+$/.test(params.get('n') || '');

  let headline = 'Sign in.';
  let body =
    'Enter your email. We send a one-tap link — no password to remember, no account to create. First time here? Same door: your first sign-in is your sign-up.';

  if (arrivedWithNumber) {
    headline = 'Make your Number yours.';
    body =
      "Enter your email and we'll send a one-tap link — that's the whole thing. No password, no account to create. If you've never been here before, this is how you start; if you have, it signs you back in.";
  }

  if (reason === 'your-kids') {
    headline = 'Sign in to see your kids.';
    body =
      "Enter your email. We'll send a one-tap link. Once you tap it, every kid you sponsor or hold shows up in one place.";
  } else if (errorParam === 'expired') {
    headline = 'That link expired.';
    body =
      "Links are good for 24 hours. Enter your email below and we'll send a fresh one.";
  } else if (errorParam === 'unavailable') {
    headline = 'We couldn’t find that sponsorship.';
    body =
      "Enter your email below — we'll send a one-tap link. If you're stuck, email Kevin.";
  }

  return (
    <div className="bg-white border border-[#e8e0d4] p-7 md:p-9">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-2">
        {arrivedWithNumber ? 'Claim your Number' : 'Sign in'}
      </p>
      <h1
        className="text-3xl md:text-4xl text-[#0d0d0d] mb-3 leading-tight"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
      >
        {headline}
      </h1>
      <p className="text-[#555] text-base leading-relaxed mb-6">
        {body}
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
            Shirt Number{' '}
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
            Only if you just got a shirt and want to claim the Number
            on the back. Returning sponsors can skip this.
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
