/**
 * Client picker for Student of the Month.
 *
 * Renders the roster as a clickable photo grid. Two top cards
 * surface the current state:
 *   - Published winner for the current month (gold)
 *   - Simon's pending pick (red, admin sees Approve button)
 *
 * Clicking a card calls /api/admin/sotm with the right action for
 * the viewer's role:
 *   - Simon → nominate
 *   - Kevin → approve (direct award)
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PickerKid {
  shirtNumber: number;
  displayName: string;
  photoUrl: string | null;
  studentOfMonth: string;
  pendingSOTMMonth: string;
}

export function SOTMPicker({
  kids,
  role,
  month,
  publishedShirtNumber,
  pendingShirtNumber,
}: {
  kids: PickerKid[];
  role: 'admin' | 'simon';
  month: string;
  publishedShirtNumber: number | undefined;
  pendingShirtNumber: number | undefined;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(shirtNumber: number) {
    if (busy !== null) return;
    setBusy(shirtNumber);
    setError(null);
    try {
      const res = await fetch('/api/admin/sotm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: role === 'simon' ? 'nominate' : 'approve',
          shirtNumber,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pick failed.');
    } finally {
      setBusy(null);
    }
  }

  async function approveSimon() {
    if (typeof pendingShirtNumber !== 'number') return;
    await pick(pendingShirtNumber);
  }

  async function clearAward() {
    if (busy !== null) return;
    if (!confirm('Clear the current Student of the Month? The badge will disappear from the public profile.')) {
      return;
    }
    setBusy('clear');
    setError(null);
    try {
      const res = await fetch('/api/admin/sotm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed.');
    } finally {
      setBusy(null);
    }
  }

  const publishedKid = kids.find(k => k.shirtNumber === publishedShirtNumber);
  const pendingKid = kids.find(k => k.shirtNumber === pendingShirtNumber);

  return (
    <div>
      {/* Status row — current published + pending picks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {publishedKid ? (
          <div className="bg-[#D4A843]/10 border border-[#D4A843] px-4 py-3 flex items-center gap-3">
            {publishedKid.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={publishedKid.photoUrl}
                alt=""
                className="w-12 h-14 object-cover flex-shrink-0"
              />
            ) : (
              <span className="w-12 h-14 bg-[#f5f0e8] flex items-center justify-center text-xl opacity-30 flex-shrink-0">
                👤
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#D4A843]">
                ★ Current winner · {publishedKid.studentOfMonth}
              </p>
              <p className="text-sm font-semibold text-[#0d0d0d] truncate">
                {publishedKid.displayName}
              </p>
            </div>
            {role === 'admin' && (
              <button
                type="button"
                onClick={clearAward}
                disabled={busy !== null}
                className="text-xs text-[#888] hover:text-red-700 underline flex-shrink-0 disabled:opacity-50"
              >
                {busy === 'clear' ? 'Clearing…' : 'Clear'}
              </button>
            )}
          </div>
        ) : (
          <div className="border border-dashed border-[#e8e0d4] px-4 py-3 text-sm text-[#888]">
            No current winner. {role === 'admin' ? 'Pick a kid below.' : 'Nominate a kid below and Kevin will approve.'}
          </div>
        )}

        {pendingKid ? (
          <div className="bg-red-50 border border-red-300 px-4 py-3 flex items-center gap-3">
            {pendingKid.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pendingKid.photoUrl}
                alt=""
                className="w-12 h-14 object-cover flex-shrink-0"
              />
            ) : (
              <span className="w-12 h-14 bg-[#f5f0e8] flex items-center justify-center text-xl opacity-30 flex-shrink-0">
                👤
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-red-700">
                {role === 'simon' ? 'Your pick · waiting for Kevin' : "Simon's pick · " + pendingKid.pendingSOTMMonth}
              </p>
              <p className="text-sm font-semibold text-[#0d0d0d] truncate">
                {pendingKid.displayName}
              </p>
            </div>
            {role === 'admin' && (
              <button
                type="button"
                onClick={approveSimon}
                disabled={busy !== null}
                className="bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] text-xs font-bold uppercase tracking-wider px-3 py-2 flex-shrink-0 disabled:opacity-50"
              >
                {busy === pendingShirtNumber ? 'Approving…' : 'Approve'}
              </button>
            )}
          </div>
        ) : (
          <div className="border border-dashed border-[#e8e0d4] px-4 py-3 text-sm text-[#888]">
            {role === 'simon'
              ? 'No pending pick yet. Tap a kid below to nominate.'
              : 'Simon hasn’t picked anyone yet — you can pick directly below.'}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {kids.map(kid => {
          const isPublished = kid.shirtNumber === publishedShirtNumber;
          const isPending = kid.shirtNumber === pendingShirtNumber;
          const isBusy = busy === kid.shirtNumber;
          const borderCls = isPublished
            ? 'border-[#D4A843] ring-2 ring-[#D4A843]/20'
            : isPending
              ? 'border-red-400 ring-2 ring-red-100'
              : 'border-[#e8e0d4] hover:border-[#D4A843]';
          return (
            <button
              type="button"
              key={kid.shirtNumber}
              onClick={() => pick(kid.shirtNumber)}
              disabled={busy !== null}
              className={`relative block bg-white border ${borderCls} text-left transition-colors overflow-hidden disabled:opacity-50`}
            >
              <div className="aspect-[4/5] bg-[#f5f0e8] relative">
                {kid.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={kid.photoUrl} alt={kid.displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl opacity-30">👤</span>
                  </div>
                )}
                {isPublished && (
                  <span
                    className="absolute top-2 right-2 inline-flex items-center justify-center bg-[#D4A843] text-[#0d0d0d] w-7 h-7 text-base font-bold"
                    title="Current Student of the Month"
                    aria-hidden
                  >
                    ★
                  </span>
                )}
                {isPending && !isPublished && (
                  <span
                    className="absolute top-2 right-2 inline-flex items-center justify-center bg-red-500 text-white w-7 h-7 text-base font-bold"
                    title="Pending pick"
                    aria-hidden
                  >
                    ★
                  </span>
                )}
                {isBusy && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs uppercase tracking-wider text-[#666]">
                    {role === 'simon' ? 'Nominating…' : 'Approving…'}
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <p
                  className="text-sm text-[#0d0d0d] leading-snug truncate"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  {kid.displayName}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
