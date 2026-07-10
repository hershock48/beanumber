'use client';

/**
 * Simon's + Kevin's client-side queue for penpal notes.
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

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { attachmentKind, attachmentTypeLabel } from '@/lib/attachments';

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
  /**
   * Sponsor-attached photos (2026-07-08). Normalized to a plain
   * string[] server-side (see page.tsx normalizeAttachments). Simon
   * uses these to print + include with the delivered letter.
   */
  attachments: string[];
  /**
   * Sponsor's handwritten letter photo (2026-07-10). When set, Simon
   * prints the scan and delivers the sponsor's own handwriting
   * directly — no translation step needed. Rendered as the primary
   * body of the card in place of the text pull-quote, and the
   * translation textarea is disabled since there's nothing to
   * translate.
   */
  letterImageUrl: string | null;
  /**
   * Kevin's personalized decline note (2026-07-10). Populated only
   * when action='kevin_decline' fired on this row. Shown inline on
   * declined cards so Kevin can remember what he told the sponsor.
   */
  kevinDeclineNote: string | null;
  kid: {
    recordId: string | null;
    firstName: string | null;
    displayName: string | null;
    shirtNumber: number | null;
    photoUrl: string | null;
  };
  /**
   * When the kid has replied to this sponsor-to-kid note, the reply
   * lives on this field. Null until Simon records the reply via the
   * inline composer on the delivered-message card.
   */
  reply: {
    id: string;
    bodyEn: string;
    bodyOriginal: string | null;
    /** Scanned handwritten reply photo URL (2026-07-08 workflow).
     *  Null on legacy typed-only replies. */
    imageUrl: string | null;
    deliveredAt: string | null;
    createdAt: string | null;
    /** Non-null = the sponsor-notification email actually dispatched
     *  at this time. Null = notification never fired or the send
     *  failed silently. Drives the queue's "Emailed" vs "Email
     *  pending — resend?" state on the reply block. */
    sponsorNotifiedAt: string | null;
  } | null;
}

