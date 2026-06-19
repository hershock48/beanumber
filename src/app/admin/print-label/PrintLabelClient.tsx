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

import { Suspense, useEffect, useRef, useState } from 'react';
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
  const [shareState, setShareState] = useState<'idle' | 'working' | 'error'>(
    'idle'
  );
  const [shareError, setShareError] = useState<string | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);

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

  /**
   * Capture the label DOM as a PNG and hand it to the OS share sheet
   * (iOS / Android) so Kevin can pick the Flashlabel Pro app as the
   * destination. This is the mobile workflow — desktop users can keep
   * using the Print button to send to a connected printer directly.
   *
   * Falls back to a plain download if navigator.share isn&rsquo;t available
   * or doesn&rsquo;t support files (older Android, desktop Safari).
   */
  async function handleShare() {
    if (!labelRef.current) return;
    setShareState('working');
    setShareError(null);
    try {
      // Lazy-load html-to-image so the bundle stays small for the
      // 99% of admin sessions that never hit the share button.
      const { toBlob } = await import('html-to-image');
      // pixelRatio 3 gives ~300 DPI output at the label&rsquo;s 100×150mm
      // physical size — well within the Flashlabel Pro&rsquo;s native
      // resolution, no further upscaling needed inside the app.
      const blob = await toBlob(labelRef.current, {
        pixelRatio: 3,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      if (!blob) throw new Error('Could not generate label image.');

      const filename = `ban-label-${(size || 'X').toLowerCase()}-${(color || 'X').toLowerCase()}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };

      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({
          files: [file],
          title: 'BAN bag label',
          text: `BAN bag label · ${size || ''} ${color || ''}`.trim(),
        });
        setShareState('idle');
        return;
      }

      // Fallback: trigger a download. iOS Files / Android Files can
      // open the saved PNG and share to the Flashlabel Pro app from
      // there.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShareState('idle');
    } catch (err) {
      console.error('[print-label share] failed:', err);
      setShareState('error');
      setShareError(
        err instanceof Error ? err.message : 'Could not share the label.'
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] text-[#0d0d0d]">
      <style>{`
        @media print {
          /* Flashlabel Pro paper is exactly 100mm × 150mm. Setting
             @page in mm (not inches) so the browser doesn&rsquo;t
             scale-to-fit between &ldquo;close to but not exactly 4in × 6in&rdquo;
             and the actual physical paper. margin: 0 tells the
             browser to suppress its default header/footer (page URL,
             date, page number) — although in practice Chrome / Safari
             also need the user to disable &ldquo;Headers and footers&rdquo;
             in the print dialog&rsquo;s &ldquo;More settings&rdquo; pane to fully
             remove them. See print-tips on the form for the user
             instruction. */
          @page {
            size: 100mm 150mm;
            margin: 0;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100mm !important;
            height: 150mm !important;
          }
          .print-hide {
            display: none !important;
          }
          .print-label {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            width: 100mm !important;
            height: 150mm !important;
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
              {/* Mobile-first &ldquo;Save & Share&rdquo; button. On
                  iOS / Android the share sheet appears with Flashlabel
                  Pro as one of the destinations. Falls back to a PNG
                  download on desktop where navigator.share isn&rsquo;t
                  available. This is the path Kevin uses from his phone:
                  tap, pick Flashlabel Pro, print. */}
              <button
                type="button"
                onClick={handleShare}
                disabled={shareState === 'working'}
                className={`w-full font-bold uppercase tracking-wider text-sm px-5 py-3 transition-colors ${
                  shareState === 'working'
                    ? 'bg-[#D4A843]/70 text-[#0d0d0d] cursor-wait'
                    : 'bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d]'
                }`}
              >
                {shareState === 'working'
                  ? 'Preparing…'
                  : 'Save & share to Flashlabel Pro'}
              </button>
              {shareState === 'error' && shareError && (
                <p className="mt-2 text-xs text-red-600">
                  {shareError}
                </p>
              )}

              {/* Desktop browser print — secondary path for users on a
                  laptop wired straight to a label printer. */}
              <button
                type="button"
                onClick={handlePrint}
                className="mt-2 w-full bg-white border border-[#e8e0d4] hover:border-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-xs px-5 py-2.5 transition-colors"
              >
                Or print directly (desktop)
              </button>
              <div className="mt-4 bg-white border border-[#e8e0d4] p-3 text-xs text-[#555] leading-relaxed space-y-2">
                <p className="font-bold uppercase tracking-[0.15em] text-[10px] text-[#0d0d0d]">
                  How to print
                </p>
                <p>
                  <strong>On your phone</strong> (the usual path):
                  tap <strong>Save & share to Flashlabel Pro</strong>.
                  The label generates as a PNG image and the share
                  sheet opens — pick the Flashlabel Pro app, then
                  print from inside the app.
                </p>
                <p>
                  <strong>On desktop</strong>: tap{' '}
                  <strong>Or print directly</strong>. In the browser
                  print dialog, set paper size to{' '}
                  <strong>100mm × 150mm</strong>, Margins to{' '}
                  <strong>None</strong>, uncheck{' '}
                  <strong>Headers and footers</strong> (kills the URL/
                  date the browser otherwise stamps at the bottom),
                  and Scale to <strong>100%</strong>. Chrome remembers
                  these per destination, so you set it once.
                </p>
              </div>
            </div>
          </div>

          {/* Label preview — the only element printed. Dimensions
              match the Flashlabel Pro paper exactly (100mm × 150mm)
              so the on-screen preview is what prints. Padding sized
              proportionally for the smaller page (8mm side / 7mm
              top-bottom). The ref is what the Save & Share button
              captures via html-to-image to hand off to the iOS / Android
              share sheet → Flashlabel Pro app. */}
          <div className="flex justify-center">
            <div
              ref={labelRef}
              className="print-label bg-white border border-[#e8e0d4] shadow-md"
              style={{
                width: '100mm',
                height: '150mm',
                padding: '7mm 8mm',
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
                    fontSize: '15pt',
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
                    fontSize: '9pt',
                    color: '#0d0d0d',
                    marginTop: '5px',
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Hand-printed cotton tee
                </div>
              </div>

              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              {/* Labeled mystery rows — Kevin's daughter user-tested
                  the single ??? hero and didn't connect it to
                  &ldquo;Number&rdquo; or mystery. The labels above each
                  ??? tell the reader WHAT is being hidden, which makes
                  the mystery self-explanatory: &ldquo;Order # is
                  something — and I don't know what.&rdquo; Two labeled
                  rows, stacked, each with its own thin rule. */}
              <div
                style={{
                  padding: '0.18in 0 0.06in',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '8pt',
                    letterSpacing: '0.28em',
                    textTransform: 'uppercase',
                    color: '#0d0d0d',
                    fontWeight: 700,
                    marginBottom: '6px',
                  }}
                >
                  Order #
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '38pt',
                    fontWeight: 900,
                    lineHeight: 0.95,
                    letterSpacing: '0.1em',
                    color: '#0d0d0d',
                  }}
                >
                  ???????
                </div>
              </div>

              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              <div
                style={{
                  padding: '0.16in 0 0.06in',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '8pt',
                    letterSpacing: '0.28em',
                    textTransform: 'uppercase',
                    color: '#0d0d0d',
                    fontWeight: 700,
                    marginBottom: '6px',
                  }}
                >
                  Child Connected To
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '38pt',
                    fontWeight: 900,
                    lineHeight: 0.95,
                    letterSpacing: '0.1em',
                    color: '#0d0d0d',
                  }}
                >
                  ???????
                </div>
              </div>

              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              {/* Resolution — &ldquo;on the back of the Shirt&rdquo;
                  (not just &ldquo;on the back&rdquo;) per daughter&rsquo;s
                  ambiguity feedback. URL gets the inverted-fill
                  treatment for max emphasis on thermal print. */}
              <div
                style={{
                  padding: '0.14in 0 0.1in',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: LORA,
                    fontSize: '11pt',
                    fontWeight: 600,
                    color: '#0d0d0d',
                    lineHeight: 1.35,
                  }}
                >
                  Your Number is on the back of the Shirt.
                  <br />
                  Meet your Child at:
                </div>
                <div
                  style={{
                    background: '#0d0d0d',
                    color: '#ffffff',
                    fontFamily: SANS,
                    fontSize: '14pt',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    marginTop: '7px',
                    padding: '6px 0',
                    display: 'inline-block',
                    minWidth: '2.2in',
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
                        color: '#0d0d0d',
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
                        color: '#0d0d0d',
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
                    fontSize: '7.5pt',
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: '#0d0d0d',
                    fontWeight: 700,
                    paddingTop: '0.08in',
                    borderTop: '1px solid #0d0d0d',
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
