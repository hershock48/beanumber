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
import { composerPresenceLine } from '@/lib/campus-time';

const MIN_BODY = 10;
const MAX_BODY = 1000;

/**
 * Downscale a File (browser Blob) via <canvas> and return the base64
 * of the resulting JPEG. Keeps aspect ratio, longest edge = maxDim.
 *
 * Why this exists: raw phone camera photos are routinely 4-6 MB. When
 * we base64-encode them into a JSON POST body, the request balloons
 * past Vercel's 4.5 MB serverless-body limit and the upload dies with
 * a generic error before it ever reaches the API route. Resizing to
 * 2400px @ 85% JPEG drops most phone shots to ~600 KB - 1.5 MB, well
 * under any limit, without a visible quality hit for our use case
 * (Simon prints these at postcard size; nobody needs 12 MP).
 *
 * createImageBitmap handles JPEG/PNG/WebP/GIF/BMP everywhere and HEIC
 * on iOS Safari. When it fails (HEIC on desktop Chrome, unsupported
 * format, etc.), the caller catches and surfaces a friendlier error.
 */
async function resizeImageFile(
  file: File,
  maxDim: number,
  quality: number
): Promise<{ base64: string }> {
  // Two decode paths — try the modern one first, fall back on older
  // browsers. Both end at the same canvas.toBlob JPEG encode.
  //
  //   1. createImageBitmap: fast, handles EXIF orientation via
  //      { imageOrientation: 'from-image' } (iOS 15+ / Safari 15+ /
  //      recent Chrome + Firefox). Preferred.
  //   2. HTMLImageElement via URL.createObjectURL: universal — works
  //      on every browser + every image format the browser can render
  //      (HEIC on iOS Safari included). No EXIF auto-rotate, but
  //      modern iPhone photos have baked-in orientation for camera
  //      captures so the visible result is upright in the common
  //      case. Fallback path only.
  //
  // Both throw with a friendly message on failure so the composer's
  // catch surfaces something the sponsor can act on.
  const decoded = await decodeImage(file);

  const longest = Math.max(decoded.width, decoded.height);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const targetW = Math.max(1, Math.round(decoded.width * scale));
  const targetH = Math.max(1, Math.round(decoded.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    decoded.cleanup?.();
    throw new Error("This browser doesn't support the canvas resize step.");
  }
  ctx.drawImage(decoded.source, 0, 0, targetW, targetH);
  decoded.cleanup?.();

  const blob: Blob | null = await new Promise(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  if (!blob) {
    throw new Error("Couldn't encode the resized photo.");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read encoded photo.'));
    reader.readAsDataURL(blob);
  });
  const commaIdx = dataUrl.indexOf(',');
  return { base64: commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl };
}

// Decode-image helper. Returns something drawable into a canvas plus
// its intrinsic size and an optional cleanup fn (bitmap.close or
// URL.revokeObjectURL). Preferred path: createImageBitmap. Fallback:
// HTMLImageElement via a blob URL for pre-createImageBitmap browsers
// (older iOS Safari, some in-app WebViews).
async function decodeImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup?: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to the HTMLImageElement path.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new Error("This browser couldn't open that image. Try a JPEG or PNG.")
        );
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

