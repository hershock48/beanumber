/**
 * Admin login — single password field. One entry per device per ~30 days.
 *
 * On submit, POSTs the password to /api/admin/auth. On success, the
 * server sets the HMAC-signed admin_session cookie and we bounce to
 * either the `next` query param (if the middleware redirected here
 * from a protected route) or `/admin`.
 *
 * Mobile-first: full-screen single field, 16px+ font, native iOS
 * keyboard, big submit button.
 */
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/Logo';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/admin';

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-focus the field on mount so Kevin's straight into typing.
  useEffect(() => {
    const input = document.getElementById('admin-password');
    if (input) input.focus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Wrong password');
      }
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Logo />
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
            Admin
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="admin-password"
              className="block text-sm font-semibold text-[#0d0d0d] mb-2"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 text-base bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843]"
              disabled={submitting}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password || submitting}
            className="w-full py-4 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm uppercase tracking-wider hover:bg-[#c49a3a] transition-colors disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-xs text-[#aaa] text-center pt-2 leading-relaxed">
            Signed in for 30 days on this device.
          </p>
        </form>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
