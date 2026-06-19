'use client';

/**
 * Client side of the bag label printer. Form on the left, live
 * label preview on the right. Hit Print → @media print kicks in,
 * hides everything except the label sized to a 4&rdquo;×6&rdquo; thermal
 * label.
 *
 * v4 design rationale.
 *
 * Kevin&rsquo;s v3 critique: a retail shopper looking at a bag with
 * &ldquo;???&rdquo; on it has no idea it&rsquo;s a t-shirt. Mystery-box brands
 * (LootCrate, BarkBox, Pop Mart, Pokémon packs) all keep the
 * category visible — the mystery is about specifics, never about
 * &ldquo;is this clothing or food.&rdquo; v3 confused category and content.
 *
 * v4 fixes that by:
 *
 *   1. Putting &ldquo;Hand-printed cotton tee&rdquo; right under the brand
 *      wordmark — explicit product category, three-word spec, gold
 *      small caps. Reads as a hangtag line.
 *
 *   2. Using BAN&rsquo;s existing brand mantra as the hook:
 *      &ldquo;Every Shirt has a Number. Every Number is a Child.&rdquo;
 *      The word &ldquo;Shirt&rdquo; is in the headline itself, which doubles
 *      as the category signal at the body-copy level. The line is
 *      already the canonical brand sentence across site and emails;
 *      using it on the bag ties physical product to brand mantra.
 *
 *   3. Keeping the massive ??? as the visual hero. Category is
 *      now answered (it&rsquo;s a tee), the mystery is now specifically
 *      about WHO the kid is.
 *
 *   4. Resolution copy points the buyer at the next action:
 *      &ldquo;Your Number is on the back. Meet your Child at
 *      beanumber.org.&rdquo; Two sentences, direct, voice-doc compliant.
 *
 *   5. Geography in the footer is named precisely — &ldquo;YDO Campus ·
 *      Northern Uganda&rdquo; — instead of an ambiguous &ldquo;Country:
 *      Uganda&rdquo; that could read as &ldquo;made in Uganda&rdquo; (the shirts
 *      are hand-printed by Kevin, not in Uganda; the KID is in
 *      Uganda).
 *
 * Designed for both scenarios Kevin called out:
 *
 *   - Online buyer opens their package: the wordmark + product
 *     spec confirms what arrived, the mantra reaffirms why they
 *     bought it, ??? amplifies anticipation, the resolution copy
 *     points them straight at /[N] for the reveal.
 *
 *   - Retail shopper sees it on a shelf: reads &ldquo;Be A Number /
 *     Hand-printed cotton tee&rdquo; in two seconds (category clarity),
 *     reads &ldquo;Every Shirt has a Number. Every Number is a Child.&rdquo;
 *     in three more seconds (story hook + category reinforced),
 *     sees ??? (curiosity), reads URL (next step). Five seconds,
 *     hooked.
 *
 * Typography (voice.md):
 *   - Wordmark, hook headline, resolution = Lora 600/700
 *   - Category spec, footer values, URL accent = system sans
 *   - Gold (#D4A843) used sparingly — wordmark subtitle and the
 *     URL only, per voice.md (&ldquo;Gold accent: #D4A843 (used
 *     sparingly — labels, CTA, hover states)&rdquo;).
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// Adult sizes + customer-facing color names. Color names are
// deliberately the common ones (&ldquo;Pink&rdquo; instead of brand
// &ldquo;Blossom,&rdquo; etc.) because the label is what retail shoppers
// read — they understand &ldquo;Pink,&rdquo; they may not parse
// &ldquo;Blossom.&rdquo; The brand color names stay on the website where
// context makes them feel intentional.
export const SIZE_OPTIONS = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export const COLOR_OPTIONS = ['Pink', 'Green', 'Black', 'Blue'] as const;

const LORA = 'var(--font-lora), Georgia, "Times New Roman", serif';
const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

function PrintLabelInner() {
  const params = useSearchParams();
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [origin, setOrigin] = useState('YDO Campus · Northern Uganda');

  useEffect(() => {
    const s = params.get('size');
    const c = params.get('color');
    const o = params.get('origin') || params.get('country');
    if (s) setSize(s);
    if (c) setColor(c);
    if (o) setOrigin(o);
  }, [params]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] text-[#0d0d0d]">
      <style>{`
        @media print {
          @page {
            size: 4in 6in;
            margin: 0;
          }
          html, body {
            background: #ffffff !important;
            margin: 0;
            padding: 0;
          }
          .print-hide {
            display: none !important;
          }
          .print-label {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            width: 4in !important;
            height: 6in !important;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="max-w-5xl mx-auto px-5 py-6 md:py-10">
        <div className="print-hide mb-6">
          <Link
            href="/admin/print-label/catalog"
            className="text-xs text-[#888] hover:text-[#0d0d0d] uppercase tracking-[0.15em] font-bold"
          >
            ← All labels
          </Link>
          <h1
            className="text-2xl text-[#0d0d0d] mt-3"
            style={{ fontFamily: LORA, fontWeight: 600 }}
          >
            Bag label
          </h1>
          <p className="text-sm text-[#666] mt-1 leading-relaxed">
            v4 fixes the &ldquo;is this even a t-shirt?&rdquo; problem from
            v3 by putting the category at the top (&ldquo;Hand-printed cotton
            tee&rdquo;) and using the BAN brand mantra as the hook (the word
            &ldquo;Shirt&rdquo; lives in the headline itself). The
            ??? hero stays, the mystery is now specifically WHO the kid
            is — not what the product is. Pick Size and Color, then Print.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Form — hidden when printing. */}
          <div className="print-hide space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                  Size
                </span>
                <select
                  value={size}
                  onChange={e => setSize(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e0d4] bg-white text-[#0d0d0d] focus:outline-none focus:border-[#D4A843]"
                >
                  <option value="">—</option>
                  {SIZE_OPTIONS.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                  Color
                </span>
                <select
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e0d4] bg-white text-[#0d0d0d] focus:outline-none focus:border-[#D4A843]"
                >
                  <option value="">—</option>
                  {COLOR_OPTIONS.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                Origin (kid&rsquo;s campus)
              </span>
              <input
                type="text"
                value={origin}
                onChange={e => setOrigin(e.target.value)}
                placeholder="YDO Campus · Northern Uganda"
                className="w-full px-3 py-2 border border-[#e8e0d4] bg-white text-[#0d0d0d] focus:outline-none focus:border-[#D4A843]"
              />
              <span className="block text-xs text-[#888] mt-1">
                Where the kid is &mdash; not where the shirt was made.
                Default works for every YDO kid.
              </span>
            </label>

            <div className="pt-4">
              <button
                type="button"
                onClick={handlePrint}
                className="w-full bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm px-5 py-3 transition-colors"
              >
                Print label
              </button>
              <p className="text-xs text-[#888] mt-3 leading-relaxed">
                Use the browser print dialog. Pick your label printer
                under Destination. Confirm paper size is 4&rdquo;×6&rdquo;.
              </p>
            </div>
          </div>

          {/* Label preview — the only element printed. */}
          <div className="flex justify-center">
            <div
              className="print-label bg-white border border-[#e8e0d4] shadow-md"
              style={{
                width: '4in',
                height: '6in',
                padding: '0.3in 0.36in',
                display: 'flex',
                flexDirection: 'column',
                color: '#0d0d0d',
                fontFamily: SANS,
              }}
            >
              {/* Wordmark + product category. The category line is
                  what answers &ldquo;is this a t-shirt?&rdquo; in two seconds.
                  Gold small caps so it reads as a hangtag spec line
                  rather than competing with the brand mark. */}
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: '0.14in',
                }}
              >
                <div
                  style={{
                    fontFamily: LORA,
                    fontSize: '12pt',
                    letterSpacing: '0.32em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Be A Number
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '7.5pt',
                    color: '#D4A843',
                    marginTop: '5px',
                    letterSpacing: '0.28em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Hand-printed cotton tee
                </div>
              </div>

              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              {/* Hook — BAN&rsquo;s canonical brand line, used here as the
                  headline. The word &ldquo;Shirt&rdquo; in the first
                  sentence reinforces the category at the body-copy
                  level for retail readers skimming. */}
              <div
                style={{
                  padding: '0.22in 0 0.08in',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: LORA,
                    fontSize: '12.5pt',
                    fontWeight: 600,
                    lineHeight: 1.35,
                    color: '#0d0d0d',
                  }}
                >
                  Every Shirt has a Number.
                  <br />
                  Every Number is a Child.
                </div>
              </div>

              {/* Mystery hero — three giant question marks, dead
                  center, lots of weight. Category is now answered
                  above, so the mystery is purely &ldquo;who?&rdquo; */}
              <div
                style={{
                  textAlign: 'center',
                  padding: '0.02in 0 0.04in',
                  fontFamily: SANS,
                  fontSize: '74pt',
                  fontWeight: 900,
                  lineHeight: 0.9,
                  letterSpacing: '0.04em',
                  color: '#0d0d0d',
                }}
              >
                ???
              </div>

              {/* Resolution — what to do next. Direct, two sentences,
                  voice-doc-compliant. The URL gets the gold accent
                  (sparingly per voice.md). */}
              <div
                style={{
                  padding: '0.06in 0 0.12in',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: LORA,
                    fontSize: '10pt',
                    fontWeight: 600,
                    color: '#0d0d0d',
                    lineHeight: 1.35,
                  }}
                >
                  Your Number is on the back.
                  <br />
                  Meet your Child at
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '13pt',
                    fontWeight: 800,
                    color: '#D4A843',
                    letterSpacing: '0.04em',
                    marginTop: '3px',
                  }}
                >
                  beanumber.org
                </div>
              </div>

              {/* Utility footer — Size and Color side by side, with
                  the geography below. Geography is named precisely:
                  &ldquo;YDO Campus · Northern Uganda&rdquo; — so it reads
                  as &ldquo;the kid is at this campus&rdquo; not the
                  ambiguous &ldquo;Country: Uganda&rdquo; which could
                  misread as &ldquo;made in.&rdquo; */}
              <div
                style={{
                  marginTop: 'auto',
                  borderTop: '1px solid #0d0d0d',
                  paddingTop: '0.12in',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.16in',
                    marginBottom: '0.1in',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontSize: '7pt',
                        letterSpacing: '0.26em',
                        textTransform: 'uppercase',
                        color: '#888',
                        fontWeight: 700,
                        marginBottom: '2px',
                      }}
                    >
                      Size
                    </div>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontSize: '14pt',
                        fontWeight: 800,
                        color: '#0d0d0d',
                      }}
                    >
                      {size || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontSize: '7pt',
                        letterSpacing: '0.26em',
                        textTransform: 'uppercase',
                        color: '#888',
                        fontWeight: 700,
                        marginBottom: '2px',
                      }}
                    >
                      Color
                    </div>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontSize: '14pt',
                        fontWeight: 800,
                        color: '#0d0d0d',
                      }}
                    >
                      {color || '—'}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    textAlign: 'center',
                    fontFamily: SANS,
                    fontSize: '7pt',
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: '#D4A843',
                    fontWeight: 700,
                    paddingTop: '0.06in',
                    borderTop: '1px dashed #ccc',
                  }}
                >
                  {origin || ' '}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrintLabelClient() {
  return (
    <Suspense fallback={null}>
      <PrintLabelInner />
    </Suspense>
  );
}
