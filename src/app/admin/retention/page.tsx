'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '../_components/AdminShell';

interface CohortRow {
  cohort: string;
  startSize: number;
  counts: (number | null)[];
}

interface ActivationRow {
  cohort: string;
  shirtsPurchased: number;
  converted30d: number | null;
  converted60d: number | null;
}

interface MrrRow {
  month: string;
  mrrCents: number;
  activeSubscribers: number;
  newSubscribers: number;
  churnedSubscribers: number;
}

interface StoryCoverage {
  totalChildren: number;
  childrenWithAnyConnection: number;
  childrenWithActiveSponsor: number;
  childrenWithNoConnection: number;
  maxConnectionsOnOneChild: number;
  distribution: { bucket: string; children: number }[];
}

interface MetricsResponse {
  generatedAt: string;
  dataState: 'empty' | 'partial' | 'ready';
  totals: {
    shirtsAllTime: number;
    subscriptionsAllTime: number;
    activeSubscribers: number;
    mrrCents: number;
    mrrUsd: number;
  };
  activation: ActivationRow[];
  retention: CohortRow[];
  mrrByMonth: MrrRow[];
  storyCoverage: StoryCoverage;
  warnings: string[];
}

// The operating run-rate is a placeholder until Kevin fills it in. Stored in
// localStorage so the dashboard remembers it between sessions on this machine.
const RUN_RATE_STORAGE_KEY = 'ban:retention:monthlyRunRateUsd';

