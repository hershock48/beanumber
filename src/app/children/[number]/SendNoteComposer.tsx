'use client';

/**
 * SendNoteComposer — sponsor writes a short note to their kid.
 *
 * Rendered on the sponsor-gated view of /children/[N]. Simon reads
 * every note before delivery (batched weekly at the campus, typically
 * Sundays). The composer sets clear expectations: this isn't a chat
 * app, translated notes take a week, and Simon sees everything first.
 *
 * States
 * ──────
 *   idle       — the button, no textarea open
 *   composing  — textarea visible, character counter live
 *   sending    — POST in flight
 *   queued     — success message; sponsor can dismiss / write another
 *                after delivery
 *   error      — inline error text; textarea stays populated
 *
 * The client component only knows two paths — POST and reset. Server
 * enforces auth, sponsorship, rate limit, length. Client just does
 * the composing UX.
 */

import { useState, useCallback } from 'react';

const MIN_BODY = 10;
const MAX_BODY = 1000;

type Stage = 'idle' | 'composing' | 'sending' | 'queued' | 'error';

// Sponsor-attached photos (2026-07-08). Hard cap of 2 per note. The
// hard cap sits at the API layer too — this constant just gates the
// UI so the sponsor sees Add-photo disable at the ceiling instead of
// discovering it via a 400 on submit.
const MAX_ATTACHMENTS = 2;

