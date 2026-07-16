/**
 * LetterJourney — the four-dot path a penpal note travels, rendered
 * inside the sponsor's newest in-flight note card in NotesThread.
 *
 *   Sent → Reviewed → Translated → In {kid}'s hands
 *
 * The psychology is the pizza-tracker effect: a letter that takes up
 * to two weeks to arrive feels broken when the page is silent, and
 * feels ALIVE when you can watch it move. Every stage is a real
 * person doing a real thing — Kevin reads it, the campus team
 * receives it, a teacher translates it, a kid holds it. The stepper
 * just makes those people visible, and gives the sponsor a reason to
 * come back mid-journey.
 *
 * Visual: hairline rule above (separates it from the note body the
 * way a postmark sits apart from the letter), then dots joined by
 * hairlines. Done dots fill gold, the current dot gets a gold ring,
 * future dots stay sand. One caption line under the dots — current
 * stage only. No animation, no client JS; the movement IS the state
 * change between visits. Server component.
 *
 * Mirrors mobile/components/kids/LetterJourney.tsx — same labels,
 * same stage semantics, so the letter reads the same on both
 * surfaces.
 */

const STAGE_FOR_STATUS: Record<string, 1 | 2 | 3> = {
  awaiting_kevin: 1,
  pending: 2,
  translated: 3,
};

/**
 * 1–3 while the note is in flight; null when it's delivered, declined,
 * or in a state we don't recognize (render the plain dateline instead).
 */
export function journeyStageForStatus(status: string): 1 | 2 | 3 | null {
  return STAGE_FOR_STATUS[status] ?? null;
}

export function LetterJourney({
  stage,
  firstName,
}: {
  stage: 1 | 2 | 3;
  firstName: string;
}) {
  const labels = ['Sent', 'Reviewed', 'Translated', `In ${firstName}’s hands`];

  return (
    <div
      className="mt-4 pt-4 border-t border-[#e8e0d4]"
      aria-label={`Your note is at step ${stage} of 4: ${labels[stage - 1]}`}
    >
      <div className="flex items-center">
        {[1, 2, 3, 4].map(step => {
          const done = step < stage;
          const current = step === stage;
          return (
            <span key={step} className="contents">
              {step > 1 && (
                <span
                  aria-hidden
                  className={`flex-1 h-px ${
                    done || current ? 'bg-[#D4A843]' : 'bg-[#e8e0d4]'
                  }`}
                />
              )}
              <span
                aria-hidden
                className={`flex items-center justify-center w-4 h-4 rounded-full ${
                  current ? 'ring-1 ring-[#D4A843]' : ''
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    done || current ? 'bg-[#D4A843]' : 'bg-[#e8e0d4]'
                  }`}
                />
              </span>
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[#888]">
        {labels[stage - 1]}
        {stage === 3 && (
          <span className="text-[#aaa]"> — travels with the Sunday batch</span>
        )}
      </p>
    </div>
  );
}
