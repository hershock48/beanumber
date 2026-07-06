/**
 * Admin-only reassignment block. Shown on the kid editor when:
 *   - the kid is currently at this shirt number AND
 *   - they have one or more active sponsorships
 *
 * Loads suggestions from /api/admin/roster/reassign?shirtNumber=N
 * on mount. Renders nothing if no sponsorships are linked.
 *
 * When Kevin picks a replacement candidate, POSTs the transfer.
 * On success, refreshes the page so the editor updates.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  gradeLabelForSimon,
  isGradeCode,
  type GradeCode,
} from '@/lib/grades';

interface Replacement {
  recordId: string;
  shirtNumber: number;
  displayName: string;
  photoUrl: string | null;
  gradeClass: string;
  gradeKey: string;
  sameGrade: boolean;
}

interface SponsorshipSummary {
  recordId: string;
  sponsorName: string;
  sponsorEmail: string;
  status: string;
}

interface ContextPayload {
  ok: boolean;
  kid: {
    shirtNumber: number;
    displayName: string;
    gradeLabel: string;
  };
  sponsorships: SponsorshipSummary[];
  replacements: Replacement[];
}

export function ReassignBlock({
  shirtNumber,
  firstName,
}: {
  shirtNumber: number;
  firstName: string;
}) {
  const router = useRouter();
  const [context, setContext] = useState<ContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [staging, setStaging] = useState(false);
  const [stagedNote, setStagedNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/roster/reassign?shirtNumber=${shirtNumber}`
        );
        const data = await res.json();
        if (!cancelled) {
          if (!res.ok) setError(data.error || 'Failed to load');
          else setContext(data as ContextPayload);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shirtNumber]);

  async function stageForSponsorChoice() {
    if (staging) return;
    const ok = confirm(
      `Auto-reveal a new kid for #${shirtNumber}'s sponsor${
        (context?.sponsorships.length || 0) === 1 ? '' : 's'
      }? The system will pick a replacement, transfer the Number to them, and email each sponsor a link to meet the new kid. The reveal animation fires the next time they visit /${shirtNumber}.`
    );
    if (!ok) return;
    setStaging(true);
    setError(null);
    setStagedNote(null);
    try {
      const res = await fetch('/api/admin/roster/stage-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromShirtNumber: shirtNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed: ${res.status}`);
      const replacementName = data.replacementFirstName || 'a new kid';
      setStagedNote(
        `Done. ${data.reassigned ?? data.staged ?? 0} sponsor${(data.reassigned ?? data.staged ?? 0) === 1 ? '' : 's'} re-revealed onto ${replacementName}. ${data.emailsSent || 0} email${data.emailsSent === 1 ? '' : 's'} sent.`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-reveal failed.');
    } finally {
      setStaging(false);
    }
  }

  async function reassignTo(replacement: Replacement) {
    if (busy) return;
    const ok = confirm(
      `Transfer ${context?.sponsorships.length || 0} sponsorship${
        (context?.sponsorships.length || 0) === 1 ? '' : 's'
      } from ${firstName} to ${replacement.displayName}? ` +
        `${replacement.displayName} will become the kid at shirt #${shirtNumber}. ` +
        `${firstName}'s record is preserved with the old number archived.`
    );
    if (!ok) return;
    setBusy(replacement.recordId);
    setError(null);
    try {
      const res = await fetch('/api/admin/roster/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromShirtNumber: shirtNumber,
          toReplacementRecordId: replacement.recordId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed: ${res.status}`);
      // The kid at /admin/roster/N is now the replacement, not this
      // page's kid. Bounce to the replacement's editor.
      router.push(`/admin/roster/${shirtNumber}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="border border-[#e8e0d4] bg-white p-4 text-sm text-[#888]">
        Checking for active sponsors…
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Couldn&apos;t load reassign data: {error}
      </div>
    );
  }
  if (!context || context.sponsorships.length === 0) {
    // No active sponsors — nothing to reassign. Render nothing so the
    // departed panel reads clean.
    return null;
  }

  const sponsorCount = context.sponsorships.length;
  return (
    <div className="border-2 border-[#D4A843] bg-[#FFF8F0] p-5 mt-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
        Reassign sponsorship{sponsorCount === 1 ? '' : 's'}
      </p>
      <p className="text-sm text-[#444] mb-3 leading-relaxed">
        {firstName} has {sponsorCount} active sponsor
        {sponsorCount === 1 ? '' : 's'}:{' '}
        <span className="font-semibold">
          {context.sponsorships.map(s => s.sponsorName).join(', ')}
        </span>
        . Auto-reveal picks a replacement kid (same grade when possible),
        transfers {firstName}&apos;s shirt #{shirtNumber} to the new kid, and
        emails every sponsor a link to meet them. The reveal animation
        fires on their next visit. Or pick the replacement yourself below.
      </p>

      {!picking ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={stageForSponsorChoice}
            disabled={staging}
            className="bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
          >
            {staging ? 'Auto-revealing…' : 'Auto-reveal next kid (recommended)'}
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-xs text-[#888] hover:text-[#0d0d0d] underline"
          >
            Or pick the replacement myself
          </button>
          {stagedNote && (
            <span className="text-xs text-green-700 font-semibold">
              {stagedNote}
            </span>
          )}
        </div>
      ) : (
        <div>
          <p className="text-xs text-[#666] mb-3">
            {firstName}&apos;s grade:{' '}
            <span className="font-semibold">{context.kid.gradeLabel}</span>.{' '}
            {context.replacements.length} active kid
            {context.replacements.length === 1 ? '' : 's'} on the
            roster — sponsorships pool, so pick anyone. Same-grade
            kids show first.
          </p>
          {context.replacements.length === 0 ? (
            <p className="text-sm text-red-700">
              No active kids on the roster. Add a new kid via the
              roster, then come back.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {context.replacements.map(r => (
                <button
                  type="button"
                  key={r.recordId}
                  onClick={() => reassignTo(r)}
                  disabled={!!busy}
                  className={`block bg-white border ${
                    r.sameGrade ? 'border-[#D4A843]/60' : 'border-[#e8e0d4]'
                  } hover:border-[#D4A843] text-left transition-colors disabled:opacity-50 overflow-hidden relative`}
                >
                  <div className="aspect-[4/5] bg-[#f5f0e8] relative">
                    {r.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.photoUrl}
                        alt={r.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">
                        👤
                      </div>
                    )}
                    {r.sameGrade && (
                      <span
                        className="absolute top-1 left-1 bg-[#D4A843] text-[#0d0d0d] text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                        title={`Same grade as ${firstName}`}
                      >
                        Same grade
                      </span>
                    )}
                    {busy === r.recordId && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs uppercase tracking-wider text-[#666]">
                        Transferring…
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-sm font-semibold text-[#0d0d0d] truncate">
                      {r.displayName}
                    </p>
                    <p className="text-xs text-[#888] truncate">
                      #{r.shirtNumber}
                      {r.gradeClass && isGradeCode(r.gradeClass)
                        ? ` · ${gradeLabelForSimon(r.gradeClass as GradeCode)}`
                        : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setPicking(false)}
            disabled={!!busy}
            className="mt-3 text-xs text-[#888] hover:text-[#0d0d0d] underline"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
