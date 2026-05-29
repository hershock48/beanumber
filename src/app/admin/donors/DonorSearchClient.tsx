/**
 * Client-side filter for the donor directory. Server hands down the
 * full list; this filters locally as Kevin types.
 */
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DonorListEntry } from '@/lib/admin/donor';

function fmtMoney(dollars: number): string {
  if (dollars === 0) return '$0';
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function DonorSearchClient({ donors }: { donors: DonorListEntry[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return donors;
    return donors.filter(d => {
      return (
        d.name.toLowerCase().includes(needle) ||
        (d.email || '').toLowerCase().includes(needle)
      );
    });
  }, [q, donors]);

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search name or email…"
        className="w-full px-3 py-2 text-base bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] mb-4"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-[#888] italic">No donors match.</p>
      ) : (
        <ul className="space-y-1">
          {filtered.map(d => (
            <li key={d.recordId}>
              <Link
                href={`/admin/donor/${d.recordId}`}
                className="flex items-center gap-3 px-3 py-2 border border-[#e8e0d4] bg-white hover:border-[#D4A843] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0d0d0d] truncate">
                    {d.name}
                    {d.recurringSupporter && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider bg-[#D4A843] text-[#0d0d0d] px-1.5 py-0.5">
                        Recurring
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#888] truncate">
                    {d.email || 'no email'}
                    {d.sponsorshipCount > 0
                      ? ` · ${d.sponsorshipCount} sponsorship${
                          d.sponsorshipCount === 1 ? '' : 's'
                        }`
                      : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-[#0d0d0d] tabular-nums">
                    {fmtMoney(d.lifetimeGiving)}
                  </p>
                  <p className="text-xs text-[#aaa]">
                    {fmtDate(d.mostRecentDonation || d.donorSince)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
