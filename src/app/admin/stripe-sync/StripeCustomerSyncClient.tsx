/**
 * Run-and-report panel for the Stripe → Donors customer sync. POSTs
 * to /api/admin/stripe/sync-customers, renders the JSON report.
 *
 * Use case: shirt buyers paid through Stripe Checkout but never
 * showed up as a Donor row (webhook missed them or fired pre-launch
 * of the webhook handler). This walks every charge, dedupes by
 * email, and ensures a Donor row exists in Postgres.
 */
'use client';

import { useState } from 'react';

interface CustomerSyncRow {
  customerId: string;
  email: string;
  name: string;
  totalCents: number;
  chargeCount: number;
  hasSubscription: boolean;
  donorAction: 'created' | 'matched' | 'updated';
}

interface CustomerSyncReport {
  stripeCustomersFetched: number;
  customersWithPayments: number;
  customersSkippedNoEmail: number;
  donors: { created: number; matched: number; updated: number };
  totalRevenueCents: number;
  warnings: string[];
  rows: CustomerSyncRow[];
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function pill(action: string): string {
  const palette: Record<string, string> = {
    created: 'bg-green-50 text-green-700 border-green-200',
    updated: 'bg-amber-50 text-amber-800 border-amber-200',
    matched: 'bg-[#f5f0e8] text-[#666] border-[#e8e0d4]',
  };
  return palette[action] || palette.matched;
}

export function StripeCustomerSyncClient() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<CustomerSyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSync() {
    if (running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/admin/stripe/sync-customers', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      setReport(data.report as CustomerSyncReport);
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
        {running ? 'Syncing every customer…' : 'Sync every customer now'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-6 space-y-6">
          {/* Top numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-[#e8e0d4] bg-white">
            <Stat
              label="Customers found"
              value={String(report.customersWithPayments)}
              sub="paid Stripe charges"
            />
            <Stat
              label="Skipped"
              value={String(report.customersSkippedNoEmail)}
              sub="no email on file"
            />
            <Stat
              label="Donors"
              value={`${report.donors.created} new · ${report.donors.updated} updated · ${report.donors.matched} matched`}
            />
            <Stat
              label="Total revenue"
              value={fmtMoney(report.totalRevenueCents)}
              sub="all-time, net of refunds"
            />
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
              Every customer (sorted by total spent)
            </p>
            <ul className="space-y-1">
              {report.rows.map(row => (
                <li
                  key={`${row.customerId}-${row.email}`}
                  className="flex items-center gap-2 flex-wrap border border-[#e8e0d4] bg-white px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-[#0d0d0d] flex-1 min-w-0 truncate">
                    {row.name}
                  </span>
                  <span className="text-[#666] truncate">{row.email}</span>
                  <span className="text-[#0d0d0d] font-semibold tabular-nums">
                    {fmtMoney(row.totalCents)}
                  </span>
                  <span className="text-[#888] tabular-nums">
                    {row.chargeCount} charge{row.chargeCount === 1 ? '' : 's'}
                  </span>
                  {row.hasSubscription && (
                    <span className="text-[10px] uppercase tracking-wider border px-1.5 py-0.5 bg-[#D4A843]/20 text-[#0d0d0d] border-[#D4A843]/40">
                      Sponsor
                    </span>
                  )}
                  <span
                    className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 ${pill(
                      row.donorAction
                    )}`}
                  >
                    donor {row.donorAction}
                  </span>
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