export default function RetentionDashboard() {
  // Auth handled by middleware.ts + admin session cookie.
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [runRate, setRunRate] = useState<number>(0);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(RUN_RATE_STORAGE_KEY) : null;
    if (saved) setRunRate(Number(saved) || 0);
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/retention/metrics', {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed: ${res.status}`);
      }
      const data: MetricsResponse = await res.json();
      setMetrics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }

  // Auto-load on mount.
  useEffect(() => {
    load();
  }, []);

  function saveRunRate(v: number) {
    setRunRate(v);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RUN_RATE_STORAGE_KEY, String(v));
    }
  }

  if (!metrics) {
    return (
      <AdminShell activeTab="retention">
        <div className="max-w-md mx-auto px-6 py-16">
          <div className="bg-white rounded-lg shadow-sm border border-[#e8e0d4] p-8 text-center">
            {error ? (
              <>
                <p className="text-red-600 text-sm mb-3">{error}</p>
                <button
                  onClick={() => load()}
                  className="px-4 py-2 bg-[#0d0d0d] text-white rounded-md hover:bg-[#333] transition-colors text-sm font-medium"
                >
                  Retry
                </button>
              </>
            ) : (
              <p className="text-gray-500 text-sm">{loading ? 'Loading retention metrics…' : 'Loading…'}</p>
            )}
          </div>
        </div>
      </AdminShell>
    );
  }

  const runRateCents = runRate * 100;
  const mrrPct = runRateCents > 0 ? (metrics.totals.mrrCents / runRateCents) * 100 : 0;

  return (
    <AdminShell activeTab="retention">
      <div className="max-w-6xl mx-auto px-6 py-8 bg-[#FFF8F0] min-h-[calc(100vh-64px)]">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Retention</h1>
            <p className="text-gray-600 text-sm">
              Sponsor cohorts, activation funnel, and MRR vs. operating run-rate.
              Generated {new Date(metrics.generatedAt).toLocaleString()}.
            </p>
          </div>
          <button
            onClick={() => load()}
            className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            Refresh
          </button>
        </div>

        {metrics.dataState === 'empty' && (
          <EmptyStateBanner />
        )}

        {metrics.warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-3 rounded-md mb-6 text-sm">
            <div className="font-semibold mb-1">Notices</div>
            <ul className="list-disc ml-5 space-y-1">
              {metrics.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Top-line stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Active sponsors" value={metrics.totals.activeSubscribers.toLocaleString()} />
          <StatCard label="MRR" value={`$${metrics.totals.mrrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <StatCard label="Shirts sold (all time)" value={metrics.totals.shirtsAllTime.toLocaleString()} />
          <StatCard label="Subscriptions started" value={metrics.totals.subscriptionsAllTime.toLocaleString()} />
        </div>

        {/* MRR vs run-rate */}
        <Section title="MRR vs. Operating Run-Rate" subtitle="Is our sponsor base covering the monthly cost of running YDO?">
          <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Monthly operating run-rate
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  value={runRate || ''}
                  onChange={e => saveRunRate(Number(e.target.value))}
                  placeholder="e.g. 12000"
                  className="px-3 py-2 border border-gray-300 rounded-md w-40 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <span className="text-sm text-gray-500">/ month</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Your best estimate of monthly YDO operating cost. Stored locally for this dashboard only.
              </p>
            </div>
            {runRate > 0 && (
              <div className="flex-1 bg-gray-50 rounded-md p-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {mrrPct.toFixed(0)}%
                  </span>
                  <span className="text-sm text-gray-500">of run-rate covered by MRR</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#D4A843] h-2 transition-all"
                    style={{ width: `${Math.min(mrrPct, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  ${metrics.totals.mrrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} MRR
                  {' / '}
                  ${runRate.toLocaleString()} target
                </p>
              </div>
            )}
          </div>

          <MrrTable rows={metrics.mrrByMonth} />
        </Section>

        {/* Activation funnel */}
        <Section
          title="Activation Funnel"
          subtitle="Of people who bought a shirt, how many went on to start a $25/month subscription? This is the shirt → sponsor handoff."
        >
          <ActivationTable rows={metrics.activation} />
        </Section>

        {/* Retention cohorts */}
        <Section
          title="Sponsor Retention — Cohort Curves"
          subtitle="For each month's new sponsors, what % are still actively paying N months later? M0 is 100% by definition."
        >
          <RetentionTable rows={metrics.retention} />
        </Section>

        {/* Story coverage */}
        <Section
          title="Story Coverage"
          subtitle="Internal operations view. Which featured children currently have a sponsor connection? This is for content planning — it never surfaces to sponsors."
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MiniStat label="Featured children" value={metrics.storyCoverage.totalChildren} />
            <MiniStat label="With any connection" value={metrics.storyCoverage.childrenWithAnyConnection} />
            <MiniStat label="With active sponsor" value={metrics.storyCoverage.childrenWithActiveSponsor} />
            <MiniStat label="No connection yet" value={metrics.storyCoverage.childrenWithNoConnection} />
          </div>
          <CoverageBars distribution={metrics.storyCoverage.distribution} />
          <p className="text-xs text-gray-500 mt-4">
            Children with no connections are still fully supported by the campus — this distribution just tells us whose stories need more front-end attention.
          </p>
        </Section>

      </div>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Legacy AdminNav kept inert — left in place to minimize diff. The
// page now uses the shared AdminShell instead. Safe to delete on a
// later pass once we confirm nothing else imports it.
function _LegacyAdminNav({ showLogout, onLogout }: { showLogout?: boolean; onLogout?: () => void }) {
  return (
    <nav>
      <div>
        <a href="/" />
        <div>
          <a href="/admin/dashboard">Updates</a>
          <a href="/admin/retention">Retention</a>
          <a href="/admin/fulfillment">Fulfillment</a>
          {showLogout && (
            <button onClick={onLogout}>Logout</button>
          )}
        </div>
      </div>
    </nav>
  );
}

function EmptyStateBanner() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8 mb-8 text-center">
      <div className="text-5xl mb-3 opacity-40">📊</div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">No real data yet</h2>
      <p className="text-gray-600 text-sm max-w-md mx-auto">
        No Stripe subscriptions or shirt checkouts found. This dashboard will start filling in the moment real money flows through the site. The queries are ready.
      </p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mb-5">{subtitle}</p>}
      {children}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded p-3">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function MrrTable({ rows }: { rows: MrrRow[] }) {
  if (rows.length === 0) return <EmptyPlaceholder text="No MRR history yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="py-2 pr-4">Month</th>
            <th className="py-2 pr-4">MRR</th>
            <th className="py-2 pr-4">Active</th>
            <th className="py-2 pr-4">New</th>
            <th className="py-2 pr-4">Churned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.month} className="border-b border-gray-100">
              <td className="py-2 pr-4 font-mono text-gray-700">{r.month}</td>
              <td className="py-2 pr-4 text-gray-900 font-medium">${(r.mrrCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className="py-2 pr-4 text-gray-700">{r.activeSubscribers}</td>
              <td className="py-2 pr-4 text-green-700">{r.newSubscribers > 0 ? `+${r.newSubscribers}` : '0'}</td>
              <td className="py-2 pr-4 text-red-700">{r.churnedSubscribers > 0 ? `-${r.churnedSubscribers}` : '0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivationTable({ rows }: { rows: ActivationRow[] }) {
  if (rows.length === 0) return <EmptyPlaceholder text="No shirt cohorts to show yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="py-2 pr-4">Cohort</th>
            <th className="py-2 pr-4">Shirts</th>
            <th className="py-2 pr-4">Converted by 30 days</th>
            <th className="py-2 pr-4">Converted by 60 days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.cohort} className="border-b border-gray-100">
              <td className="py-2 pr-4 font-mono text-gray-700">{r.cohort}</td>
              <td className="py-2 pr-4 text-gray-900 font-medium">{r.shirtsPurchased}</td>
              <td className="py-2 pr-4 text-gray-700">
                {r.converted30d === null ? '—' : (
                  <span>
                    {r.converted30d} <span className="text-gray-400 text-xs">({pct(r.converted30d, r.shirtsPurchased)}%)</span>
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 text-gray-700">
                {r.converted60d === null ? '—' : (
                  <span>
                    {r.converted60d} <span className="text-gray-400 text-xs">({pct(r.converted60d, r.shirtsPurchased)}%)</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-3">
        A dash means the cohort isn't old enough yet. Conversion is defined as: the shirt buyer's Stripe customer started a subscription within the window.
      </p>
    </div>
  );
}

function RetentionTable({ rows }: { rows: CohortRow[] }) {
  if (rows.length === 0) return <EmptyPlaceholder text="No sponsor cohorts to show yet." />;
  const MAX_OFFSET = 6;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="py-2 pr-4">Cohort</th>
            <th className="py-2 pr-4">Start</th>
            {Array.from({ length: MAX_OFFSET + 1 }).map((_, i) => (
              <th key={i} className="py-2 pr-4 text-center">M{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.cohort} className="border-b border-gray-100">
              <td className="py-2 pr-4 font-mono text-gray-700">{r.cohort}</td>
              <td className="py-2 pr-4 text-gray-900 font-medium">{r.startSize}</td>
              {r.counts.map((c, i) => (
                <td key={i} className="py-2 pr-4 text-center">
                  {c === null ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <RetentionCell count={c} total={r.startSize} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RetentionCell({ count, total }: { count: number; total: number }) {
  const p = total === 0 ? 0 : (count / total) * 100;
  const intensity = Math.min(1, p / 100);
  const bg = `rgba(212, 168, 67, ${0.15 + intensity * 0.6})`;
  return (
    <div className="rounded px-2 py-1 inline-block min-w-[3.5rem]" style={{ background: bg }}>
      <span className="text-gray-900 font-medium">{count}</span>
      <span className="text-gray-500 text-xs ml-1">{p.toFixed(0)}%</span>
    </div>
  );
}

function CoverageBars({ distribution }: { distribution: { bucket: string; children: number }[] }) {
  const max = Math.max(1, ...distribution.map(d => d.children));
  return (
    <div className="space-y-2">
      {distribution.map(d => (
        <div key={d.bucket} className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-500 w-10 text-right">{d.bucket}</span>
          <div className="flex-1 bg-gray-100 rounded h-6 relative overflow-hidden">
            <div
              className="bg-[#D4A843] h-full transition-all"
              style={{ width: `${(d.children / max) * 100}%` }}
            />
            <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-gray-900">
              {d.children} kids
            </span>
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-400 mt-2">Bucket = number of shirt/donation connections per child.</p>
    </div>
  );
}

function EmptyPlaceholder({ text }: { text: string }) {
  return (
    <div className="text-center text-gray-400 text-sm py-8 bg-gray-50 rounded">
      {text}
    </div>
  );
}

function pct(n: number, total: number): string {
  if (total === 0) return '0';
  return ((n / total) * 100).toFixed(0);
}
