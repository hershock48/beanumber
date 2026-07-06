/**
 * MilestoneBanner — one warm dated line rendered inside a kid card
 * on /me when the sponsorship crossed an anniversary threshold,
 * the kid's birthday is close, or the sponsor just started.
 *
 * Design intent: NOT a badge. NOT a modal. NOT a confetti burst.
 * A quiet, dated note that reads like a stamp on a letter. Warm
 * gold accent + serif headline + a supporting sentence. Fits
 * inside the existing kid-card layout without displacing anything.
 *
 * Voice-checked against voice.md: no "generous," no "empowerment,"
 * no "just $25," no exclamation. The copy on the Milestone shape
 * itself is written to those rules — this component only renders.
 */

import type { Milestone } from '@/lib/milestones';

/**
 * MilestoneBanner variants:
 *
 *   'card-band' — a discrete horizontal band between the kid photo
 *                 and the info block on a /me KidCard. Warm cream
 *                 background, tiny gold dot, serif headline, small
 *                 supporting sentence. Reads like a stamp on the
 *                 card, visually distinct without dominating.
 *   'inline'    — no background, just the note. For placement inside
 *                 other content flows where a full band would be
 *                 too heavy.
 */
export function MilestoneBanner({
  milestone,
  variant = 'card-band',
}: {
  milestone: Milestone;
  variant?: 'card-band' | 'inline';
}) {
  const wrapperClass =
    variant === 'card-band'
      ? 'bg-[#faf4e8] border-b border-[#e8e0d4] px-4 py-3'
      : 'py-2';

  return (
    <div className={wrapperClass}>
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1.5 inline-block w-1.5 h-1.5 bg-[#D4A843] rounded-full flex-shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p
            className="text-sm text-[#0d0d0d] leading-snug"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {milestone.headline}
          </p>
          {milestone.body && (
            <p className="text-xs text-[#666] leading-relaxed mt-1.5">
              {milestone.body}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
