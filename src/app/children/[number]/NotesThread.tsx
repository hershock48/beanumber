/**
 * NotesThread — every note the sponsor has written to this kid and
 * every reply the kid has written back, oldest first (chronological
 * arc). Renders on the sponsor-gated view of /children/[N], above
 * the send-a-note composer so a sponsor arriving from a "you got a
 * reply" email sees the reply front-and-center.
 *
 * Design intent: this reads like a letter file, not a chat thread.
 * Each entry is a discrete card with a warm dateline, the body in
 * italic serif, and a small attribution line. Sponsor's notes and
 * kid's replies are visually distinct (different background, gold
 * accent) so a scanner can tell them apart at a glance.
 *
 * Silent when the thread is empty — the composer below is enough
 * signal that the surface exists.
 *
 * Server component. Zero client JS.
 */

import type { NoteThreadEntry } from '@/lib/db/queries';
import { attachmentKind, attachmentTypeLabel } from '@/lib/attachments';
import { LetterJourney, journeyStageForStatus } from './LetterJourney';

export function NotesThread({
  firstName,
  thread,
}: {
  firstName: string;
  thread: NoteThreadEntry[];
}) {
  if (thread.length === 0) return null;

  // The letter journey rides on the NEWEST sponsor note only, and only
  // while it's still in flight (sent/reviewed/translated — not yet in
  // the kid's hands). One moving letter at a time: thread is
  // newest-first here, so the first sponsor_to_kid entry is the one.
  // Once that note is delivered, the stepper disappears and the card
  // goes back to its plain dateline — the payoff at that point is the
  // reply, not the tracker.
  const newestSponsorNote = thread.find(e => e.direction === 'sponsor_to_kid');
  const journeyStage = newestSponsorNote
    ? journeyStageForStatus(newestSponsorNote.status)
    : null;
  const journeyNoteId =
    journeyStage !== null ? (newestSponsorNote?.id ?? null) : null;

  // Server returns newest-first; render oldest-first so the sponsor
  // reads the arc top-down (their first note → any reply → their
  // next note, etc.).
  const chronological = [...thread].reverse();

  return (
    <section className="mb-10 md:mb-14 max-w-2xl mx-auto">
      {/* Inner PENPAL / h2 removed 2026-07-08 (second-pass audit).
          PenpalBox already renders the section header — a nested
          header from NotesThread produced two stacked "PENPAL"
          headings for any sponsor with an active thread. */}
      <ol className="space-y-4">
        {chronological.map(entry => {
          const isSponsorNote = entry.direction === 'sponsor_to_kid';
          const dateSource = entry.deliveredAt ?? entry.createdAt;
          const dateLabel = new Date(dateSource).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });
          return (
            <li
              key={entry.id}
              // Anchor id so a future "read the letter" email link can
              // deep-link straight to the reply (e.g. /children/17#note-abc).
              // scroll-margin-top gives the target headroom so if any
              // header ever ends up sticky, the anchored card still lands
              // fully visible, not tucked under it.
              id={`note-${entry.id}`}
              style={{ scrollMarginTop: '96px' }}
              className={
                isSponsorNote
                  ? 'bg-white border border-[#e8e0d4] p-5 md:p-6'
                  : 'bg-[#fbf5e8] border border-[#e8e0d4] p-6 md:p-8 shadow-[0_2px_12px_rgba(184,150,66,0.08)]'
              }
            >
              {isSponsorNote ? (
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
                  You wrote
                  <span className="text-[#888] font-normal normal-case tracking-normal ml-2">
                    &middot; {dateLabel}
                  </span>
                </p>
              ) : (
                <div className="mb-5 md:mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#c0392b]">
                    A letter from {firstName}
                  </p>
                  <p className="text-xs text-[#888] mt-1">
                    Arrived {dateLabel}
                  </p>
                </div>
              )}
              {/* Scanned handwritten reply — kid_to_sponsor rows
                  with a photo attached (2026-07-08 workflow). Photo
                  is the payoff; the English text moves to a caption
                  underneath, positioned as "here's what it says"
                  rather than as the letter itself.

                  The Image is a plain <img> — Next/Image isn't
                  configured for arbitrary Supabase Storage hosts
                  and the extra config drift isn't worth the small
                  LCP win here (the whole thread is below the fold
                  on load). Loading is lazy so a sponsor with a
                  long thread doesn't pull every reply photo up
                  front. */}
              {!isSponsorNote && entry.replyImageUrl ? (
                (() => {
                  const kind = attachmentKind(entry.replyImageUrl);
                  const label = attachmentTypeLabel(kind);
                  return (
                    <figure className="mt-1 mb-3">
                      {kind === 'image' ? (
                        /* Photo matting — the scan sits inside a
                           white card with generous padding and a
                           soft warm-tinted shadow so it reads as a
                           physical letter someone laid on the desk,
                           not just an inline image. Padding is
                           deliberately larger on desktop so the
                           handwriting has room to breathe. */
                        <div className="bg-white border border-[#e8e0d4] p-3 md:p-5 shadow-[0_6px_24px_rgba(184,150,66,0.15)]">
                          <img
                            src={entry.replyImageUrl}
                            alt={`Handwritten letter from ${firstName}`}
                            loading="lazy"
                            className="block w-full h-auto max-w-full"
                          />
                        </div>
                      ) : (
                        /* PDF or Word doc — can't render inline as an
                           <img>. Show a warm document card that opens
                           the file in a new tab. Keeps the emotional
                           beat ("[Kid] wrote you a letter") without a
                           broken image icon. */
                        <a
                          href={entry.replyImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-4 border border-[#e8e0d4] bg-white p-5 hover:bg-[#FFF8F0] transition-colors"
                        >
                          <div className="w-12 h-14 bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                            <svg
                              width="24"
                              height="24"
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
                            <p
                              className="text-base text-[#0d0d0d] font-semibold"
                              style={{ fontFamily: 'var(--font-lora), serif' }}
                            >
                              Open {firstName}&rsquo;s letter
                            </p>
                            <p className="text-xs text-[#666] mt-0.5">
                              {label} &middot; opens in a new tab
                            </p>
                          </div>
                        </a>
                      )}
                      {/* Translation caption is skipped entirely when
                          Simon marked the letter as already in English
                          (the scan IS the readable content). Otherwise
                          the translation renders below the photo as a
                          soft accompanying note — small caps kicker
                          separated by a hairline rule, then Lora italic
                          in the same warm tone as the sponsor's own
                          note above so the arc reads as a conversation. */}
                      {entry.bodyEn.trim().length > 0 && (
                        <figcaption className="mt-5 md:mt-6">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#888]">
                              In English
                            </span>
                            <span className="flex-1 h-px bg-[#e8e0d4]"></span>
                          </div>
                          <p
                            className="text-[14px] md:text-[15px] text-[#333] leading-relaxed italic"
                            style={{ fontFamily: 'var(--font-lora), serif' }}
                          >
                            {entry.bodyEn.split('\n').map((line, i, arr) => (
                              <span key={i}>
                                {line}
                                {i < arr.length - 1 && <br />}
                              </span>
                            ))}
                          </p>
                        </figcaption>
                      )}
                    </figure>
                  );
                })()
              ) : isSponsorNote && entry.letterImageUrl ? (
                /* Sponsor's handwritten letter — 2026-07-10. When the
                   buyer wrote on the physical letter template and
                   uploaded a scan via the composer's handwrite mode,
                   we render THEIR handwriting as the primary body of
                   this entry. Same photo-matting treatment as the
                   kid's reply so the arc reads symmetric: handwriting
                   out, handwriting back. If they ALSO attached photos
                   (composer allows both), we render the thumbnail
                   strip below the scan so nothing gets dropped. */
                (() => {
                  const kind = attachmentKind(entry.letterImageUrl);
                  const label = attachmentTypeLabel(kind);
                  return (
                    <>
                      <figure className="mt-1 mb-3">
                        {kind === 'image' ? (
                          <div className="bg-white border border-[#e8e0d4] p-3 md:p-5 shadow-[0_6px_24px_rgba(184,150,66,0.15)]">
                            <img
                              src={entry.letterImageUrl}
                              alt="Your handwritten letter"
                              loading="lazy"
                              className="block w-full h-auto max-w-full"
                            />
                          </div>
                        ) : (
                          <a
                            href={entry.letterImageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-4 border border-[#e8e0d4] bg-white p-5 hover:bg-[#FFF8F0] transition-colors"
                          >
                            <div className="w-12 h-14 bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#D4A843]" aria-hidden="true">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-base text-[#0d0d0d] font-semibold"
                                style={{ fontFamily: 'var(--font-lora), serif' }}
                              >
                                Your handwritten letter
                              </p>
                              <p className="text-xs text-[#666] mt-0.5">
                                {label} &middot; opens in a new tab
                              </p>
                            </div>
                          </a>
                        )}
                      </figure>
                      {entry.attachments && entry.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {entry.attachments.map((url, i) => (
                            <a
                              key={url + i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block"
                              title="Open full size"
                            >
                              <img
                                src={url}
                                alt={`Photo you sent with your note ${i + 1}`}
                                loading="lazy"
                                className="block h-24 w-auto max-w-full border border-[#e8e0d4] bg-white object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()
              ) : (
                <>
                  <p
                    className="text-[15px] md:text-base text-[#333] leading-relaxed italic"
                    style={{ fontFamily: 'var(--font-lora), serif' }}
                  >
                    {entry.bodyEn.split('\n').map((line, i, arr) => (
                      <span key={i}>
                        {line}
                        {i < arr.length - 1 && <br />}
                      </span>
                    ))}
                  </p>
                  {/* Sponsor-attached photos (2026-07-08). Rendered
                      below the sponsor's italic note as a small
                      thumbnail strip so the sponsor sees "I sent
                      Naume a photo of my dog on June 3" as part of
                      the arc. Never rendered on kid_to_sponsor
                      rows (queries.ts leaves this null there). */}
                  {isSponsorNote &&
                    entry.attachments &&
                    entry.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.attachments.map((url, i) => (
                          <a
                            key={url + i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                            title="Open full size"
                          >
                            <img
                              src={url}
                              alt={`Photo you sent with your note ${i + 1}`}
                              loading="lazy"
                              className="block h-24 w-auto max-w-full border border-[#e8e0d4] bg-white object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                </>
              )}
              {!isSponsorNote && !entry.replyImageUrl && entry.bodyOriginal && (
                <details className="mt-3">
                  <summary className="text-xs text-[#888] cursor-pointer hover:text-[#0d0d0d] not-italic">
                    Show the original in {firstName}&rsquo;s language
                  </summary>
                  <p
                    className="text-xs text-[#666] italic leading-relaxed mt-2 pl-4"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    {entry.bodyOriginal}
                  </p>
                </details>
              )}
              {/* The letter journey — only on the newest in-flight
                  sponsor note. See the journeyNoteId computation at
                  the top of the component. */}
              {entry.id === journeyNoteId && journeyStage !== null && (
                <LetterJourney stage={journeyStage} firstName={firstName} />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
