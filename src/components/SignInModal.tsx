'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Site-wide sign-in modal triggered from the nav.
 *
 * Handles BOTH cases through one form, server-side:
 *
 *   1. Sign in. The visitor already owns a number (existing Sponsor
 *      or Holder) but doesn't have a session cookie. They enter their
 *      email + the number on their shirt; the server matches them
 *      against their existing Sponsorship and emails a one-tap link
 *      back into their authenticated view.
 *
 *   2. First-time claim. The visitor has a shirt but no Sponsorship
 *      row yet. Same form, same fields. Server creates a Holder row
 *      tying their email to the number, then sends the same one-tap
 *      link.
 *
 * Context-aware: if the modal is opened from /children/[N], the shirt
 * number is pre-filled from the URL. The user only types their email.
 * From any other page, they type both.
 *
 * Critical reassurance copy: existing sponsors panic that re-signing-in
 * means re-paying or re-claiming. The collapsed copy makes it explicit
 * that nothing changes — same card, same monthly, same kid.
 */
export function SignInModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [email, setEmail] = useState('');
  const [shirtNumber, setShirtNumber] = useState<string>('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Pre-fill shirt number from /children/[N] URL.
  useEffect(() => {
    if (!open) return;
    const match = pathname?.match(/^\/children\/(\d+)/);
    if (match && match[1]) {
      setShirtNumber(match[1]);
    } else {
      setShirtNumber('');
    }
  }, [open, pathname]);

  // Reset state on close.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setState('idle');
        setEmail('');
        setErrorMessage('');
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape + focus trap.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    // Lock body scroll.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || state === 'sending') return;
    // Shirt number is now OPTIONAL. If supplied, we sign in for that
    // number (or claim it if open). If blank, the server looks up the
    // email's most recent active sponsorship and lands them on that
    // kid's page. Returning sponsors don't need to remember their
    // number on a new device.
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
        body: JSON.stringify(
          n ? { email, shirtNumber: n } : { email }
        ),
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-modal-title"
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-[#1a1208] text-white w-full max-w-md p-6 md:p-8 shadow-2xl"
        style={{ animation: 'signInIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <style>{`
          @keyframes signInIn {
            0% { opacity: 0; transform: translateY(20px) scale(0.97); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#a89e8d] hover:text-white p-1.5 transition-colors"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {state === 'sent' ? (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
              Check your email
            </p>
            <p
              id="signin-modal-title"
              className="text-2xl md:text-3xl mb-3 leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              A one-tap link is on its way.
            </p>
            <p className="text-[#d8cfc1] text-sm leading-relaxed">
              Click it from any device to open your view of #{shirtNumber || 'your number'}.
              The link expires in 30 minutes.
            </p>
            <p className="text-xs text-[#a89e8d] mt-4 leading-relaxed">
              Nothing showing up after a minute? Email{' '}
              <a
                href="mailto:Kevin@beanumber.org"
                className="text-[#D4A843] hover:underline"
              >
                Kevin@beanumber.org
              </a>{' '}
              and I&rsquo;ll get you in.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 bg-white hover:bg-[#f5f0e8] text-[#1a1208] text-xs font-bold uppercase tracking-wider px-5 py-2.5 transition-colors"
            >
              Got it
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
              Sign in
            </p>
            <p
              id="signin-modal-title"
              className="text-2xl md:text-3xl mb-3 leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Welcome back.
            </p>
            <p className="text-[#d8cfc1] text-sm md:text-base leading-relaxed mb-5">
              Already sponsoring? Your card, your monthly, and your
              sponsorship stay exactly as they are. This just signs you in
              &mdash; nothing changes, nothing to enter again.
            </p>

            <label className="block mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#d8cfc1] mb-1.5 block">
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
                className="w-full px-3 py-3 bg-[#2a1f14] border border-[#3a2d20] text-white placeholder:text-[#7d7164] text-base focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors"
                disabled={state === 'sending'}
              />
            </label>

            <label className="block mb-5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#d8cfc1] mb-1.5 block">
                Your shirt number{' '}
                <span className="text-[#a89e8d] font-normal normal-case tracking-normal">
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
                className="w-full px-3 py-3 bg-[#2a1f14] border border-[#3a2d20] text-white placeholder:text-[#7d7164] text-base focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors"
                disabled={state === 'sending'}
              />
              <span className="text-xs text-[#a89e8d] mt-1.5 block">
                Leave blank if you don&rsquo;t remember &mdash; we&rsquo;ll
                find your sponsorship by email and sign you in.
              </span>
            </label>

            <button
              type="submit"
              disabled={!email || state === 'sending'}
              className="w-full px-5 py-3 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] font-bold text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>

            {state === 'error' && (
              <p className="text-sm text-[#e89090] mt-3">{errorMessage}</p>
            )}

            <p className="text-xs text-[#a89e8d] mt-5 leading-relaxed">
              New here? Same form. If #{shirtNumber || 'your number'} is still
              open when you sign in, this is how you take it.
            </p>
            <p className="text-xs text-[#a89e8d] mt-2 leading-relaxed">
              Stuck? Email{' '}
              <a
                href="mailto:Kevin@beanumber.org"
                className="text-[#D4A843] hover:underline"
              >
                Kevin@beanumber.org
              </a>{' '}
              and I&rsquo;ll sort it out.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
