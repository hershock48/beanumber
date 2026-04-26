'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { BANNavigation } from '@/components/BANNavigation';

const TRIP_COST = 3000;
const DEPOSIT = 500;
const CREDIT_PER_SPONSOR = 100;

type MemberData = {
  name: string;
  email: string;
  refCode: string;
  school: string;
  shirtsSold: number;
  sponsorCount: number;
  qualifiedSponsorCount: number;
  childNumber: number | null;
  childName: string | null;
};

type ProgressData = {
  sponsorCount: number;
  qualifiedSponsorCount: number;
  sponsorGoal: number;
  percentComplete: number;
  shirtsSold: number;
  scholarshipEarned: number;
  balanceRemaining: number;
};

type CohortLeaderboardEntry = {
  name: string;
  sponsorCount: number;
  isMe: boolean;
};

type DashboardData = {
  rep: MemberData;
  progress: ProgressData;
  referralLink: string;
  cohortLeaderboard: CohortLeaderboardEntry[];
};

export default function RepDashboardContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<'login' | 'loading' | 'dashboard' | 'error'>('login');
  const [email, setEmail] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [copied, setCopied] = useState(false);

  const loadDashboard = useCallback(async (authToken: string) => {
    setState('loading');
    try {
      const res = await fetch(`/api/rep/dashboard?token=${authToken}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load dashboard.');
      }
      setData(json);
      setState('dashboard');
    } catch (err: any) {
      setErrorMessage(err.message);
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadDashboard(token);
    }
  }, [token, loadDashboard]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginSubmitting(true);
    setLoginMessage(null);

    try {
      const res = await fetch('/api/rep/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      setLoginMessage(json.message || 'Check your email for a login link.');
    } catch {
      setLoginMessage('Something went wrong. Try again.');
    } finally {
      setLoginSubmitting(false);
    }
  }

  function copyLink() {
    if (data?.referralLink) {
      navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Login state
  if (state === 'login') {
    return (
      <div className="min-h-screen bg-[#FFF8F0]">
        <BANNavigation currentPath="/rep/dashboard" />
        <div className="max-w-md mx-auto px-5 py-24">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-4">
            Cohort Dashboard
          </p>
          <h1
            className="text-3xl text-[#0d0d0d] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Log in
          </h1>
          <p className="text-[#555] mb-8">
            Enter your email and we&apos;ll send you a login link.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors"
            />

            {loginMessage && (
              <p className="text-sm text-[#555]">{loginMessage}</p>
            )}

            <button
              type="submit"
              disabled={loginSubmitting}
              className={`w-full py-4 font-bold uppercase tracking-wider text-sm transition-colors ${
                loginSubmitting
                  ? 'bg-[#D4A843]/70 text-[#0d0d0d] cursor-wait'
                  : 'bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] cursor-pointer'
              }`}
            >
              {loginSubmitting ? 'Sending...' : 'Send Login Link'}
            </button>
          </form>

          <p className="text-center text-sm text-[#777] mt-8">
            Not in the cohort yet?{' '}
            <a href="/rep" className="text-[#D4A843] underline">Apply here</a>
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center">
        <p className="text-[#777]">Loading your dashboard...</p>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-[#FFF8F0]">
        <BANNavigation currentPath="/rep/dashboard" />
        <div className="max-w-md mx-auto px-5 py-24 text-center">
          <h1
            className="text-2xl text-[#0d0d0d] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Something went wrong
          </h1>
          <p className="text-[#555] mb-6">{errorMessage}</p>
          <a
            href="/rep/dashboard"
            className="inline-block bg-[#D4A843] text-[#0d0d0d] px-6 py-3 font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
          >
            Try Again
          </a>
        </div>
      </div>
    );
  }

  // Dashboard state
  if (!data) return null;
  const { rep, progress, referralLink, cohortLeaderboard } = data;

  const scholarshipEarned = progress.qualifiedSponsorCount * CREDIT_PER_SPONSOR;
  const balanceRemaining = Math.max(0, TRIP_COST - DEPOSIT - scholarshipEarned);

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/rep/dashboard" />

      <div className="max-w-4xl mx-auto px-5 py-12 md:py-16">
        {/* Header */}
        <div className="mb-12">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-3">
            Founding Cohort
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d]"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Hey, {rep.name.split(' ')[0]}.
          </h1>
          {rep.school && (
            <p className="text-[#777] mt-1">{rep.school}</p>
          )}
        </div>

        {/* Your child */}
        {rep.childNumber && (
          <div className="bg-white border border-[#D4A843] p-6 mb-8">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.2em] mb-2">
              Your child
            </p>
            <p
              className="text-xl text-[#0d0d0d]"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              #{rep.childNumber}{rep.childName ? ` \u2014 ${rep.childName}` : ''}
            </p>
            <a
              href={`/children/${rep.childNumber}`}
              className="text-sm text-[#D4A843] underline mt-2 inline-block"
            >
              View their profile
            </a>
          </div>
        )}

        {/* Sponsors + scholarship progress */}
        <div className="bg-white border border-[#e8e0d4] p-6 md:p-8 mb-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.2em] mb-1">
                Sponsors
              </p>
              <p className="text-3xl font-bold text-[#0d0d0d]">
                {progress.sponsorCount}
                <span className="text-lg text-[#999] font-normal"> / {progress.sponsorGoal} goal</span>
              </p>
            </div>
            <p className="text-sm text-[#777]">
              {progress.percentComplete}%
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full h-3 bg-[#f0ece4] overflow-hidden">
            <div
              className="h-full bg-[#D4A843] transition-all duration-500"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>

          <div className="flex justify-between mt-4 text-sm">
            <div>
              <span className="text-[#0d0d0d] font-semibold">{progress.sponsorCount}</span>
              <span className="text-[#777]"> total referred</span>
            </div>
            <div>
              <span className="text-[#0d0d0d] font-semibold">{progress.qualifiedSponsorCount}</span>
              <span className="text-[#777]"> qualified (3+ months)</span>
            </div>
          </div>
        </div>

        {/* Trip balance */}
        <div className="bg-white border border-[#e8e0d4] p-6 md:p-8 mb-8">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.2em] mb-4">
            Trip balance
          </p>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#777]">Trip cost</span>
              <span className="text-[#0d0d0d]">${TRIP_COST.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777]">Deposit paid</span>
              <span className="text-[#0d0d0d]">-${DEPOSIT.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777]">Scholarship earned ({progress.qualifiedSponsorCount} &times; ${CREDIT_PER_SPONSOR})</span>
              <span className="text-[#0d0d0d]">-${scholarshipEarned.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-[#f0ece4]">
              <span className="text-[#0d0d0d] font-semibold">Balance remaining</span>
              <span
                className={`text-xl ${balanceRemaining === 0 ? 'text-[#D4A843]' : 'text-[#0d0d0d]'}`}
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                ${balanceRemaining.toLocaleString()}
              </span>
            </div>
          </div>

          {balanceRemaining === 0 && (
            <div className="mt-6 bg-[#D4A843]/10 border border-[#D4A843] p-4">
              <p
                className="text-[#0d0d0d] font-semibold"
                style={{ fontFamily: 'var(--font-lora), serif' }}
              >
                Your trip is fully covered. Kevin will be in touch about the details.
              </p>
            </div>
          )}
        </div>

        {/* Referral link */}
        <div className="bg-white border border-[#e8e0d4] p-6 md:p-8 mb-8">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.2em] mb-3">
            Your referral link
          </p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="flex-1 border border-[#e8e0d4] bg-[#faf8f5] px-4 py-3 text-[#0d0d0d] text-sm font-mono"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={copyLink}
              className="px-5 py-3 bg-[#0d0d0d] text-white text-sm font-bold uppercase tracking-wider hover:bg-[#222] transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-[#999] mt-2">
            Share this link. Every sponsor who signs up through it and stays active for 3 months
            earns you ${CREDIT_PER_SPONSOR} toward the trip.
          </p>
        </div>

        {/* Cohort Leaderboard */}
        {cohortLeaderboard && cohortLeaderboard.length > 0 && (
          <div className="bg-white border border-[#e8e0d4] p-6 md:p-8">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.2em] mb-4">
              Cohort Leaderboard
            </p>

            <div className="space-y-2">
              {cohortLeaderboard.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-4 p-3 ${
                    entry.isMe ? 'bg-[#D4A843]/5 border border-[#D4A843]/30' : ''
                  }`}
                >
                  <span className="w-8 text-center text-sm font-bold text-[#999]">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${entry.isMe ? 'text-[#D4A843]' : 'text-[#0d0d0d]'}`}>
                      {entry.name}
                      {entry.isMe && <span className="text-[#999] font-normal ml-1">(you)</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#0d0d0d]">
                      {entry.sponsorCount} <span className="text-[#999] font-normal">sponsors</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
