/**
 * Run-and-report panel for the Stripe → Postgres sync. POSTs to the
 * sync endpoint, renders the JSON report as a human-readable summary.
 * Migrated off Airtable — the endpoint now writes donors/donations
 * directly to Postgres. Header comment updated 2026-07-06 to match.
 */
'use client';

import { useState } from 'react';

interface SyncRow {
  subId: string;
  customer: string;
  email: string;
  name: string;
  amount: number;
  status: string;
  donorAction: 'created' | 'matched';
  sponsorshipAction: 'created' | 'updated' | 'claimed';
  hasChild: boolean;
}

interface SyncReport {
  stripeSubsFetched: number;
  stripeSubsByStatus: Record<string, number>;
  donors: { created: number; matched: number };
  sponsorships: { created: number; updated: number; claimed: number };
  uniqueSponsorEmails: number;
  warnings: string[];
  rows: SyncRow[];
}

function fmtMoney(d: number): string {
  return `$${d.toLocaleString('en-US', {
    minimumFractionDigits: d % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function actionPill(action: string, kind: 'donor' | 'sponsorship'): string {
  const palette: Record<string, string> = {
    created: 'bg-green-50 text-green-700 border-green-200',
    updated: 'bg-[#f5f0e8] text-[#666] border-[#e8e0d4]',
    matched: 'bg-[#f5f0e8] text-[#666] border-[#e8e0d4]',
    claimed: 'bg-amber-50 text-amber-800 border-amber-200',
  };
  return palette[action] || palette.matched;
}

export function StripeSyncClient() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSync() {
    if (running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/admin/stripe/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      setReport(data.report as SyncReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={runSync}
        disabled={running}
        className="bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] font-bold text-xs uppercase tracking-wider px-5 py-3 transition-colors disabled:opacity-50"
      >
        {running ? 'Syncing…' : 'Run sync now'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-6 space-y-6">
          {/* Top numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border border-[#e8e0d4] bg-white">
            <Stat label="Stripe subs found" value={String(report.stripeSubsFetched)} />
            <Stat
              label="Unique sponsors"
              value={String(report.uniqueSponsorEmails)}
              sub="active emails"
            />
            <Stat
              label="Donors"
              value={`${report.donors.created} new · ${report.donors.matched} matched`}
            />
            <Stat
              label="Sponsorships"
              value={`${report.sponsorships.created} new · ${report.sponsorships.claimed} claimed · ${report.sponsorships.updated} updated`}
            />
          </div>

          {/* Status breakdown */}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
              Stripe statuses
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.stripeSubsByStatus).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 bg-[#f5f0e8] border border-[#e8e0d4] text-xs px-2 py-1 text-[#666]"
                >
                  <span className="font-semibold text-[#0d0d0d]">{v}</span>
                  {k}
                </span>
              ))}
            </div>
          </div>

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-red-700 mb-2">
                Warnings ({report.warnings.length})
              </p>
              <ul className="text-sm text-red-700 space-y-1">
                {report.warnings.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-row breakdown */}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
              Each subscription
            </p>
            <ul className="space-y-1">
              {report.rows.map(row => (
                <li
                  key={row.subId}
                  className="flex items-center gap-2 flex-wrap border border-[#e8e0d4] bg-white px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-[#0d0d0d] flex-1 min-w-0 truncate">
                    {row.name}
                  </span>
                  <span className="text-[#666] truncate">{row.email}</span>
                  <span className="text-[#0d0d0d] font-semibold tabular-nums">
                    {fmtMoney(row.amount)}/mo
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 ${
                      row.status === 'active' || row.status === 'trialing'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-[#f5f0e8] text-[#666] border-[#e8e0d4]'
                    }`}
                  >
                    {row.status}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 ${actionPill(
                      row.donorAction,
                      'donor'
                    )}`}
                  >
                    donor {row.donorAction}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 ${actionPill(
                      row.sponsorshipAction,
                      'sponsorship'
                    )}`}
                  >
                    sponsorship {row.sponsorshipAction}
                  </span>
                  {!row.hasChild && (
                    <span className="text-[10px] uppercase tracking-wider border px-1.5 py-0.5 bg-red-50 text-red-700 border-red-200">
                      No kid linked
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="p-3 border-r border-b border-[#e8e0d4] last:border-r-0 md:border-b-0">
      <p className="text-[10px] uppercase tracking-[0.15em] text-[#aaa] mb-1">
        {label}
      </p>
      <p className="text-sm font-bold text-[#0d0d0d]">{value}</p>
      {sub && <p className="text-xs text-[#888] mt-0.5">{sub}</p>}
    </div>
  );
}
