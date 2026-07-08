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

export function NotesThread({
  firstName,
  thread,
}: {
  firstName: string;
  thread: NoteThreadEntry[];
}) {
  if (thread.length === 0) return null;

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
              className={
                isSponsorNote
                  ? 'bg-white border border-[#e8e0d4] p-5 md:p-6'
                  : 'bg-[#faf4e8] border border-[#e8e0d4] p-5 md:p-6'
              }
            >
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
                {isSponsorNote ? 'You wrote' : `${firstName} wrote back`}
                <span className="text-[#888] font-normal normal-case tracking-normal ml-2">
                  &middot; {dateLabel}
                </span>
              </p>
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
                <figure className="mt-1 mb-3">
                  <img
                    src={entry.replyImageUrl}
                    alt={`Handwritten letter from ${firstName}`}
                    loading="lazy"
                    className="block w-full h-auto max-w-full border border-[#e8e0d4] bg-white"
                  />
                  {/* Translation caption is skipped entirely when
                      Simon marked the letter as already in English
                      (the scan IS the readable content). Otherwise
                      the translation renders below as a caption. */}
                  {entry.bodyEn.trim().length > 0 && (
                    <figcaption
                      className="text-[13px] md:text-sm text-[#555] leading-relaxed italic mt-3"
                      style={{ fontFamily: 'var(--font-lora), serif' }}
                    >
                      <span className="not-italic text-[10px] font-bold uppercase tracking-[0.2em] text-[#888] block mb-2">
                        Translated
                      </span>
                      {entry.bodyEn.split('\n').map((line, i, arr) => (
                        <span key={i}>
                          {line}
                          {i < arr.length - 1 && <br />}
                        </span>
                      ))}
                    </figcaption>
                  )}
                </figure>
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
            </li>
          );
        })}
      </ol>
    </section>
  );
}
