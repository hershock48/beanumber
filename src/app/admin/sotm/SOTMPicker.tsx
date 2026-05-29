/**
 * Client picker for Student of the Month.
 *
 * Two distinct flows by role:
 *
 *   Simon (nominator):
 *     - Sees the kid grid up front.
 *     - Clicks a kid → an inline reason form appears under the page
 *       header asking 'Why is <name> Student of the Month?'.
 *     - Submits → POST nominate with shirtNumber + reason → the
 *       page re-renders showing his pending pick at the top.
 *
 *   Kevin (approver):
 *     - Sees the current winner card + Simon's pending pick at the
 *       top, with the reason text visible.
 *     - Big Approve button on the pending card publishes the award.
 *     - 'Pick directly (override)' link reveals the grid; clicking
 *       a kid in that grid prompts for a reason then approves
 *       directly (bypasses Simon's nomination).
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PickerKid {
  shirtNumber: number;
  displayName: string;
  photoUrl: string | null;
  studentOfMonth: string;
  studentOfMonthReason: string;
  pendingSOTMMonth: string;
  pendingSOTMReason: string;
}

export function SOTMPicker({
  kids,
  role,
  month,
  gradeLabel,
  publishedShirtNumber,
  pendingShirtNumber,
}: {
  kids: PickerKid[];
  role: 'admin' | 'simon';
  month: string;
  /** When rendered inside a per-grade section, the grade name is
   *  passed in so the override / nomination copy can be specific
   *  ("Approving Marvin for P3 May 2026"). Optional — falls back
   *  to just the month if not supplied. */
  gradeLabel?: string;
  publishedShirtNumber: number | undefined;
  pendingShirtNumber: number | undefined;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | 'clear' | 'approve' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Track which kid Simon is in the middle of nominating (so the
  // reason form appears under the right card).
  const [nominatingShirtNumber, setNominatingShirtNumber] = useState<number | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  // For Kevin: when he clicks a kid directly (override), show a
  // small modal-ish form to capture an optional reason.
  const [overrideShirtNumber, setOverrideShirtNumber] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  // Toggle the grid visibility for Kevin (default hidden).
  const [showOverrideGrid, setShowOverrideGrid] = useState(false);

  const publishedKid = kids.find(k => k.shirtNumber === publishedShirtNumber);
  const pendingKid = kids.find(k => k.shirtNumber === pendingShirtNumber);

  function startSimonNomination(shirtNumber: number) {
    setNominatingShirtNumber(shirtNumber);
    setReasonInput('');
    setError(null);
    // Scroll the page up so the reason form is visible.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitNominate(e: React.FormEvent) {
    e.preventDefault();
    if (busy !== null || nominatingShirtNumber == null) return;
    setBusy(nominatingShirtNumber);
    setError(null);
    try {
      const res = await fetch('/api/admin/sotm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'nominate',
          shirtNumber: nominatingShirtNumber,
          reason: reasonInput.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);
      setNominatingShirtNumber(null);
      setReasonInput('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nomination failed.');
    } finally {
      setBusy(null);
    }
  }

  async function approveSimonPick() {
    if (typeof pendingShirtNumber !== 'number' || busy !== null) return;
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch('/api/admin/sotm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          shirtNumber: pendingShirtNumber,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setBusy(null);
    }
  }

  async function submitOverride(e: React.FormEvent) {
    e.preventDefault();
    if (busy !== null || overrideShirtNumber == null) return;
    setBusy(overrideShirtNumber);
    setError(null);
    try {
      const res = await fetch('/api/admin/sotm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          shirtNumber: overrideShirtNumber,
          reason: overrideReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);
      setOverrideShirtNumber(null);
      setOverrideReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setBusy(null);
    }
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

  const isSimon = role === 'simon';
  // Simon always sees the grid. Kevin sees it only when he toggles
  // the override link, OR when there's no pending pick to act on AND
  // no current winner (first time setup).
  const showGrid = isSimon || showOverrideGrid;

  return (
    <div>
      {/* Active reason form for Simon's nomination */}
      {isSimon && nominatingShirtNumber !== null && (
        <NominationForm
          kid={kids.find(k => k.shirtNumber === nominatingShirtNumber)}
          month={month}
          reason={reasonInput}
          onChange={setReasonInput}
          onCancel={() => {
            setNominatingShirtNumber(null);
            setReasonInput('');
            setError(null);
          }}
          onSubmit={submitNominate}
          busy={busy === nominatingShirtNumber}
        />
      )}

      {/* Status row — current published + pending picks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {publishedKid ? (
          <StatusCard
            tone="gold"
            label={`★ Current winner · ${publishedKid.studentOfMonth}`}
            name={publishedKid.displayName}
            photoUrl={publishedKid.photoUrl}
            reason={publishedKid.studentOfMonthReason}
            actions={
              role === 'admin' ? (
                <button
                  type="button"
                  onClick={clearAward}
                  disabled={busy !== null}
                  className="text-xs text-[#888] hover:text-red-700 underline flex-shrink-0 disabled:opacity-50"
                >
                  {busy === 'clear' ? 'Clearing…' : 'Clear award'}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="border border-dashed border-[#e8e0d4] px-4 py-3 text-sm text-[#888]">
            No current winner. {isSimon ? 'Tap a kid below to nominate one.' : 'Waiting for Simon\'s nomination.'}
          </div>
        )}

        {pendingKid ? (
          <StatusCard
            tone="red"
            label={
              isSimon
                ? `Your nomination · waiting for Kevin`
                : `Simon's nomination · ${pendingKid.pendingSOTMMonth}`
            }
            name={pendingKid.displayName}
            photoUrl={pendingKid.photoUrl}
            reason={pendingKid.pendingSOTMReason}
            actions={
              role === 'admin' ? (
                <button
                  type="button"
                  onClick={approveSimonPick}
                  disabled={busy !== null}
                  className="bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] text-xs font-bold uppercase tracking-wider px-3 py-2 flex-shrink-0 disabled:opacity-50"
                >
                  {busy === 'approve' ? 'Approving…' : 'Approve'}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="border border-dashed border-[#e8e0d4] px-4 py-3 text-sm text-[#888]">
            {isSimon
              ? 'No pending nomination yet. Tap a kid below to start one.'
              : 'No pending nomination yet — Simon hasn’t picked anyone for this month.'}
          </div>
        )}
      </div>

      {/* Kevin-only override link */}
      {role === 'admin' && !showOverrideGrid && (
        <button
          type="button"
          onClick={() => setShowOverrideGrid(true)}
          className="text-xs text-[#888] hover:text-[#0d0d0d] underline mb-4 block"
        >
          Pick directly (override Simon) →
        </button>
      )}
      {role === 'admin' && showOverrideGrid && (
        <p className="text-xs text-[#666] mb-4">
          Override mode. Clicking a kid below approves them directly,
          bypassing Simon&apos;s nomination. You&apos;ll be asked for an optional
          reason.
        </p>
      )}

      {/* Override reason modal */}
      {role === 'admin' && overrideShirtNumber !== null && (
        <form
          onSubmit={submitOverride}
          className="border border-[#D4A843] bg-[#FFF8F0] p-4 mb-6 space-y-3"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-[#D4A843]">
            Awarding{' '}
            <span className="text-[#0d0d0d]">
              {kids.find(k => k.shirtNumber === overrideShirtNumber)?.displayName}
            </span>{' '}
            directly for {month}
          </p>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
              Reason (optional)
            </span>
            <textarea
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              rows={3}
              placeholder="Why are they Student of the Month? Renders on their public profile."
              className="w-full px-3 py-2 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy !== null}
              className="bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-4 py-2 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
            >
              {busy === overrideShirtNumber ? 'Approving…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOverrideShirtNumber(null);
                setOverrideReason('');
              }}
              disabled={busy !== null}
              className="text-xs text-[#888] hover:text-[#0d0d0d] underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* Grid */}
      {showGrid && (
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
                onClick={() => {
                  if (isSimon) startSimonNomination(kid.shirtNumber);
                  else setOverrideShirtNumber(kid.shirtNumber);
                }}
                disabled={busy !== null}
                className={`relative block bg-white border ${borderCls} text-left transition-colors overflow-hidden disabled:opacity-50`}
              >
                <div className="aspect-[4/5] bg-[#f5f0e8] relative">
                  {kid.photoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
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
                      title="Pending nomination"
                      aria-hidden
                    >
                      ★
                    </span>
                  )}
                  {isBusy && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs uppercase tracking-wider text-[#666]">
                      {isSimon ? 'Selecting…' : 'Awarding…'}
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
      )}
    </div>
  );
}

function NominationForm({
  kid,
  month,
  reason,
  onChange,
  onCancel,
  onSubmit,
  busy,
}: {
  kid: PickerKid | undefined;
  month: string;
  reason: string;
  onChange: (next: string) => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="border-2 border-[#D4A843] bg-[#FFF8F0] p-5 mb-6 space-y-3"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-[#D4A843]">
        Nominating{' '}
        <span className="text-[#0d0d0d]">
          {kid?.displayName || '…'}
        </span>{' '}
        for {month}
      </p>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
          Why is this kid Student of the Month?
        </span>
        <textarea
          value={reason}
          onChange={e => onChange(e.target.value)}
          rows={4}
          placeholder="A specific reason — what they did this month, how they showed up, what their teacher said. This will appear on their public profile."
          className="w-full px-3 py-2 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
          autoFocus
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !reason.trim()}
          className="bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-5 py-3 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send nomination to Kevin'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-xs text-[#888] hover:text-[#0d0d0d] underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function StatusCard({
  tone,
  label,
  name,
  photoUrl,
  reason,
  actions,
}: {
  tone: 'gold' | 'red';
  label: string;
  name: string;
  photoUrl: string | null;
  reason?: string;
  actions?: React.ReactNode;
}) {
  const wrapper =
    tone === 'gold'
      ? 'bg-[#D4A843]/10 border border-[#D4A843]'
      : 'bg-red-50 border border-red-300';
  const labelColor = tone === 'gold' ? 'text-[#D4A843]' : 'text-red-700';
  return (
    <div className={`${wrapper} px-4 py-3 flex items-start gap-3`}>
      {photoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photoUrl}
          alt=""
          className="w-12 h-14 object-cover flex-shrink-0"
        />
      ) : (
        <span className="w-12 h-14 bg-[#f5f0e8] flex items-center justify-center text-xl opacity-30 flex-shrink-0">
          👤
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${labelColor}`}>
          {label}
        </p>
        <p className="text-sm font-semibold text-[#0d0d0d] truncate">
          {name}
        </p>
        {reason && (
          <p className="text-xs text-[#666] mt-1 leading-snug italic line-clamp-3">
            “{reason}”
          </p>
        )}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}
