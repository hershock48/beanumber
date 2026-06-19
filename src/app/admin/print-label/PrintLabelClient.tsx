'use client';

/**
 * Client side of the bag label printer. Form on the left, live
 * label preview on the right. Hit Print → @media print kicks in,
 * hides everything except the label sized to a 4&rdquo;×6&rdquo; thermal
 * label.
 *
 * v3 design — mystery-first with a single emotional hook.
 *
 * Earlier versions had two parallel mystery rows (Order # ??? /
 * Child ???) that read as symmetric but flat — the buyer&rsquo;s eye
 * didn&rsquo;t know where to land. v3 has ONE massive ??? as the visual
 * hero, framed by two short brand sentences: &ldquo;There&rsquo;s a kid
 * behind this Number.&rdquo; above and &ldquo;Meet them at beanumber.org.&rdquo;
 * below.
 *
 * Designed for two scenarios:
 *
 *   1. Online buyer opens their package. The label confirms what
 *      they bought into — &ldquo;yes, your number is in here, and
 *      the kid is at the URL.&rdquo; Anticipation peaks at the moment
 *      they&rsquo;re about to flip the shirt and read the number.
 *
 *   2. Retail shopper sees the bagged shirt on a shelf. &ldquo;There&rsquo;s
 *      a kid behind this Number&rdquo; stops them. The question marks
 *      drive curiosity. The URL gives them a clear next step.
 *
 * Typography per voice.md:
 *   - Brand wordmark + headline + resolution = Lora serif
 *   - Question mark hero + utility footer = system sans
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
const COLOR_OPTIONS = ['Onyx', 'Meadow', 'Blossom', 'Sky', 'Pink'] as const;

const LORA = 'var(--font-lora), Georgia, "Times New Roman", serif';
const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

function PrintLabelInner() {
  const params = useSearchParams();
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [country, setCountry] = useState('Uganda');

  useEffect(() => {
    const s = params.get('size');
    const c = params.get('color');
    const ctry = params.get('country');
    if (s) setSize(s);
    if (c) setColor(c);
    if (ctry) setCountry(ctry);
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
          <h1
            className="text-2xl text-[#0d0d0d]"
            style={{ fontFamily: LORA, fontWeight: 600 }}
          >
            Bag label
          </h1>
          <p className="text-sm text-[#666] mt-1 leading-relaxed">
            Pick Size and Color, then Print. The label leans into
            the mystery — &ldquo;There&rsquo;s a kid behind this
            Number&rdquo; framed by a massive ??? as the visual hero,
            with the URL underneath. Identical on every bag, retail-
            ready, the reveal only happens at beanumber.org/[N] when
            the buyer enters their Number.
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
                Country
              </span>
              <input
                type="text"
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="Uganda"
                className="w-full px-3 py-2 border border-[#e8e0d4] bg-white text-[#0d0d0d] focus:outline-none focus:border-[#D4A843]"
              />
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
                padding: '0.32in 0.4in',
                display: 'flex',
                flexDirection: 'column',
                color: '#0d0d0d',
                fontFamily: SANS,
              }}
            >
              {/* Wordmark — tiny brand anchor at top, no rule above. */}
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: '0.14in',
                }}
              >
                <div
                  style={{
                    fontFamily: LORA,
                    fontSize: '10pt',
                    letterSpacing: '0.34em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Be A Number
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '7pt',
                    color: '#888',
                    marginTop: '4px',
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  beanumber.org
                </div>
              </div>

              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              {/* Headline — Lora 600, the emotional setup. Short
                  sentence, centered, generous line-height. */}
              <div
                style={{
                  padding: '0.24in 0 0.12in',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: LORA,
                    fontSize: '14pt',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    color: '#0d0d0d',
                  }}
                >
                  There&rsquo;s a kid
                  <br />
                  behind this Number.
                </div>
              </div>

              {/* Mystery hero — single huge ???. System sans extra
                  bold, slight tracking, dead-center. This is the
                  visual hook that pulls the eye. */}
              <div
                style={{
                  textAlign: 'center',
                  padding: '0.04in 0 0.06in',
                  fontFamily: SANS,
                  fontSize: '78pt',
                  fontWeight: 900,
                  lineHeight: 0.9,
                  letterSpacing: '0.04em',
                  color: '#0d0d0d',
                }}
              >
                ???
              </div>

              {/* Resolution — the call to action that resolves the
                  mystery. Small but bold, gold accent for warmth. */}
              <div
                style={{
                  padding: '0.12in 0 0.2in',
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
                  Meet them at
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '13pt',
                    fontWeight: 800,
                    color: '#D4A843',
                    letterSpacing: '0.04em',
                    marginTop: '2px',
                  }}
                >
                  beanumber.org
                </div>
              </div>

              {/* Utility footer — Size · Color · Country in a single
                  row at the bottom. Small, sans, dot-separated. Sits
                  above a closing rule. */}
              <div
                style={{
                  marginTop: 'auto',
                  borderTop: '1px solid #0d0d0d',
                  paddingTop: '0.14in',
                }}
              >
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '7pt',
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: '#888',
                    fontWeight: 700,
                    textAlign: 'center',
                    marginBottom: '4px',
                  }}
                >
                  Size · Color · Origin
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '13pt',
                    fontWeight: 800,
                    color: '#0d0d0d',
                    textAlign: 'center',
                    letterSpacing: '0.04em',
                  }}
                >
                  {size || '—'}
                  <span
                    style={{
                      color: '#ccc',
                      fontWeight: 400,
                      margin: '0 0.12in',
                    }}
                  >
                    ·
                  </span>
                  {color || '—'}
                  <span
                    style={{
                      color: '#ccc',
                      fontWeight: 400,
                      margin: '0 0.12in',
                    }}
                  >
                    ·
                  </span>
                  {country || '—'}
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
