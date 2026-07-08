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
          {/* Print button — new window with the print-friendly view;
              PrintTrigger inside the /print route auto-fires the
              browser print dialog on load. Available on every card. */}
          <a
            href={`/admin/messages/${message.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#D4A843] transition-colors"
            title="Open a print-friendly view of this note"
          >
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
              Penpal note
            </p>
            <blockquote
              className="text-[15px] text-[#333] leading-relaxed italic bg-[#FFF8F0] border-l-2 border-[#D4A843] pl-4 py-2"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {message.bodyEn}
            </blockquote>
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
                // Deliver is gated on a translation existing — either
                // already stored server-side or currently in the local
                // textarea. Client-side disable matches the server-side
                // check in the PATCH endpoint so Simon doesn't get an
                // error surface for a workflow he didn't complete yet.
                disabled={
                  saving !== null ||
                  (
                    (translation.trim().length === 0) &&
                    !(message.bodyTranslated && message.bodyTranslated.trim().length > 0)
                  )
                }
                title={
                  translation.trim().length === 0 &&
                  !(message.bodyTranslated && message.bodyTranslated.trim().length > 0)
                    ? 'Add a translation before delivering'
                    : undefined
                }
                className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
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
  // Scanned handwritten reply (2026-07-08 workflow). The photo is
  // uploaded first (separate endpoint) so the admin sees preview +
  // dimensions before typing the translation. Once uploaded we hold
  // the public URL in state and submit it with the reply POST.
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  async function handlePhotoPick(file: File) {
    // Accept anything image/* the browser identifies; server-side
    // whitelist enforces the actual allowed types. Read as base64.
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
        {/* Scanned handwritten reply (2026-07-08 workflow). Photo
            is the anchor for the admin review — Simon can eyeball
            his own upload + translation together. On the sponsor's
            kid page this same photo renders full-width above the
            translation caption; here the admin view is compact so
            the photo is capped at a preview height. */}
        {message.reply.imageUrl ? (
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
            . Sponsor was emailed.
          </p>
        )}
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

          {/* Step 1 — photo upload. The 2026-07-08 workflow is:
              the kid handwrites a reply on the printed template
              and Simon uploads a scan / phone photo of the sheet.
              This block is the anchor of the composer — Simon
              can't submit without a photo. */}
          <div className="mb-4 bg-[#FFF8F0] border border-[#e8e0d4] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0d0d0d] mb-2">
              1 · Scanned handwritten letter
            </p>
            {uploadedImageUrl ? (
              <div className="flex flex-col gap-2">
                <img
                  src={uploadedImageUrl}
                  alt="Uploaded reply preview"
                  className="block max-h-64 w-auto border border-[#e8e0d4] bg-white"
                />
                <div className="flex flex-wrap gap-3 text-xs">
                  <a
                    href={uploadedImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D4A843] font-bold hover:underline"
                  >
                    Open full size
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
                  accept="image/*"
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
                  Phone camera works. JPEG or HEIC preferred, under ~7 MB.
                  Take the picture in good light with the whole sheet in
                  frame.
                </p>
                {uploadingPhoto && (
                  <p className="text-xs text-[#0d0d0d] italic mt-2">
                    Uploading…
                  </p>
                )}
              </div>
            )}
          </div>

          <label
            htmlFor={`reply-en-${message.id}`}
            className="block text-xs font-bold uppercase tracking-[0.15em] text-[#0d0d0d] mb-1"
          >
            2 · English translation{' '}
            <span className="font-normal normal-case tracking-normal text-[#888]">
              (leave blank if the kid already wrote in English)
            </span>
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
                // photo alone is a valid submit.
                (replyBody.trim().length > 0 && replyBody.trim().length < 3)
              }
              className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              {saving ? 'Sending…' : 'Save & notify sponsor'}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false);
                setReplyBody('');
                setReplyOriginal('');
                setUploadedImageUrl(null);
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