type Stage = 'idle' | 'composing' | 'sending' | 'queued' | 'error';
type Mode = 'type' | 'handwrite';

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
  firstLetterIncluded,
}: {
  childRecordId: string;
  childIdLegacy: string | null;
  firstName: string;
  sponsorName?: string | null;
  /**
   * 2026-07-10 "one letter included with the shirt" mechanic.
   * True when this viewer is a shirt-holder using their included
   * letter (see src/lib/penpal-cycle.ts). Renders a warm banner
   * above the composer explaining the deal. Silently ignored for
   * monthly sponsors — they don't need the reminder.
   */
  firstLetterIncluded?: boolean;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Public URLs of uploaded attachments, in the order the sponsor
  // added them. Also stored 1:1 in a small preview list — see the
  // JSX below. Reset on Cancel and on queued-success.
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Composition mode — 2026-07-10. 'type' is the original path
  // (textarea → Simon translates → delivers). 'handwrite' is the new
  // path unlocked by the physical letter template we ship in the
  // shirt bag: the sponsor writes on the paper, photographs it, and
  // uploads the scan as the PRIMARY body. Simon prints the scan and
  // delivers it directly — no translation step, sponsor's own
  // handwriting reaches the kid.
  const [mode, setMode] = useState<Mode>('type');
  const [letterImageUrl, setLetterImageUrl] = useState<string | null>(null);
  const [uploadingLetter, setUploadingLetter] = useState(false);
  // 2026-07-10: for shirt-holders using their included letter, once
  // they've queued the letter successfully we set this to true and
  // suppress the "Write your penpal" re-entry button. Otherwise Close
  // resets stage=idle and the button reappears, but a click would
  // 403 from the server ("You've already sent the letter that came
  // with your shirt"). Ugly UX. This flag caches the "cycle spent"
  // state locally for the rest of this session so the next attempt
  // is routed to the upgrade card instead. holderCycleAvailable
  // from the server is stale after the POST.
  const [cycleSpentThisSession, setCycleSpentThisSession] = useState(false);

  // Shared upload path for both attachments AND the handwritten letter
  // scan. Runs the picked file through a canvas-based downscale so the
  // JSON POST body fits inside Vercel's 4.5 MB serverless-body limit
  // (raw phone photos routinely blow past that after base64 inflation,
  // which is what triggered "Upload failed. Try a smaller file"). PDFs
  // and Word docs skip the resize and go through as-is.
  //
  // Returns the publicUrl on success, or throws with a user-friendly
  // message on failure. HTTP errors from the server that don't parse
  // as JSON (e.g. Vercel 413 HTML pages) get a specific fallback so
  // the composer no longer swallows the real reason.
  async function encodeAndUpload(file: File): Promise<string> {
    let filename = file.name || 'upload';
    let contentType = file.type || 'application/octet-stream';
    let dataBase64: string;

    if (file.type.startsWith('image/')) {
      // Image path: draw into canvas at max 2400px longest edge, encode
      // as JPEG @ 85%. A 12 MP iPhone photo drops from ~4-6 MB to
      // ~600 KB - 1.5 MB post-resize, easily under Vercel's limit
      // even after base64 inflation. Canvas.toBlob('image/jpeg')
      // works for JPEG/PNG/WebP/GIF sources. HEIC works on iOS Safari
      // (native decode) but not on desktop Chrome — we detect that
      // failure and surface a friendly message.
      try {
        const resized = await resizeImageFile(file, 2400, 0.85);
        dataBase64 = resized.base64;
        contentType = 'image/jpeg';
        filename = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
      } catch (err) {
        // HEIC on non-Safari is the common miss here. Give the sponsor
        // a concrete next step instead of a generic "try another
        // format" that they can't act on.
        if (
          file.type === 'image/heic' ||
          file.type === 'image/heif' ||
          /\.heic?$/i.test(file.name)
        ) {
          throw new Error(
            "This looks like an iPhone HEIC photo, and this browser can't open it. On your iPhone, take a screenshot of the photo and upload that instead."
          );
        }
        throw new Error(
          err instanceof Error && err.message
            ? err.message
            : "Couldn't read that image on this device. Try another photo or a different browser."
        );
      }
    } else {
      // Non-image (PDF, DOC, DOCX): read as base64, pass content-type
      // through unchanged. No client-side size limit here — the server
      // still enforces its own 15 MB decoded cap.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const commaIdx = dataUrl.indexOf(',');
      dataBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    }

    const res = await fetch('/api/sponsor/notes/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ filename, contentType, dataBase64 }),
    });
    // Read the body as text first so we can distinguish a JSON error
    // response (parseable) from an HTML error page (Vercel 413) and
    // give a useful message either way.
    const raw = await res.text();
    let data: { publicUrl?: string; error?: string } = {};
    try {
      data = JSON.parse(raw);
    } catch {
      // Body wasn't JSON. Fall through with data empty; message below
      // will use res.status.
    }
    if (!res.ok || !data.publicUrl) {
      if (res.status === 413) {
        throw new Error(
          'That file is too big. Try a smaller photo or a screenshot.'
        );
      }
      throw new Error(
        data.error ||
          `Upload failed (HTTP ${res.status}). Try again, or attach a smaller file.`
      );
    }
    return String(data.publicUrl);
  }

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
      const publicUrl = await encodeAndUpload(file);
      setAttachments(prev => [...prev, publicUrl]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Photo upload failed.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Handwritten letter photo picker — mirror of handlePhotoPick but
  // targets letterImageUrl instead of the attachments array. Same
  // upload endpoint (/api/sponsor/notes/photo) because the storage
  // + auth logic is identical; the semantic distinction between
  // "primary letter" and "supplementary photo" lives in state, not
  // in the upload path. Server-side, the sponsor notes POST decides
  // which column to write based on which field carries the URL.
  async function handleLetterPick(file: File) {
    setError(null);
    setUploadingLetter(true);
    try {
      const publicUrl = await encodeAndUpload(file);
      setLetterImageUrl(publicUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Upload failed.'
      );
    } finally {
      setUploadingLetter(false);
    }
  }

  const submit = useCallback(async () => {
    const trimmed = body.trim();

    // Mode-specific validation. Type mode requires the same 10-1000
    // character body as before. Handwrite mode requires a letter
    // photo but no typed text — the scan IS the letter.
    if (mode === 'type') {
      if (trimmed.length < MIN_BODY) {
        setError(
          `Say a little more. The campus reads every one of these. (${MIN_BODY}+ characters.)`
        );
        return;
      }
      if (trimmed.length > MAX_BODY) {
        setError(`Under ${MAX_BODY} characters, please.`);
        return;
      }
    } else {
      if (!letterImageUrl) {
        setError('Upload your handwritten letter first.');
        return;
      }
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
          // In handwrite mode we send an empty body — the server
          // makes body_en optional when letterImageUrl is present.
          bodyEn: mode === 'type' ? trimmed : '',
          sponsorName,
          attachments,
          // Only send letterImageUrl on the handwrite path so we
          // never accidentally attach a stale photo to a typed note
          // if the sponsor toggled modes back and forth.
          letterImageUrl: mode === 'handwrite' ? letterImageUrl : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again in a bit.');
        setStage('composing');
        return;
      }
      setStage('queued');
      // Holder-first-letter path: mark the cycle spent locally so
      // Close on the success card doesn't drop them back into a
      // composer that will 403. Server truth (kid_messages row now
      // exists) confirms this on next page load; this is the intra-
      // page-session cache.
      if (firstLetterIncluded) {
        setCycleSpentThisSession(true);
      }
    } catch {
      setError('Network hiccup. Try again in a moment.');
      setStage('composing');
    }
  }, [
    body,
    mode,
    letterImageUrl,
    childRecordId,
    childIdLegacy,
    sponsorName,
    attachments,
    firstLetterIncluded,
  ]);

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
        The team at the campus reads every penpal note and hands it to{' '}
        {firstName} in person. Deliveries happen in weekly batches,
        usually on a Sunday.
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
            Kevin reads every note before it heads to the campus, then
            the team batches deliveries each Sunday. Your note should
            reach {firstName} within about a week.{' '}
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
              setLetterImageUrl(null);
              setMode('type');
            }}
          >
            Close
          </button>
        </div>
      ) : stage === 'idle' ? (
        // Holder who just used their included cycle in this session:
        // suppress the re-open path. Reloading the page will replace
        // this whole composer with the upgrade card from PenpalBox
        // (server sees the new kid_messages row → holder_used). Until
        // then we render nothing so a curious click can't hit a 403.
        cycleSpentThisSession ? null : (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setStage('composing')}
              className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Write your penpal
            </button>
          </div>
        )
      ) : (
        <div className="bg-white border border-[#e8e0d4] p-5 md:p-6">

          {/* First-letter-included banner (2026-07-10). Shown to
              shirt-holders using their included cycle. Frames the
              interaction as a gift, not a limit — voice.md rule 4
              "describe the trade" applied to the physical letter
              template's promise. */}
          {firstLetterIncluded && (
            <div className="mb-4 bg-[#FFF8F0] border border-[#D4A843] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-1">
                Included with your shirt
              </p>
              <p
                className="text-[15px] text-[#0d0d0d] leading-snug"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Your first letter to {firstName} is on us.
              </p>
              <p className="text-xs text-[#666] mt-1 leading-relaxed">
                {firstName} writes back. If you want to keep the
                letters going after that, sponsor at $25/month.
              </p>
            </div>
          )}

          {/* Mode toggle — Type / Handwrite & upload. Pill selector at
              the top of the composer. Handwrite unlocks the physical-
              letter workflow: the sponsor writes on the printed template
              we ship in the shirt bag, photographs it, uploads. Simon
              prints the scan and delivers it directly. */}
          <div className="mb-4 flex justify-center">
            <div className="inline-flex bg-[#f5f0e8] border border-[#e8e0d4] p-1 rounded-full">
              <button
                type="button"
                onClick={() => {
                  setMode('type');
                  if (error) setError(null);
                }}
                disabled={stage === 'sending' || uploadingLetter}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] rounded-full transition-colors ${
                  mode === 'type'
                    ? 'bg-[#0d0d0d] text-white'
                    : 'text-[#666] hover:text-[#0d0d0d]'
                }`}
              >
                Type
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('handwrite');
                  if (error) setError(null);
                }}
                disabled={stage === 'sending' || uploadingPhoto}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] rounded-full transition-colors ${
                  mode === 'handwrite'
                    ? 'bg-[#0d0d0d] text-white'
                    : 'text-[#666] hover:text-[#0d0d0d]'
                }`}
              >
                Handwrite &amp; upload
              </button>
            </div>
          </div>

          {mode === 'type' ? (
            <>
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
              {/* Presence — where this note is headed, right now.
                  The night variant ("your note will be waiting when
                  the campus wakes up") turns the seven-hour time
                  difference from friction into warmth. Client
                  component, so the clock is the sponsor's moment of
                  writing, not the server render. */}
              <p className="mt-1.5 text-xs text-[#999] italic">
                {composerPresenceLine(firstName)}
              </p>
            </>
          ) : (
            /* Handwrite mode — primary letter photo picker. Reuses the
               same attachment-kind helper via URL extension for preview
               (image inline, PDF/DOC as document card). */
            <div className="mb-2">
              <p className="text-xs text-[#666] mb-3 leading-relaxed">
                Write on the printed letter template we sent with your
                shirt (or any paper), photograph the sheet, and upload
                it here. The team prints your handwriting and delivers
                it to {firstName} in person.
              </p>
              {letterImageUrl ? (
                <div className="border border-[#e8e0d4] bg-[#FFF8F0] p-3">
                  {/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)(\?|#|$)/i.test(letterImageUrl) ? (
                    <img
                      src={letterImageUrl}
                      alt="Your handwritten letter"
                      className="block max-h-64 w-auto max-w-full mx-auto border border-[#e8e0d4] bg-white"
                    />
                  ) : (
                    <div className="flex items-center gap-3 border border-[#e8e0d4] bg-white p-3">
                      <div className="w-10 h-12 bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#D4A843]" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#0d0d0d]">Letter uploaded</p>
                        <p className="text-xs text-[#666] truncate">
                          {letterImageUrl.split('/').pop() || 'file'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs mt-3">
                    <a
                      href={letterImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#D4A843] font-bold hover:underline"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => setLetterImageUrl(null)}
                      disabled={stage === 'sending' || uploadingLetter}
                      className="text-[#888] hover:text-[#c0392b] font-bold uppercase tracking-[0.1em]"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  className={`block border-2 border-dashed border-[#e8e0d4] hover:border-[#D4A843] bg-[#FFF8F0] p-6 text-center cursor-pointer transition-colors ${
                    uploadingLetter || stage === 'sending' ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#D4A843] mx-auto mb-2" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <polyline points="9 15 12 12 15 15" />
                  </svg>
                  <p className="text-sm font-semibold text-[#0d0d0d]">
                    {uploadingLetter ? 'Uploading…' : 'Upload your handwritten letter'}
                  </p>
                  <p className="text-xs text-[#666] mt-1">
                    Photo, PDF, or Word doc. Phone camera works.
                  </p>
                  <input
                    type="file"
                    accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    disabled={uploadingLetter || stage === 'sending'}
                    onChange={e => {
                      const f = e.currentTarget.files?.[0];
                      if (f) void handleLetterPick(f);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          )}

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
                The campus team prints these and hands them to {firstName}{' '}
                with your letter.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            {/* Character counter only shows in type mode. Handwrite
                mode doesn't have a body length to track. */}
            {mode === 'type' ? (
              <p
                className={`text-xs ${
                  overCap ? 'text-[#c0392b] font-semibold' : 'text-[#888]'
                }`}
              >
                {charCount} / {MAX_BODY}
              </p>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStage('idle');
                  setBody('');
                  setAttachments([]);
                  setLetterImageUrl(null);
                  setMode('type');
                  setError(null);
                }}
                /* uploadingPhoto/uploadingLetter guards fix a race
                   caught in audit: sponsor picks a photo, clicks Cancel
                   before the upload resolves, then the in-flight fetch's
                   set-state callback re-populates the field the user
                   just cleared. Blocking the click while any upload is
                   in flight is the simplest fix. */
                disabled={
                  stage === 'sending' || uploadingPhoto || uploadingLetter
                }
                className="text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] px-4 py-2 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                /* Send disabled while any upload is in flight, when
                   type mode is over the body cap, or (handwrite mode)
                   when no letter photo has been uploaded yet. */
                disabled={
                  stage === 'sending' ||
                  uploadingPhoto ||
                  uploadingLetter ||
                  (mode === 'type' && overCap) ||
                  (mode === 'handwrite' && !letterImageUrl)
                }
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
