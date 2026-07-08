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
      <div className="text-center mb-6 md:mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
          Penpal
        </p>
        <h2
          className="text-2xl md:text-3xl text-[#0d0d0d] leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Penpal notes between you and {firstName}.
        </h2>
      </div>
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
              {!isSponsorNote && entry.bodyOriginal && (
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
