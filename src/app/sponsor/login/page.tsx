'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BANNavigationClient as BANNavigation } from '@/components/BANNavigationClient';
import { BANFooter } from '@/components/BANFooter';

export default function SponsorLogin() {
  const [email, setEmail] = useState('');
  const [sponsorCode, setSponsorCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/sponsor/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sponsorCode }),
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || `Login failed (${response.status})`);
        setIsLoading(false);
        return;
      }

      if (!data?.sponsorCode) {
        setError('Login succeeded but no sponsor code returned from server.');
        setIsLoading(false);
        return;
      }

      window.location.href = `/sponsor/${encodeURIComponent(data.sponsorCode)}`;
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to verify. Please check your email and sponsor code.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col">
      <BANNavigation currentPath="/sponsor/login" />

      <main className="flex-1 flex items-center justify-center px-4 py-12 md:py-20">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
              Sponsor Portal
            </p>
            <h1
              className="text-3xl md:text-4xl text-[#0d0d0d] mb-3"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Welcome back.
            </h1>
            <p className="text-[#666] leading-relaxed max-w-sm mx-auto">
              Log in to see updates, photos, and letters from the child you sponsor.
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white border border-[#e8e0d4] p-8 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-[#FFF8F0] border border-[#D4A843] text-[#0d0d0d] px-4 py-3 text-sm leading-relaxed">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold uppercase tracking-[0.15em] text-[#888] mb-2"
                >
                  Email address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-[#e8e0d4] bg-white text-[#0d0d0d] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="sponsorCode"
                  className="block text-xs font-bold uppercase tracking-[0.15em] text-[#888] mb-2"
                >
                  Sponsor code
                </label>
                <input
                  type="text"
                  id="sponsorCode"
                  value={sponsorCode}
                  onChange={(e) => setSponsorCode(e.target.value.toUpperCase())}
                  required
                  className="w-full px-4 py-3 border border-[#e8e0d4] bg-white text-[#0d0d0d] font-mono tracking-wider focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors"
                  placeholder="BAN-2026-001"
                  pattern="BAN-[0-9]{4}-[0-9]{3}"
                />
                <p className="mt-2 text-xs text-[#aaa]">
                  Format: BAN-YYYY-XXX. This was in your confirmation email.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-3 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm tracking-[0.05em] hover:bg-[#c49a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'VERIFYING...' : 'LOG IN'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#e8e0d4]">
              <p className="text-sm text-[#888] text-center">
                Can&rsquo;t find your code?{' '}
                <a
                  href="mailto:kevin@beanumber.org"
                  className="text-[#D4A843] font-medium hover:underline"
                >
                  Email Kevin
                </a>{' '}
                and he&rsquo;ll get it to you.
              </p>
            </div>
          </div>

          {/* What is this */}
          <div className="mt-6 bg-white border border-[#e8e0d4] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D4A843] mb-2">
              What is a sponsor code?
            </p>
            <p className="text-sm text-[#666] leading-relaxed">
              Your sponsor code was sent to you when you started sponsoring a child.
              It&rsquo;s how we connect you to your child&rsquo;s updates, photos,
              and letters from the campus.
            </p>
          </div>

          {/* Not a sponsor yet */}
          <p className="text-center text-sm text-[#aaa] mt-8">
            Not a sponsor yet?{' '}
            <Link href="/sponsorship" className="text-[#D4A843] font-medium hover:underline">
              Meet the kids.
            </Link>
          </p>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