export function MessagesQueue({
  initialMessages,
  role,
}: {
  initialMessages: MessageRow[];
  role: 'admin' | 'simon';
}) {
  const [messages, setMessages] = useState(initialMessages);
  // Hide delivered + declined items from the working view by default.
  // Kevin's queue is a "what needs attention" board; anything already
  // done just adds clutter. Small "Show N done" affordance below the
  // action list lets him peek at history without leaving the page.
  const [hideDone, setHideDone] = useState(true);

  const doneCount = messages.filter(
    m => m.status === 'delivered' || m.status === 'declined'
  ).length;
  const visibleMessages = hideDone
    ? messages.filter(m => m.status !== 'delivered' && m.status !== 'declined')
    : messages;

  const patch = useCallback(
    async (
      id: string,
      body: {
        action:
          | 'translate'
          | 'deliver'
          | 'decline'
          | 'edit-notes'
          | 'kevin_approve'
          | 'kevin_decline';
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
    <div>
      {doneCount > 0 && (
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-[#888]">
            {visibleMessages.length}{' '}
            {visibleMessages.length === 1 ? 'note' : 'notes'} waiting on you
            {hideDone && doneCount > 0 && (
              <span className="ml-2 text-[#aaa]">
                &middot; {doneCount} done, hidden
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setHideDone(v => !v)}
            className="text-xs font-bold uppercase tracking-[0.15em] text-[#D4A843] hover:text-[#c49a3a] transition-colors"
          >
            {hideDone ? `Show ${doneCount} done` : 'Hide done'}
          </button>
        </div>
      )}
      <div className="space-y-6">
        {visibleMessages.length === 0 ? (
          <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-8 md:p-12 text-center">
            <p className="text-[#666] leading-relaxed">
              Nothing pending. All caught up.
            </p>
          </div>
        ) : (
          visibleMessages.map(m => (
            <MessageCard
              key={m.id}
              message={m}
              role={role}
              onPatch={patch}
              onLocalUpdate={mutateLocal}
            />
          ))
        )}
      </div>
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
      action:
        | 'translate'
        | 'deliver'
        | 'decline'
        | 'edit-notes'
        | 'kevin_approve'
        | 'kevin_decline';
      bodyTranslated?: string;
      simonNotes?: string;
      notifySponsor?: boolean;
      kevinDeclineNote?: string;
    }
  ) => Promise<
    { ok: true; status: string } | { ok: false; error: string }
  >;
  onLocalUpdate: (id: string, updates: Partial<MessageRow>) => void;
}) {
  const [translation, setTranslation] = useState(message.bodyTranslated || '');
  const [notes, setNotes] = useState(message.simonNotes || '');
  const [saving, setSaving] = useState<
    | 'translate'
    | 'deliver'
    | 'decline'
    | 'notes'
    | 'kevin_approve'
    | 'kevin_decline'
    | null
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
    persistedNotesRef.current = notes;
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
    // If Simon has edits to the translation textarea that weren't
    // saved via 'Save translation', include them in the deliver
    // PATCH so the server-side deliver gate passes and the delivered
    // row carries the freshest translation. Server accepts
    // bodyTranslated on the deliver action for exactly this case.
    const localTranslation = translation.trim();
    const hasLocalEdits =
      localTranslation.length > 0 &&
      localTranslation !== (message.bodyTranslated ?? '').trim();
    const res = await onPatch(message.id, {
      action: 'deliver',
      simonNotes: notes,
      ...(hasLocalEdits ? { bodyTranslated: localTranslation } : {}),
    });
    setSaving(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    persistedNotesRef.current = notes;
    onLocalUpdate(message.id, {
      status: 'delivered',
      simonNotes: notes,
      // Reflect the save-and-deliver in local state so a reopened
      // collapsed card shows the translation Simon just delivered.
      ...(hasLocalEdits
        ? {
            bodyTranslated: localTranslation,
            translatedAt: new Date().toISOString(),
          }
        : {}),
      deliveredAt: new Date().toISOString(),
    });
    setCollapsed(true);
  }

  // Kevin's approve — flips awaiting_kevin → pending. Simon then
  // sees the note in his queue. Non-interactive (no prompt) because
  // approval is meant to be one click.
  async function kevinApprove() {
    setSaving('kevin_approve');
    setError(null);
    const res = await onPatch(message.id, { action: 'kevin_approve' });
    setSaving(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLocalUpdate(message.id, { status: 'pending' });
  }

  // Kevin's decline — flips awaiting_kevin → declined and captures
  // Kevin's personalized note, which lands in the sponsor's decline
  // email verbatim. Prompt copy makes it clear the sponsor will see
  // exactly what Kevin types (not a static template).
  async function kevinDecline() {
    const note = prompt(
      "Type a note for the sponsor. They'll see exactly what you write here in the decline email. Keep it short and warm — 1-3 sentences works. Cancel to abort."
    );
    if (note === null) return;
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      if (
        !confirm(
          "Send the decline without a personal note? The sponsor gets the generic template instead."
        )
      ) {
        return;
      }
    }
    setSaving('kevin_decline');
    setError(null);
    const res = await onPatch(message.id, {
      action: 'kevin_decline',
      kevinDeclineNote: trimmed.length > 0 ? trimmed : undefined,
    });
    setSaving(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLocalUpdate(message.id, {
      status: 'declined',
      declinedAt: new Date().toISOString(),
      kevinDeclineNote: trimmed.length > 0 ? trimmed : null,
    });
    setCollapsed(true);
  }

  // NOTE 2026-07-10: the Decline button that called this was removed
  // from the actions row (see ~line 665). Kevin's call: campus team
  // doesn't decline penpal notes, every letter ships. The function
  // is kept in place because if the "Escalate to Kevin" middle-path
  // ever lands, the wiring is already here — just re-add a button
  // that calls this. For now: unreachable from the UI.
  async function decline() {
    // The decline endpoint auto-sends a static template email to
    // the sponsor — it does NOT include this reason. Anything typed
    // here is stored on simon_notes for admin reference only.
    // Prompt copy reflects that so Simon doesn't think it's being
    // used to personalize the sponsor's explanation.
    const reason = prompt(
      "Anything to note internally? Kevin can reference this if the sponsor asks — the sponsor's decline email is a static template and won't include what you type here. (Optional — hit Cancel to skip.)"
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
    persistedNotesRef.current = nextNotes;
    setNotes(nextNotes);
    onLocalUpdate(message.id, {
      status: 'declined',
      simonNotes: nextNotes,
      declinedAt: new Date().toISOString(),
    });
    setCollapsed(true);
  }

  // Autosave notes after a short debounce so Simon doesn't lose
  // typing progress if he closes the tab or navigates away. Also
  // fires on blur (via onBlur handler) as an immediate save when
  // the user leaves the textarea. Both paths deduplicate on the
  // no-diff guard.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const persistedNotesRef = useRef(message.simonNotes || '');

  const saveNotesOnly = useCallback(async () => {
    const current = notesRef.current;
    if (current === persistedNotesRef.current) return;
    setSaving('notes');
    setError(null);
    const res = await onPatch(message.id, {
      action: 'edit-notes',
      simonNotes: current,
    });
    setSaving(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    persistedNotesRef.current = current;
    onLocalUpdate(message.id, { simonNotes: current });
  }, [message.id, onPatch, onLocalUpdate]);

  // Debounced autosave: schedule a save 1.5s after the last
  // keystroke. Reset the timer on every change.
  useEffect(() => {
    if (notes === persistedNotesRef.current) return;
    const t = setTimeout(() => {
      saveNotesOnly();
    }, 1500);
    return () => clearTimeout(t);
  }, [notes, saveNotesOnly]);

  // Warn before unloading the tab if notes have unsaved changes.
  // Belt-and-suspenders alongside the debounced save — protects
  // against Simon closing quickly after typing.
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (notesRef.current !== persistedNotesRef.current) {
        e.preventDefault();
        // Modern browsers ignore the returnValue string but still
        // trigger the native "leave site?" prompt when it's set.
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

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
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Print button — for typed notes, opens the print-friendly
              /print route where PrintTrigger auto-fires the browser
              print dialog on load. For handwritten letters, opens
              the scan URL directly since /print would render an empty
              body — the browser's built-in image/PDF viewer prints
              the scan just fine. */}
          <a
            href={
              message.letterImageUrl
                ? message.letterImageUrl
                : `/admin/messages/${message.id}/print`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-[#D4A843] hover:text-[#c49a3a] transition-colors border border-[#D4A843] px-3 py-1.5"
            title={
              message.letterImageUrl
                ? 'Open the handwritten scan (ready to print)'
                : 'Open a print-friendly view of this note'
            }
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </a>
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] transition-colors"
            >
              Open
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 md:p-5 space-y-5">
          {/* Original body */}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
              {message.letterImageUrl
                ? 'Handwritten letter — print and deliver'
                : 'Penpal note'}
            </p>
            {message.letterImageUrl ? (
              /* Sponsor uploaded a handwritten letter photo
                 (2026-07-10). The scan IS the letter — print it and
                 walk it to the kid. No translation step needed.
                 Same document-card treatment we built for PDF/DOC
                 kid replies: inline <img> for image types, document
                 card with filename + open link for PDF/DOC. */
              attachmentKind(message.letterImageUrl) === 'image' ? (
                <a
                  href={message.letterImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  title="Open the scan in a new tab (ready to print)"
                >
                  <img
                    src={message.letterImageUrl}
                    alt={`Handwritten letter from ${message.sponsorName || message.sponsorEmail}`}
                    loading="lazy"
                    className="block max-h-96 w-auto max-w-full border border-[#e8e0d4] bg-white"
                  />
                </a>
              ) : (
                <a
                  href={message.letterImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 border border-[#e8e0d4] bg-white p-3 hover:bg-[#FFF8F0] transition-colors"
                  title="Open the letter in a new tab (ready to print)"
                >
                  <div className="w-10 h-12 bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#D4A843]" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#0d0d0d]">
                      {attachmentTypeLabel(attachmentKind(message.letterImageUrl))} — open to print
                    </p>
                    <p className="text-xs text-[#666] truncate">
                      {message.letterImageUrl.split('/').pop() || 'file'}
                    </p>
                  </div>
                </a>
              )
            ) : (
              <blockquote
                className="text-[15px] text-[#333] leading-relaxed italic bg-[#FFF8F0] border-l-2 border-[#D4A843] pl-4 py-2"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                {message.bodyEn}
              </blockquote>
            )}
            {/* Sponsor attachments (2026-07-08). When the sponsor
                clipped photos onto their note, Simon needs to see +
                print them so they land at the campus with the
                delivered letter. Click a thumbnail to open full-size
                in a new tab (ready for print / download). */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d0d0d] mb-2">
                  Sponsor sent {message.attachments.length}{' '}
                  {message.attachments.length === 1 ? 'photo' : 'photos'} to print
                </p>
                <div className="flex flex-wrap gap-2">
                  {message.attachments.map((url, i) => (
                    <a
                      key={url + i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                      title="Open full size (print or download)"
                    >
                      <img
                        src={url}
                        alt={`Sponsor photo ${i + 1}`}
                        loading="lazy"
                        className="block h-28 w-auto max-w-full border border-[#e8e0d4] bg-white object-cover"
                      />
                    </a>
                  ))}
                </div>
                <p className="text-xs text-[#888] italic mt-2">
                  Click to open full size. Print and include with the delivered letter.
                </p>
              </div>
            )}
          </div>

          {/* Translation — hidden entirely on handwritten letters
              since Simon just prints the scan and delivers it. No
              translation step, no textarea. Save Translation button
              below auto-relaxes because the deliver-gate accepts an
              empty translation when letterImageUrl is present. */}
          {message.letterImageUrl ? (
            <div className="text-xs text-[#666] italic bg-[#FFF8F0] border border-[#e8e0d4] p-3 leading-relaxed">
              No translation needed — this is a handwritten letter.
              Print the scan above and hand it to{' '}
              {message.kid.firstName ?? 'the kid'} as-is.
            </div>
          ) : (
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
          )}

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

          {/* Actions — Kevin approval layer split (2026-07-10):
              - awaiting_kevin: Kevin sees Approve / Decline. Simon's
                translate + deliver buttons don't render — the note
                isn't his to touch yet.
              - pending / translated: Simon's normal workflow. */}
          {message.status === 'awaiting_kevin' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={kevinApprove}
                disabled={saving !== null}
                className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                {saving === 'kevin_approve'
                  ? 'Approving…'
                  : 'Approve — send to campus'}
              </button>
              <button
                type="button"
                onClick={kevinDecline}
                disabled={saving !== null}
                className="inline-block bg-white border border-[#c0392b] text-[#c0392b] hover:bg-[#c0392b] hover:text-white disabled:opacity-50 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ml-auto"
              >
                {saving === 'kevin_decline' ? 'Working…' : 'Decline with note'}
              </button>
            </div>
          )}
          {message.status !== 'delivered' &&
            message.status !== 'declined' &&
            message.status !== 'awaiting_kevin' && (
            <div className="flex flex-wrap gap-2">
              {/* Save Translation hidden entirely for handwritten
                  letters — there's no translation textarea to save
                  from, and clicking would return a server 400. Simon
                  goes straight to Mark Delivered on those. */}
              {!message.letterImageUrl && (
                <button
                  type="button"
                  onClick={saveTranslation}
                  disabled={saving !== null}
                  className="inline-block bg-white border border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] disabled:opacity-50 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  {saving === 'translate' ? 'Saving…' : 'Save translation'}
                </button>
              )}
              <button
                type="button"
                onClick={markDelivered}
                // Deliver is gated on a translation existing — either
                // already stored server-side or currently in the local
                // textarea. Client-side disable matches the server-side
                // check in the PATCH endpoint so Simon doesn't get an
                // error surface for a workflow he didn't complete yet.
                disabled={
                  saving !== null ||
                  (
                    !message.letterImageUrl &&
                    (translation.trim().length === 0) &&
                    !(message.bodyTranslated && message.bodyTranslated.trim().length > 0)
                  )
                }
                title={
                  !message.letterImageUrl &&
                  translation.trim().length === 0 &&
                  !(message.bodyTranslated && message.bodyTranslated.trim().length > 0)
                    ? 'Add a translation before delivering'
                    : undefined
                }
                className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                {saving === 'deliver' ? 'Sending…' : 'Mark delivered'}
              </button>
              {/* Decline button removed 2026-07-10 per Kevin: campus team
                  doesn't decline penpal notes. Every letter gets delivered.
                  If a real content issue comes up, Kevin handles it out of
                  band (email / Slack). The `decline` action handler +
                  server endpoint + enum value are kept intact so legacy
                  declined rows still render correctly and the cycle gate
                  (`!= 'declined'`) still excludes them, but the button
                  is no longer reachable from the UI. */}
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

          {/* Reply section — 2026-07-08 workflow v2. Now rendered on
              ANY non-declined status so Simon can hit Reply straight
              from pending without having to click Save Translation +
              Mark Delivered first. When Simon saves a reply, the
              parent auto-flips to 'delivered' server-side. */}
          {message.status !== 'declined' && (
            <ReplySection
              message={message}
              onLocalUpdate={onLocalUpdate}
            />
          )}
        </div>
      )}
    </article>
  );
}

function ReplySection({
  message,
  onLocalUpdate,
}: {
  message: MessageRow;
  onLocalUpdate: (id: string, updates: Partial<MessageRow>) => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyOriginal, setReplyOriginal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Scanned handwritten reply (2026-07-08 workflow, extended 2026-07-09
  // to accept PDF + Word doc in addition to images). The file is
  // uploaded first (separate endpoint) so the admin sees preview +
  // dimensions before typing the translation. Once uploaded we hold
  // the public URL in state and submit it with the reply POST.
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // "Kid wrote in English — no translation needed." When true, the
  // translation textarea is hidden and the Save button re-labels to
  // "Approve English letter." Preserves the underlying skippable-
  // translation path (empty bodyEn + photo is legal on the server)
  // but makes it discoverable — the "leave blank" hint under the
  // textarea was too subtle for anyone who wasn't hunting for it.
  const [englishLetter, setEnglishLetter] = useState(false);
  // Uploaded file kind — drives the preview branch and the button
  // label (photo/PDF/document phrasing). Resets when the upload is
  // cleared or a new one arrives.
  const uploadedKind = attachmentKind(uploadedImageUrl);

  async function handlePhotoPick(file: File) {
    // Accept images / PDFs / Word docs. Server-side whitelist enforces
    // the actual allowed types; the browser input just widens the
    // picker. Read as base64.
    setError(null);
    setUploadingPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      // Strip "data:image/xxx;base64," prefix — the server takes raw
      // base64 in a JSON field.
      const commaIdx = dataUrl.indexOf(',');
      const dataBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

      const res = await fetch(
        `/api/admin/messages/${message.id}/reply-photo`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            filename: file.name || 'reply.jpg',
            contentType: file.type || 'image/jpeg',
            dataBase64,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.publicUrl) {
        setError(
          data.error || 'Photo upload failed. Try a smaller file or another format.'
        );
        setUploadingPhoto(false);
        return;
      }
      setUploadedImageUrl(data.publicUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not read that image.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (message.reply) {
    return (
      <div className="mt-4 pt-4 border-t border-[#e8e0d4]">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
          {message.kid.firstName ?? 'The kid'} wrote back
        </p>
        {/* Scanned reply (2026-07-08 workflow, extended 2026-07-09 to
            accept PDF + Word doc). Image is the anchor for admin
            review — Simon can eyeball his own upload + translation
            together. Non-image attachments render as a document
            card since a raw <img src="foo.pdf"> would be broken. */}
        {message.reply.imageUrl ? (
          attachmentKind(message.reply.imageUrl) === 'image' ? (
            <a
              href={message.reply.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-3"
              title="Open the scan in a new tab"
            >
              <img
                src={message.reply.imageUrl}
                alt={`Scanned reply from ${message.kid.firstName ?? 'the kid'}`}
                loading="lazy"
                className="block max-h-80 w-auto max-w-full border border-[#e8e0d4] bg-white"
              />
            </a>
          ) : (
            <a
              href={message.reply.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 flex items-center gap-3 border border-[#e8e0d4] bg-white p-3 hover:bg-[#FFF8F0] transition-colors"
              title="Open the file in a new tab"
            >
              <div className="w-10 h-12 bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-[#D4A843]"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0d0d0d]">
                  {attachmentTypeLabel(attachmentKind(message.reply.imageUrl))} — open to view
                </p>
                <p className="text-xs text-[#666] truncate">
                  {message.reply.imageUrl.split('/').pop() || 'file'}
                </p>
              </div>
            </a>
          )
        ) : null}
        {message.reply.bodyEn.trim().length > 0 ? (
          <blockquote
            className="text-[15px] text-[#333] leading-relaxed italic bg-[#f5efe4] border-l-2 border-[#D4A843] pl-4 py-3"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {message.reply.bodyEn}
          </blockquote>
        ) : (
          <p className="text-xs text-[#888] italic mt-1">
            No translation typed — the kid wrote in English (see the
            scanned letter above).
          </p>
        )}
        {message.reply.bodyOriginal && (
          <details className="mt-2">
            <summary className="text-xs text-[#888] cursor-pointer hover:text-[#0d0d0d]">
              Show original transcription
            </summary>
            <p
              className="text-xs text-[#666] mt-2 italic leading-relaxed pl-4"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {message.reply.bodyOriginal}
            </p>
          </details>
        )}
        {message.reply.deliveredAt && (
          <p className="text-xs text-[#888] italic mt-2">
            Recorded{' '}
            {new Date(message.reply.deliveredAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
            .
          </p>
        )}
        {/* Notification state — shows whether the sponsor's "your
            penpal wrote back" email actually dispatched. When
            sponsorNotifiedAt is stamped we're certain the send
            landed at SendGrid. When null (silent failure inside
            the reply POST's sendEmail catch) Kevin sees a Resend
            button to retry. */}
        <ResendNotificationBlock
          replyId={message.reply.id}
          initialNotifiedAt={message.reply.sponsorNotifiedAt}
          onLocalUpdate={onLocalUpdate}
          parentMessageId={message.id}
          currentReply={message.reply}
        />
      </div>
    );
  }

  async function submitReply() {
    const trimmed = replyBody.trim();
    // Photo is required in the 2026-07-08 workflow. The kid's
    // handwritten letter IS the reply; the typed translation is
    // optional (skip when the kid wrote in English, older kids often
    // do). If Simon skipped the upload we block here rather than
    // record a translation with no scan behind it.
    if (!uploadedImageUrl) {
      setError(
        'Upload the scanned handwritten letter first.'
      );
      return;
    }
    if (trimmed.length > 0 && trimmed.length < 3) {
      setError(
        "Translation is too short — add a few characters or leave it blank if the kid wrote in English."
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/messages/${message.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          bodyEn: trimmed,
          bodyOriginal: replyOriginal.trim() || undefined,
          imageUrl: uploadedImageUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setSaving(false);
        return;
      }
      // Mirror the server-side insert into local state so the UI
      // flips to the read-only reply view without a re-fetch.
      onLocalUpdate(message.id, {
        reply: {
          id: data.id,
          bodyEn: trimmed,
          bodyOriginal: replyOriginal.trim() || null,
          imageUrl: uploadedImageUrl,
          deliveredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          // Server stamps sponsorNotifiedAt inside the reply POST on
          // successful sendEmail. We don't know client-side whether
          // it succeeded — safest to leave null and let the row re-
          // fetch on next page load resolve it. If Kevin never gets
          // a stamp, the queue will show the resend button.
          sponsorNotifiedAt: null,
        },
      });
      setSaving(false);
      setComposerOpen(false);
      setReplyBody('');
      setReplyOriginal('');
      setUploadedImageUrl(null);
    } catch {
      setError('Network hiccup. Try again.');
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#e8e0d4]">
      {composerOpen ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
            Record {message.kid.firstName ?? 'the kid'}&rsquo;s reply
          </p>

          {/* Step 1 — file upload. The 2026-07-08 workflow is:
              the kid handwrites a reply on the printed template
              and Simon uploads a scan / phone photo of the sheet.
              As of 2026-07-09 Simon can also upload a PDF (multi-
              page scan from a scanning app) or a Word doc (rare —
              typed on behalf of a kid). This block is the anchor
              of the composer — Simon can't submit without a file. */}
          <div className="mb-4 bg-[#FFF8F0] border border-[#e8e0d4] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0d0d0d] mb-2">
              1 · Scanned letter{' '}
              <span className="font-normal normal-case tracking-normal text-[#888]">
                (photo, PDF, or Word doc)
              </span>
            </p>
            {uploadedImageUrl ? (
              <div className="flex flex-col gap-2">
                {uploadedKind === 'image' ? (
                  <img
                    src={uploadedImageUrl}
                    alt="Uploaded reply preview"
                    className="block max-h-64 w-auto border border-[#e8e0d4] bg-white"
                  />
                ) : (
                  <div className="flex items-center gap-3 border border-[#e8e0d4] bg-white p-3">
                    <div className="w-10 h-12 bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-[#D4A843]"
                        aria-hidden="true"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#0d0d0d] truncate">
                        {attachmentTypeLabel(uploadedKind)} uploaded
                      </p>
                      <p className="text-xs text-[#666] truncate">
                        {uploadedImageUrl.split('/').pop() || 'file'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-3 text-xs">
                  <a
                    href={uploadedImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D4A843] font-bold hover:underline"
                  >
                    {uploadedKind === 'image' ? 'Open full size' : 'Open file'}
                  </a>
                  <button
                    type="button"
                    onClick={() => setUploadedImageUrl(null)}
                    disabled={saving || uploadingPhoto}
                    className="text-[#888] hover:text-[#c0392b] font-bold uppercase tracking-[0.1em]"
                  >
                    Replace
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <input
                  id={`reply-photo-${message.id}`}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={uploadingPhoto || saving}
                  onChange={e => {
                    const f = e.currentTarget.files?.[0];
                    if (f) void handlePhotoPick(f);
                    // Reset so the same file can be re-picked after a
                    // failed upload (browsers won't refire onChange for
                    // an identical value).
                    e.currentTarget.value = '';
                  }}
                  className="block text-sm"
                />
                <p className="text-xs text-[#888] leading-relaxed mt-2">
                  Phone camera works. JPEG / HEIC / PDF / DOCX under
                  ~15 MB. Take the picture in good light with the whole
                  sheet in frame.
                </p>
                {uploadingPhoto && (
                  <p className="text-xs text-[#0d0d0d] italic mt-2">
                    Uploading…
                  </p>
                )}
              </div>
            )}
          </div>

          {/* English-letter shortcut. When the kid already wrote in
              English, there's no translation to do — Simon just needs
              to approve the scan and notify the sponsor. Toggling this
              hides the translation textarea + relabels the Save button.
              The path always worked (blank bodyEn + photo is a valid
              server submit); this control makes it discoverable. */}
          <label className="flex items-start gap-2 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={englishLetter}
              onChange={e => {
                setEnglishLetter(e.target.checked);
                if (e.target.checked) {
                  // Clear any half-typed translation so a stray
                  // character doesn't ride along on the submit.
                  setReplyBody('');
                  if (error) setError(null);
                }
              }}
              disabled={saving}
              className="mt-0.5 accent-[#D4A843]"
            />
            <span className="text-sm text-[#0d0d0d] leading-snug">
              <strong>{message.kid.firstName ?? 'The kid'} wrote in English</strong>{' '}
              <span className="text-[#666]">— no translation needed, just approve the scan.</span>
            </span>
          </label>

          {!englishLetter && (
            <>
              <label
                htmlFor={`reply-en-${message.id}`}
                className="block text-xs font-bold uppercase tracking-[0.15em] text-[#0d0d0d] mb-1"
              >
                2 · English translation
              </label>
              <textarea
                id={`reply-en-${message.id}`}
                value={replyBody}
                onChange={e => {
                  setReplyBody(e.target.value);
                  if (error) setError(null);
                }}
                rows={4}
                disabled={saving}
                className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base"
                placeholder="What did the kid say back?"
                style={{ fontFamily: 'Georgia, serif' }}
              />
              <label
                htmlFor={`reply-orig-${message.id}`}
                className="block text-xs font-bold uppercase tracking-[0.15em] text-[#0d0d0d] mb-1 mt-4"
              >
                3 · Original transcription <span className="font-normal normal-case tracking-normal text-[#888]">(optional — Acholi, Luo, etc.)</span>
              </label>
              <textarea
                id={`reply-orig-${message.id}`}
                value={replyOriginal}
                onChange={e => setReplyOriginal(e.target.value)}
                rows={2}
                disabled={saving}
                className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-sm"
                placeholder="Kept for audit — sponsor sees this on request."
                style={{ fontFamily: 'Georgia, serif' }}
              />
            </>
          )}
          {error && (
            <p className="text-sm text-[#c0392b] mt-2 leading-relaxed">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={submitReply}
              disabled={
                saving ||
                uploadingPhoto ||
                !uploadedImageUrl ||
                // Translation is optional, but if there IS text it
                // must be at least 3 chars (accidental "ok" submits
                // are the failure mode here). Empty translation +
                // photo alone is a valid submit. When englishLetter
                // is on we already forced replyBody to '' so this
                // check is a no-op — kept for defensive symmetry.
                (replyBody.trim().length > 0 && replyBody.trim().length < 3)
              }
              className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              {saving
                ? 'Sending…'
                : englishLetter
                  ? 'Approve English letter & notify sponsor'
                  : 'Save & notify sponsor'}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false);
                setReplyBody('');
                setReplyOriginal('');
                setUploadedImageUrl(null);
                setEnglishLetter(false);
                setError(null);
              }}
              disabled={saving}
              className="text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] px-4 py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-[#666] italic">
            No reply on file yet.
          </p>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-block bg-white border border-[#0d0d0d] hover:bg-[#0d0d0d] hover:text-white text-[#0d0d0d] px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Record their reply
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Small state block that shows "Sponsor was emailed [date]" when the
 * reply POST's sendEmail succeeded, or "Email pending — resend" +
 * button when it didn't. The resend button hits the resend endpoint,
 * which fires a fresh email and stamps sponsorNotifiedAt. On success
 * we mutate local state so the block flips to the emailed variant
 * without a full page reload.
 */
function ResendNotificationBlock({
  replyId,
  initialNotifiedAt,
  onLocalUpdate,
  parentMessageId,
  currentReply,
}: {
  replyId: string;
  initialNotifiedAt: string | null;
  onLocalUpdate: (id: string, updates: Partial<MessageRow>) => void;
  parentMessageId: string;
  currentReply: NonNullable<MessageRow['reply']>;
}) {
  const [notifiedAt, setNotifiedAt] = useState(initialNotifiedAt);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/messages/${replyId}/resend-notification`,
        {
          method: 'POST',
          credentials: 'same-origin',
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Resend failed. Try again in a moment.');
        setSending(false);
        return;
      }
      const nextIso = data.notifiedAt || new Date().toISOString();
      setNotifiedAt(nextIso);
      onLocalUpdate(parentMessageId, {
        reply: { ...currentReply, sponsorNotifiedAt: nextIso },
      });
      if (data.warning) setError(data.warning);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Network hiccup. Try again.'
      );
    } finally {
      setSending(false);
    }
  }

  if (notifiedAt) {
    return (
      <p className="text-xs text-[#666] mt-1 flex items-center gap-2">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#4a8b3a] flex-shrink-0"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Sponsor was emailed{' '}
        {new Date(notifiedAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
        .
      </p>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap">
      <p className="text-xs text-[#c0392b] italic flex items-center gap-2">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Email not confirmed — no timestamp on file.
      </p>
      <button
        type="button"
        onClick={resend}
        disabled={sending}
        className="text-xs font-bold uppercase tracking-[0.15em] text-[#D4A843] hover:text-[#c49a3a] disabled:opacity-50 border border-[#D4A843] px-3 py-1.5 transition-colors"
      >
        {sending ? 'Sending…' : 'Resend notification'}
      </button>
      {error && (
        <p className="text-xs text-[#c0392b] w-full mt-1">{error}</p>
      )}
    </div>
  );
}

function statusPillFor(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    awaiting_kevin: {
      label: 'Awaiting Kevin',
      cls: 'bg-[#0d0d0d] text-[#D4A843]',
    },
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
