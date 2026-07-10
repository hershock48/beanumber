'use client';

/**
 * ReorderShirtCard — bottom-of-kid-page CTA for the shirt-holder or
 * sponsor to reorder ANOTHER shirt with the SAME Number printed on it.
 *
 * Product model (Kevin, 2026-07-10)
 * ─────────────────────────────────
 * A buyer who already holds #N (whether they've converted to monthly
 * or not) can buy another shirt with #N pressed on the back. Different
 * color, an extra for the family, a replacement — same kid, same
 * Number, no new sponsorship, no new child pairing.
 *
 * The copy has to be unambiguous on two fronts:
 *   1. Kevin, at the press, must see "REORDER · #N" so he knows to
 *      press #N on the back and NOT assign a new number. The print
 *      description on the Stripe line item leads with 'REORDER'.
 *   2. The buyer must understand this is not a second kid, not an
 *      add-on sponsorship, not an assignment of another child. Same
 *      kid, same Number, just another shirt.
 *
 * Flow
 * ────
 *   pick color + size
 *     → POST /api/sponsor/portal-purchase with returnTo=/children/[N]
 *     → redirect to Stripe checkout
 *     → checkout.session.completed → webhook stamps Fulfillment with
 *       existing #N + reorder print note
 *     → success redirect back to /children/[N]?repeat_order=1
 *
 * Sponsor code
 * ────────────
 * The endpoint requires the client's sponsor code to match the
 * sponsor_session cookie. page.tsx exposes sponsor_code for both
 * viewer_is_sponsor and viewer_is_holder — either can reorder. Not
 * exposed for signed_in_visitor or anon, so this component won't
 * render at all in those cases.
 */

import { useState } from 'react';

const COLORS = [
  { id: 'onyx', name: 'Onyx', swatch: '#0d0d0d' },
  { id: 'meadow', name: 'Meadow', swatch: '#4a6b3a' },
  { id: 'blossom', name: 'Blossom', swatch: '#d99a9a' },
  { id: 'sky', name: 'Sky', swatch: '#7ab1d1' },
] as const;

const SIZES = ['S', 'M', 'L', 'XL', '2XL'] as const;
const YOUTH_SIZES = ['Youth S', 'Youth M', 'Youth L', 'Youth XL'] as const;

type ColorId = (typeof COLORS)[number]['id'];
type Size = (typeof SIZES)[number] | (typeof YOUTH_SIZES)[number];

export function ReorderShirtCard({
  firstName,
  shirtNumber,
  sponsorCode,
  returnTo,
}: {
  firstName: string;
  shirtNumber: number;
  sponsorCode: string;
  /**
   * The URL path to route the buyer back to on Stripe success /
   * cancel. Always the current kid page, e.g. `/children/17`.
   */
  returnTo: string;
}) {
  const [color, setColor] = useState<ColorId>('onyx');
  const [size, setSize] = useState<Size>('M');
  const [showYouth, setShowYouth] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOrder() {
    setError(null);
    setSubmitting(true);
    try {
      const colorDef = COLORS.find(c => c.id === color)!;
      const res = await fetch('/api/sponsor/portal-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          sponsorCode,
          shirtId: color,
          size,
          color: colorDef.name,
          returnTo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(
          data.error ||
            'We could not start your reorder. Try again in a moment.'
        );
        setSubmitting(false);
        return;
      }
      // Hand off to Stripe. Don't reset `submitting` — the browser is
      // about to navigate away and any state after this is wasted.
      window.location.href = data.url;
    } catch {
      setError('Network hiccup. Try again in a moment.');
      setSubmitting(false);
    }
  }

  const activeSizes = showYouth ? YOUTH_SIZES : SIZES;

  return (
    <div className="mt-12 md:mt-16 border border-[#e8e0d4] bg-[#FFF8F0]">
      <div className="p-6 md:p-10">
        <div className="text-center mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-2">
            Reorder
          </p>
          <h2
            className="text-2xl md:text-3xl text-[#0d0d0d] mb-3 leading-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Another shirt with #{shirtNumber}
          </h2>
          <p className="text-[15px] text-[#333] leading-relaxed max-w-md mx-auto">
            Different color, an extra for the family, or a replacement.
            Same {firstName}. Same Number. Not a new sponsorship, not a
            new kid &mdash; just another shirt.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          {/* Color swatches */}
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888] mb-2">
              Color
            </p>
            <div className="flex gap-3">
              {COLORS.map(c => {
                const selected = c.id === color;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.id)}
                    disabled={submitting}
                    className={`flex-1 flex flex-col items-center gap-1.5 p-2 border transition-all ${
                      selected
                        ? 'border-[#0d0d0d] bg-white'
                        : 'border-[#e8e0d4] hover:border-[#c0b8a4]'
                    }`}
                    aria-pressed={selected}
                  >
                    <span
                      className="block w-8 h-8 border border-[#e8e0d4]"
                      style={{ backgroundColor: c.swatch }}
                    />
                    <span
                      className={`text-[10px] font-bold uppercase tracking-[0.1em] ${
                        selected ? 'text-[#0d0d0d]' : 'text-[#888]'
                      }`}
                    >
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Adult / youth toggle */}
          <div className="mb-3 flex justify-center">
            <div className="inline-flex bg-white border border-[#e8e0d4] p-1 rounded-full">
              <button
                type="button"
                onClick={() => {
                  setShowYouth(false);
                  setSize('M');
                }}
                disabled={submitting}
                className={`px-4 py-1 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full transition-colors ${
                  !showYouth
                    ? 'bg-[#0d0d0d] text-white'
                    : 'text-[#666] hover:text-[#0d0d0d]'
                }`}
              >
                Adult
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowYouth(true);
                  setSize('Youth M');
                }}
                disabled={submitting}
                className={`px-4 py-1 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full transition-colors ${
                  showYouth
                    ? 'bg-[#0d0d0d] text-white'
                    : 'text-[#666] hover:text-[#0d0d0d]'
                }`}
              >
                Youth
              </button>
            </div>
          </div>

          {/* Size buttons */}
          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888] mb-2 text-center">
              Size
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {activeSizes.map(s => {
                const selected = s === size;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    disabled={submitting}
                    className={`px-3 py-2 min-w-[52px] text-xs font-bold uppercase tracking-[0.1em] border transition-colors ${
                      selected
                        ? 'bg-[#0d0d0d] text-white border-[#0d0d0d]'
                        : 'bg-white text-[#333] border-[#e8e0d4] hover:border-[#c0b8a4]'
                    }`}
                    aria-pressed={selected}
                  >
                    {s.replace('Youth ', '')}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <p className="text-xs text-[#c0392b] text-center mb-3">{error}</p>
          ) : null}

          <button
            type="button"
            onClick={handleOrder}
            disabled={submitting}
            className="w-full bg-[#D4A843] hover:bg-[#c49a3a] disabled:opacity-60 text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 transition-colors"
          >
            {submitting
              ? 'Opening checkout…'
              : `Reorder #${shirtNumber} — $25`}
          </button>

          <p className="text-xs text-[#888] text-center leading-relaxed mt-4">
            Free shipping. Same Number gets pressed on the back &mdash;
            not a new sponsorship, not a different kid. Just another
            shirt with #{shirtNumber} on it.
          </p>
        </div>
      </div>
    </div>
  );
}