export function SendNoteComposer({
  childRecordId,
  childIdLegacy,
  firstName,
  sponsorName,
}: {
  childRecordId: string;
  childIdLegacy: string | null;
  firstName: string;
  sponsorName?: string | null;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Public URLs of uploaded attachments, in the order the sponsor
  // added them. Also stored 1:1 in a small preview list — see the
  // JSX below. Reset on Cancel and on queued-success.
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  async function handlePhotoPick(file: File) {
    if (attachments.length >= MAX_ATTACHMENTS) {
      setError(
        `You can attach up to ${MAX_ATTACHMENTS} photos per note. Send this one and add more in your next letter.`
      );
      return;
    }
    setError(null);
    setUploadingPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const commaIdx = dataUrl.indexOf(',');
      const dataBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

      const res = await fetch('/api/sponsor/notes/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          filename: file.name || 'photo.jpg',
          contentType: file.type || 'image/jpeg',
          dataBase64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.publicUrl) {
        setError(
          data.error || 'Photo upload failed. Try a smaller file or another format.'
        );
        return;
      }
      setAttachments(prev => [...prev, String(data.publicUrl)]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not read that image.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const submit = useCallback(async () => {
    const trimmed = body.trim();
    if (trimmed.length < MIN_BODY) {
      setError(
        `Say a little more — the campus reads every one of these. (${MIN_BODY}+ characters.)`
      );
      return;
    }
    if (trimmed.length > MAX_BODY) {
      setError(`Under ${MAX_BODY} characters, please.`);
      return;
    }
    setStage('sending');
    setError(null);
    try {
      const res = await fetch('/api/sponsor/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          childRecordId,
          childIdLegacy,
          bodyEn: trimmed,
          sponsorName,
          attachments,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again in a bit.');
        setStage('composing');
        return;
      }
      setStage('queued');
    } catch {
      setError('Network hiccup. Try again in a moment.');
      setStage('composing');
    }
  }, [body, childRecordId, childIdLegacy, sponsorName, attachments]);

  const charCount = body.trim().length;
  const overCap = charCount > MAX_BODY;

  return (
    <section className="mb-10 md:mb-14 max-w-2xl mx-auto">
      {/* No inner header/label here — the outer PenpalBox already
          renders the "PENPAL / Write {firstName}. {firstName} writes
          back." section header. Duplicating it here made the sponsor
          surface show two PENPAL headings back-to-back. Just the
          descriptor + composer states below. */}
      <p className="text-center text-[#666] mb-6 md:mb-8 leading-relaxed max-w-lg mx-auto">
        The team at the campus reads every penpal note, translates it, and
        hands it to {firstName} in person. Deliveries happen in
        weekly batches, usually on a Sunday.
      </p>

      {stage === 'queued' ? (
        <div className="bg-[#f5efe4] border border-[#e8e0d4] p-6 md:p-7 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
            Off to the campus
          </p>
          <p
            className="text-xl text-[#0d0d0d] leading-snug mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Your penpal note is on its way to {firstName}.
          </p>
          <p className="text-[#555] leading-relaxed max-w-md mx-auto">
            The campus batches deliveries each Sunday, so your note
            should reach {firstName} within about a week.{' '}
            <span className="text-[#0d0d0d] font-semibold">
              We&rsquo;ll email you when your penpal writes back.
            </span>
          </p>
          <p className="text-[#888] leading-relaxed text-sm italic mt-4 max-w-md mx-auto">
            It has to travel farther than a text.{' '}
            <span className="not-italic">Worth the wait.</span>
          </p>
          <button
            type="button"
            className="mt-6 text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] transition-colors"
            onClick={() => {
              setStage('idle');
              setBody('');
              setAttachments([]);
            }}
          >
            Close
          </button>
        </div>
      ) : stage === 'idle' ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setStage('composing')}
            className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Write your penpal
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#e8e0d4] p-5 md:p-6">
          <label
            htmlFor="penpal-note"
            className="sr-only"
          >
            Penpal note to {firstName}
          </label>
          <textarea
            id="penpal-note"
            value={body}
            onChange={e => {
              setBody(e.target.value);
              if (error) setError(null);
            }}
            rows={7}
            maxLength={MAX_BODY + 200 /* soft over-cap so the character
              counter can turn red before the field hard-truncates */}
            placeholder={`Hi ${firstName}, I want you to know…`}
            disabled={stage === 'sending'}
            className="w-full px-3 py-2.5 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base leading-relaxed resize-y"
            style={{ fontFamily: 'Georgia, serif' }}
          />

          {/* Photo attachment strip. Sponsor can add up to 2 photos
              per note (2026-07-08 rollout). Kid sees the photos with
              their letter when Simon delivers, sponsor sees them in
              the thread history on this page and on /me. */}
          <div className="mt-3">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((url, i) => (
                  <div key={url + i} className="relative w-20 h-20">
                    <img
                      src={url}
                      alt={`Attachment ${i + 1}`}
                      className="block w-20 h-20 object-cover border border-[#e8e0d4] bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      disabled={stage === 'sending'}
                      aria-label="Remove photo"
                      className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-[#0d0d0d] text-white text-xs rounded-full hover:bg-[#c0392b] transition-colors disabled:opacity-50"
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachments.length < MAX_ATTACHMENTS && (
              <label
                className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] cursor-pointer transition-colors ${uploadingPhoto || stage === 'sending' ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {uploadingPhoto
                  ? 'Uploading…'
                  : attachments.length === 0
                  ? 'Add a photo (optional)'
                  : 'Add another photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploadingPhoto || stage === 'sending'}
                  onChange={e => {
                    const f = e.currentTarget.files?.[0];
                    if (f) void handlePhotoPick(f);
                    // Reset so the same file can be re-picked after a
                    // failed upload.
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            )}
            {attachments.length > 0 && (
              <p className="text-xs text-[#888] italic mt-1">
                {attachments.length} of {MAX_ATTACHMENTS} photos attached.
                Simon prints these and hands them to {firstName} with your letter.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <p
              className={`text-xs ${
                overCap ? 'text-[#c0392b] font-semibold' : 'text-[#888]'
              }`}
            >
              {charCount} / {MAX_BODY}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStage('idle');
                  setBody('');
                  setAttachments([]);
                  setError(null);
                }}
                /* uploadingPhoto guard fixes a race caught in audit:
                   sponsor picks a photo, clicks Cancel before the
                   upload resolves, then the in-flight fetch's
                   setAttachments callback re-populates the array
                   the user just cleared. Blocking the click while
                   the upload is in flight is the simplest fix. */
                disabled={stage === 'sending' || uploadingPhoto}
                className="text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] px-4 py-2 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={stage === 'sending' || uploadingPhoto || overCap}
                className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] disabled:opacity-50 disabled:cursor-not-allowed text-[#0d0d0d] px-6 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                {stage === 'sending' ? 'Sending…' : 'Send to Campus'}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-[#c0392b] mt-3 leading-relaxed">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
