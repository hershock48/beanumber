'use client';

/**
 * Admin · Sponsor Reveal Status
 *
 * Two-column view: who has met their child (Revealed) vs who hasn't yet
 * (Waiting to reveal). The Waiting column is the operational one — sponsors
 * who've been waiting >14 days probably had their shirt go missing in
 * shipping and need a check-in.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

interface SponsorSummary {
  id: string;
  sponsorCode: string;
  sponsorName?: string;
  sponsorEmail: string;
  childDisplayName: string;
  childId: string;
  monthlyAmount?: number;
  sponsorshipStartDate?: string;
  childRevealedAt?: string;
  daysSinceStart: number | null;
  daysSinceReveal: number | null;
}

interface RevealStatusPayload {
  revealed: SponsorSummary[];
  waiting: SponsorSummary[];
  totals: { revealed: number; waiting: number; all: number };
}

const STALE_DAYS_THRESHOLD = 14;

export default function AdminSponsorsPage() {
  // Auth handled by middleware.ts + admin session cookie.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<RevealStatusPayload | null>(null);

  const loadData = async () => {
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/sponsors/reveal-status');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${response.status}`);
      }
      const payload = await response.json();
      setData(payload.data as RevealStatusPayload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sponsor reveal status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const totals = data?.totals ?? { revealed: 0, waiting: 0, all: 0 };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-8 w-8 text-gray-900" />
            <span className="text-xl font-semibold text-gray-900">Be A Number</span>
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/admin/dashboard" className="text-gray-600 hover:text-gray-900">
              Updates Dashboard
            </Link>
            <Link href="/admin/sponsors" className="text-gray-900 font-semibold">
              Sponsors
            </Link>
            <Link href="/admin/fulfillment" className="text-gray-600 hover:text-gray-900">
              Fulfillment
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Sponsor Reveal Status</h1>
          <p className="text-gray-600">
            {totals.all} active sponsorships ·{' '}
            <span className="font-semibold text-emerald-700">{totals.revealed} revealed</span> ·{' '}
            <span className="font-semibold text-amber-700">{totals.waiting} waiting</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Waiting to reveal */}
          <section>
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Waiting to reveal{' '}
                <span className="text-sm font-normal text-gray-500">({totals.waiting})</span>
              </h2>
            </header>
            <p className="text-xs text-gray-500 mb-4">
              Shirts in flight, or possibly lost. Anyone here past {STALE_DAYS_THRESHOLD} days is
              flagged for a check-in.
            </p>

            {data && data.waiting.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
                No one is waiting — every active sponsor has met their child.
              </div>
            ) : (
              <ul className="space-y-3">
                {data?.waiting.map((s) => {
                  const isStale =
                    s.daysSinceStart !== null && s.daysSinceStart >= STALE_DAYS_THRESHOLD;
                  return (
                    <li
                      key={s.id}
                      className={`bg-white border rounded-lg p-4 ${
                        isStale ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">
                            {s.sponsorName || s.sponsorEmail}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{s.sponsorEmail}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            <span className="font-mono">{s.sponsorCode}</span>
                            {' · matched to '}
                            {s.childDisplayName}
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="text-gray-500">Started</div>
                          <div className="text-gray-900 font-semibold">
                            {formatDate(s.sponsorshipStartDate)}
                          </div>
                          {s.daysSinceStart !== null && (
                            <div
                              className={
                                isStale ? 'text-amber-700 font-bold mt-1' : 'text-gray-500 mt-1'
                              }
                            >
                              {s.daysSinceStart}d ago
                            </div>
                          )}
                        </div>
                      </div>
                      {isStale && (
                        <div className="mt-3 text-xs text-amber-800 bg-amber-100 border border-amber-200 rounded px-3 py-2">
                          ⏱ Has been waiting {s.daysSinceStart} days — consider emailing them to
                          confirm the shirt arrived.
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Revealed */}
          <section>
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Revealed{' '}
                <span className="text-sm font-normal text-gray-500">({totals.revealed})</span>
              </h2>
            </header>
            <p className="text-xs text-gray-500 mb-4">
              Sponsors who&rsquo;ve opened their shirt and met their child. Most-recent reveal
              first.
            </p>

            {data && data.revealed.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
                Nobody has revealed yet.
              </div>
            ) : (
              <ul className="space-y-3">
                {data?.revealed.map((s) => (
                  <li
                    key={s.id}
                    className="bg-white border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {s.sponsorName || s.sponsorEmail}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{s.sponsorEmail}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          <span className="font-mono">{s.sponsorCode}</span>
                          {' · supporting '}
                          {s.childDisplayName}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-gray-500">Revealed</div>
                        <div className="text-gray-900 font-semibold">
                          {formatDate(s.childRevealedAt)}
                        </div>
                        {s.daysSinceReveal !== null && (
                          <div className="text-gray-500 mt-1">{s.daysSinceReveal}d ago</div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-10 text-xs text-gray-500">
          Refresh the page to reload data.
        </div>
      </main>
    </div>
  );
}
