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
  }, [body, childRecordId, childIdLegacy, sponsorName]);

  const charCount = body.trim().length;
  const overCap = charCount > MAX_BODY;

  return (
    <section className="mb-10 md:mb-14 max-w-2xl mx-auto">
      <div className="text-center mb-6 md:mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
          Send a note
        </p>
        <h2
          className="text-2xl md:text-3xl text-[#0d0d0d] leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Write to {firstName}.
        </h2>
        <p className="text-[#666] mt-3 leading-relaxed max-w-lg mx-auto">
          The team at the campus reads every note, translates it, and
          hands it to {firstName} in person. Deliveries happen in
          weekly batches, usually on a Sunday.
        </p>
      </div>

      {stage === 'queued' ? (
        <div className="bg-[#f5efe4] border border-[#e8e0d4] p-6 md:p-7 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
            Off to the campus
          </p>
          <p
            className="text-xl text-[#0d0d0d] leading-snug mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Your note is on its way to {firstName}.
          </p>
          <p className="text-[#555] leading-relaxed max-w-md mx-auto">
            The campus batches deliveries each Sunday, so your note
            should reach {firstName} within about a week.{' '}
            <span className="text-[#0d0d0d] font-semibold">
              We&rsquo;ll email you if {firstName} writes back.
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
            Start a note
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#e8e0d4] p-5 md:p-6">
          <label
            htmlFor="sponsor-note"
            className="sr-only"
          >
            Note to {firstName}
          </label>
          <textarea
            id="sponsor-note"
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
                  setError(null);
                }}
                disabled={stage === 'sending'}
                className="text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] px-4 py-2 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={stage === 'sending' || overCap}
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
