'use client';

/**
 * One pending-review card for the /admin/review queue.
 *
 * Renders the kid&rsquo;s photo + name, the Simon-edited timestamp, then
 * a diff block for each pending field showing Current → Proposed
 * with per-field Accept / Dismiss buttons. Approve-all at the top
 * fires the bulk action.
 *
 * All actions POST to /api/admin/roster/approve, then we refresh the
 * route so the queue updates with the kid removed.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { RosterKid } from '@/lib/admin/queries';

interface ReviewCardProps {
  kid: RosterKid;
  labels: Record<string, string>;
}

type FieldKey =
  | 'nameMeaning'
  | 'familyContext'
  | 'loves'
  | 'childQuote'
  | 'notes';

const FIELD_KEYS: FieldKey[] = [
  'nameMeaning',
  'familyContext',
  'loves',
  'childQuote',
  'notes',
];

export function ReviewCard({ kid, labels }: ReviewCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = FIELD_KEYS.filter(
    k => typeof kid.pendingDraft[k] === 'string'
  );

  const doApprove = async (
    action: 'approveAll' | { field: FieldKey; decision: 'accept' | 'dismiss' }
  ) => {
    setBusy(typeof action === 'string' ? 'all' : `${action.field}-${action.decision}`);
    setError(null);
    try {
      const res = await fetch('/api/admin/roster/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ shirtNumber: kid.shirtNumber, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(null);
    }
  };

  return (
    <div className="bg-white border border-[#e8e0d4]">
      {/* Header */}
      <div className="flex items-center gap-4 p-5 border-b border-[#e8e0d4]">
        <div className="w-14 h-14 bg-[#f5f0e8] overflow-hidden relative flex-shrink-0">
          {kid.photoUrl ? (
            <Image
              src={kid.photoUrl}
              alt={kid.displayName}
              fill
              sizes="56px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl opacity-30">
              👤
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D4A843]">
            #{kid.shirtNumber}
          </p>
          <p
            className="text-lg text-[#0d0d0d] leading-tight truncate"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {kid.displayName}
          </p>
          {kid.lastEditedBySimon && (
            <p className="text-xs text-[#888] mt-0.5">
              Edited {formatRelative(kid.lastEditedBySimon)}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => doApprove('approveAll')}
            disabled={busy !== null}
            className="px-4 py-2 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            {busy === 'all' ? 'Approving...' : 'Approve all'}
          </button>
          <Link
            href={`/admin/roster/${kid.shirtNumber}`}
            className="px-4 py-2 bg-white border border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors text-center"
          >
            Open editor
          </Link>
        </div>
      </div>

      {/* Diff blocks */}
      <div className="divide-y divide-[#e8e0d4]">
        {pending.length === 0 && (
          <div className="p-5 text-sm text-[#888]">
            Simon&rsquo;s flagged this kid for review but no field drafts are
            in the JSON yet. Open the editor for the full picture.
          </div>
        )}
        {pending.map(key => {
          const current = kid.publicValues[key] || '';
          const proposed = kid.pendingDraft[key] || '';
          return (
            <div key={key} className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0d0d0d] mb-3">
                {labels[key] || key}
              </p>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#888] mb-1">
                    Current
                  </p>
                  <p className="text-sm text-[#555] leading-relaxed whitespace-pre-wrap bg-[#fafafa] border border-[#eee] p-3 min-h-[60px]">
                    {current || (
                      <span className="text-[#aaa] italic">empty</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#D4A843] mb-1">
                    Simon proposes
                  </p>
                  <p className="text-sm text-[#0d0d0d] leading-relaxed whitespace-pre-wrap bg-[#FFF8F0] border border-[#D4A843]/40 p-3 min-h-[60px]">
                    {proposed || (
                      <span className="text-[#aaa] italic">empty</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => doApprove({ field: key, decision: 'accept' })}
                  disabled={busy !== null}
                  className="px-3 py-1.5 bg-[#0d0d0d] hover:bg-[#333] text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {busy === `${key}-accept` ? 'Accepting...' : 'Accept'}
                </button>
                <button
                  type="button"
                  onClick={() => doApprove({ field: key, decision: 'dismiss' })}
                  disabled={busy !== null}
                  className="px-3 py-1.5 bg-white border border-[#aaa] hover:border-[#0d0d0d] text-[#666] hover:text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {busy === `${key}-dismiss` ? 'Dismissing...' : 'Dismiss'}
                </button>
              </div>
            </div>
          );
        })}
        {error && (
          <div className="p-5 text-sm text-[#a85a3a] bg-[#fdf3ef]">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const ms = now.getTime() - d.getTime();
    const mins = Math.floor(ms / (1000 * 60));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
