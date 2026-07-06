'use client';

/**
 * Simon's + Kevin's client-side queue for sponsor notes.
 *
 * Each row has:
 *   - Kid photo + name + shirt number (context anchor)
 *   - Sponsor identity + created-at timestamp
 *   - Original English body (read-only pull-quote)
 *   - Translation textarea (grows with content, autosaves on blur)
 *   - Simon's notes textarea (internal)
 *   - Buttons: Save translation · Mark delivered · Decline
 *
 * All state changes go through PATCH /api/admin/messages/[id]. On
 * success we mutate the local state in place — no page reload, no
 * re-fetch. On error we surface a small inline banner.
 */

import { useState, useCallback } from 'react';
import Image from 'next/image';

interface MessageRow {
  id: string;
  sponsorEmail: string;
  sponsorName: string | null;
  direction: string;
  bodyEn: string;
  bodyTranslated: string | null;
  status: string;
  simonNotes: string | null;
  createdAt: string | null;
  translatedAt: string | null;
  deliveredAt: string | null;
  declinedAt: string | null;
  kid: {
    recordId: string | null;
    firstName: string | null;
    displayName: string | null;
    shirtNumber: number | null;
    photoUrl: string | null;
  };
}

export function MessagesQueue({
  initialMessages,
  role,
}: {
  initialMessages: MessageRow[];
  role: 'admin' | 'simon';
}) {
  const [messages, setMessages] = useState(initialMessages);

  const patch = useCallback(
    async (
      id: string,
      body: {
        action: 'translate' | 'deliver' | 'decline' | 'edit-notes';
        bodyTranslated?: string;
        simonNotes?: string;
        notifySponsor?: boolean;
      }
    ) => {
      const res = await fetch(`/api/admin/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false as const, error: data.error || 'Request failed.' };
      }
      return { ok: true as const, status: data.status };
    },
    []
  );

  const mutateLocal = useCallback(
    (id: string, updates: Partial<MessageRow>) => {
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...updates } : m)));
    },
    []
  );

  return (
    <div className="space-y-6">
      {messages.map(m => (
        <MessageCard
          key={m.id}
          message={m}
          role={role}
          onPatch={patch}
          onLocalUpdate={mutateLocal}
        />
      ))}
    </div>
  );
}

function MessageCard({
  message,
  role: _role,
  onPatch,
  onLocalUpdate,
}: {
  message: MessageRow;
  role: 'admin' | 'simon';
  onPatch: (
    id: string,
    body: {
      action: 'translate' | 'deliver' | 'decline' | 'edit-notes';
      bodyTranslated?: string;
      simonNotes?: string;
      notifySponsor?: boolean;
    }
  ) => Promise<
    { ok: true; status: string } | { ok: false; error: string }
  >;
  onLocalUpdate: (id: string, updates: Partial<MessageRow>) => void;
}) {
  const [translation, setTranslation] = useState(message.bodyTranslated || '');
  const [notes, setNotes] = useState(message.simonNotes || '');
  const [saving, setSaving] = useState<
    'translate' | 'deliver' | 'decline' | 'notes' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(
    message.status === 'delivered' || message.status === 'declined'
  );

  async function saveTranslation() {
    if (translation.trim().length < 3) {
      setError('Translation is required and must be at least a few characters.');
      return;
    }
    setSaving('translate');
    setError(null);
    const res = await onPatch(message.id, {
      action: 'translate',
      bodyTranslated: translation.trim(),
      simonNotes: notes,
    });
    setSaving(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLocalUpdate(message.id, {
      status: res.status,
      bodyTranslated: translation.trim(),
      simonNotes: notes,
      translatedAt: new Date().toISOString(),
    });
  }

  async function markDelivered() {
    if (
      !confirm(
        `Mark this note as delivered to ${message.kid.firstName ?? 'the kid'}? The sponsor gets an email letting them know.`
      )
    ) {
      return;
    }
    setSaving('deliver');
    setError(null);
    const res = await onPatch(message.id, {
      action: 'deliver',
      simonNotes: notes,
    });
    setSaving(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLocalUpdate(message.id, {
      status: 'delivered',
      simonNotes: notes,
      deliveredAt: new Date().toISOString(),
    });
    setCollapsed(true);
  }

  async function decline() {
    const reason = prompt(
      "What's wrong with this note? Kevin will use your notes to draft the sponsor's explanation. (Optional — hit Cancel to skip.)"
    );
    if (reason === null) return;
    const nextNotes = reason ? `${notes}\n\nDecline reason: ${reason}`.trim() : notes;
    setSaving('decline');
    setError(null);
    const res = await onPatch(message.id, {
      action: 'decline',
      simonNotes: nextNotes,
    });
    setSaving(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLocalUpdate(message.id, {
      status: 'declined',
      simonNotes: nextNotes,
      declinedAt: new Date().toISOString(),
    });
    setCollapsed(true);
  }

  async function saveNotesOnly() {
    if (notes === (message.simonNotes || '')) return; // no diff
    setSaving('notes');
    setError(null);
    const res = await onPatch(message.id, {
      action: 'edit-notes',
      simonNotes: notes,
    });
    setSaving(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLocalUpdate(message.id, { simonNotes: notes });
  }

  const statusPill = statusPillFor(message.status);
  const created = message.createdAt
    ? new Date(message.createdAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

  return (
    <article className="bg-white border border-[#e8e0d4]">
      {/* Header row */}
      <div className="flex items-start gap-4 p-4 md:p-5 border-b border-[#e8e0d4]">
        {message.kid.photoUrl ? (
          <div className="w-14 h-16 md:w-16 md:h-20 relative flex-shrink-0 bg-[#f5f0e8]">
            <Image
              src={message.kid.photoUrl}
              alt={message.kid.firstName ?? 'kid'}
              fill
              sizes="80px"
              className="object-cover object-[center_top]"
            />
          </div>
        ) : (
          <div className="w-14 h-16 md:w-16 md:h-20 flex-shrink-0 bg-[#f5f0e8] flex items-center justify-center text-2xl opacity-30">
            👤
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-xs text-[#888] tabular-nums">
              #{message.kid.shirtNumber ?? '—'}
            </p>
            <p
              className="text-lg text-[#0d0d0d] leading-tight truncate"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {message.kid.firstName ?? 'Unknown kid'}
            </p>
            {statusPill}
          </div>
          <p className="text-xs text-[#666] leading-relaxed">
            From{' '}
            <strong className="text-[#0d0d0d]">
              {message.sponsorName || message.sponsorEmail}
            </strong>{' '}
            &middot; {created}
          </p>
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] transition-colors flex-shrink-0"
          >
            Open
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="p-4 md:p-5 space-y-5">
          {/* Original body */}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
              Sponsor wrote
            </p>
            <blockquote
              className="text-[15px] text-[#333] leading-relaxed italic bg-[#FFF8F0] border-l-2 border-[#D4A843] pl-4 py-2"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {message.bodyEn}
            </blockquote>
          </div>

          {/* Translation */}
          <div>
            <label
              htmlFor={`translation-${message.id}`}
              className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2"
            >
              Translation (for the kid)
            </label>
            <textarea
              id={`translation-${message.id}`}
              value={translation}
              onChange={e => setTranslation(e.target.value)}
              disabled={message.status === 'delivered' || message.status === 'declined'}
              rows={4}
              className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base disabled:bg-[#f5f0e8] disabled:opacity-70"
              placeholder="Type your translation here…"
              style={{ fontFamily: 'Georgia, serif' }}
            />
          </div>

          {/* Simon's notes */}
          <div>
            <label
              htmlFor={`notes-${message.id}`}
              className="block text-xs font-bold uppercase tracking-[0.2em] text-[#888] mb-2"
            >
              Your notes (internal, not sent)
            </label>
            <textarea
              id={`notes-${message.id}`}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotesOnly}
              rows={2}
              className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-sm"
              placeholder="Anything to remember for the delivery / follow-up…"
            />
          </div>

          {error && (
            <p className="text-sm text-[#c0392b] leading-relaxed">{error}</p>
          )}

          {/* Actions */}
          {message.status !== 'delivered' && message.status !== 'declined' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveTranslation}
                disabled={saving !== null}
                className="inline-block bg-white border border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] disabled:opacity-50 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                {saving === 'translate' ? 'Saving…' : 'Save translation'}
              </button>
              <button
                type="button"
                onClick={markDelivered}
                disabled={saving !== null}
                className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] disabled:opacity-50 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                {saving === 'deliver' ? 'Sending…' : 'Mark delivered'}
              </button>
              <button
                type="button"
                onClick={decline}
                disabled={saving !== null}
                className="inline-block bg-white border border-[#c0392b] text-[#c0392b] hover:bg-[#c0392b] hover:text-white disabled:opacity-50 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ml-auto"
              >
                {saving === 'decline' ? 'Working…' : 'Decline'}
              </button>
            </div>
          )}

          {/* Post-delivery / post-decline state footer */}
          {message.status === 'delivered' && message.deliveredAt && (
            <p className="text-xs text-[#666] italic">
              Delivered{' '}
              {new Date(message.deliveredAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
              .
            </p>
          )}
          {message.status === 'declined' && message.declinedAt && (
            <p className="text-xs text-[#c0392b] italic">
              Declined{' '}
              {new Date(message.declinedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
              .
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function statusPillFor(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: {
      label: 'Pending',
      cls: 'bg-[#c0392b] text-white',
    },
    translated: {
      label: 'Ready to deliver',
      cls: 'bg-[#D4A843] text-[#0d0d0d]',
    },
    delivered: {
      label: 'Delivered',
      cls: 'bg-[#e8e0d4] text-[#0d0d0d]',
    },
    declined: {
      label: 'Declined',
      cls: 'bg-[#f5f0e8] text-[#c0392b] border border-[#c0392b]/40',
    },
  };
  const s = map[status] || { label: status, cls: 'bg-[#e8e0d4] text-[#0d0d0d]' };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
