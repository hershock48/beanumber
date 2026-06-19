'use client';

/**
 * Client side of the bag label printer. Form on the left, live
 * label preview on the right. Hit Print → @media print kicks in,
 * hides everything except the label sized to a 4&rdquo;×6&rdquo; thermal
 * label.
 *
 * Design philosophy: lean into the mystery box mechanic. The order
 * number and the matched kid&rsquo;s name are intentionally rendered as
 * question marks on the bag — the bag NEVER reveals who&rsquo;s behind
 * the Shirt. The reveal happens only at beanumber.org/[N] when the
 * buyer enters their Number. Every bag is identical from the
 * customer-facing side — retail-ready: a shirt on a shelf has
 * &ldquo;ORDER # ??????? · CHILD CONNECTED TO ???????&rdquo; as the
 * conversation starter.
 *
 * Typography per voice.md:
 *   - Be A Number wordmark and the closing tagline = Lora serif
 *     (the brand heading face)
 *   - Everything else = system sans-serif, voice.md body face
 *
 * Layout per Kevin&rsquo;s mockup (centered, big question marks,
 * horizontal rules between sections, vertical divider between
 * Size and Color).
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

  // Field-label styling — small caps, gold accent, generous tracking.
  // Matches the tiny-label pattern from voice.md
  // (text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]).
  const labelStyle: React.CSSProperties = {
    fontFamily: SANS,
    fontSize: '8.5pt',
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    color: '#D4A843',
    fontWeight: 700,
    textAlign: 'center',
  };

  const mysteryValueStyle: React.CSSProperties = {
    fontFamily: SANS,
    fontSize: '34pt',
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: '#0d0d0d',
    textAlign: 'center',
    lineHeight: 1,
    marginTop: '0.08in',
  };

  const realValueStyle: React.CSSProperties = {
    fontFamily: SANS,
    fontSize: '22pt',
    fontWeight: 800,
    color: '#0d0d0d',
    textAlign: 'center',
    lineHeight: 1.1,
    marginTop: '0.06in',
  };

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
            Pick Size and Color, then Print. ORDER # and CHILD
            CONNECTED TO are rendered as question marks on every bag
            — the reveal only happens at beanumber.org/[N] when the
            buyer enters their Number. Same label fits every bag,
            retail-ready.
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

          {/* Label preview — the only thing printed. */}
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
              {/* Wordmark — Lora, the heading face. Sits centered at
                  the very top, no rule above. */}
              <div
                style={{
                  textAlign: 'center',
                  paddingBottom: '0.18in',
                  marginBottom: '0.06in',
                }}
              >
                <div
                  style={{
                    fontFamily: LORA,
                    fontSize: '11pt',
                    letterSpacing: '0.32em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Be A Number
                </div>
              </div>

              {/* Top rule. */}
              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              {/* ORDER # — the question marks are the hero. */}
              <div style={{ padding: '0.18in 0 0.12in' }}>
                <div style={labelStyle}>Order #</div>
                <div style={mysteryValueStyle}>???????</div>
              </div>

              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              {/* CHILD CONNECTED TO — same mystery hero. */}
              <div style={{ padding: '0.18in 0 0.12in' }}>
                <div style={labelStyle}>Child Connected To</div>
                <div style={mysteryValueStyle}>???????</div>
              </div>

              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              {/* Size + Color — two-column with a vertical divider. */}
              <div
                style={{
                  padding: '0.18in 0 0.14in',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1px 1fr',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={labelStyle}>Size</div>
                  <div style={realValueStyle}>{size || '—'}</div>
                </div>
                <div
                  style={{
                    height: '1in',
                    background: '#0d0d0d',
                    margin: '0 auto',
                    alignSelf: 'center',
                  }}
                />
                <div>
                  <div style={labelStyle}>Color</div>
                  <div style={realValueStyle}>{color || '—'}</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #0d0d0d' }} />

              {/* COUNTRY — the brand anchor. */}
              <div style={{ padding: '0.16in 0 0.14in' }}>
                <div style={labelStyle}>Country</div>
                <div style={realValueStyle}>{country || '—'}</div>
              </div>

              {/* Tagline footer — Lora, voice.md brand sentence. */}
              <div
                style={{
                  marginTop: 'auto',
                  textAlign: 'center',
                  paddingTop: '0.18in',
                  borderTop: '2px solid #0d0d0d',
                }}
              >
                <div
                  style={{
                    fontFamily: LORA,
                    fontSize: '10pt',
                    lineHeight: 1.35,
                    color: '#0d0d0d',
                    fontWeight: 600,
                  }}
                >
                  Every Shirt has a Number.
                  <br />
                  Every Number is a Child.
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: '8pt',
                    color: '#666',
                    marginTop: '6px',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Meet yours at beanumber.org
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
