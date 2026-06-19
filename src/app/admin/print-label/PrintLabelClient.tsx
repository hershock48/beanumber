'use client';

/**
 * Client side of the bag label printer. Form on the left, live
 * label preview on the right. Hit Print → @media print kicks in,
 * hides the form + nav + everything, leaves only the label sized
 * to a 4&rdquo;×6&rdquo; thermal label.
 *
 * URL params are read once on mount so the page can deep-link from
 * a future admin order list with values pre-populated.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
const COLOR_OPTIONS = ['Onyx', 'Meadow', 'Blossom', 'Sky', 'Pink'] as const;

function PrintLabelInner() {
  const params = useSearchParams();
  const [order, setOrder] = useState('');
  const [child, setChild] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [country, setCountry] = useState('Uganda');

  // One-shot pre-fill from URL params. Supports any admin tool that
  // wants to deep-link a pre-populated label (e.g. an order list with
  // a &ldquo;Print bag label&rdquo; button per row).
  useEffect(() => {
    const o = params.get('order');
    const c = params.get('child');
    const s = params.get('size');
    const col = params.get('color');
    const ctry = params.get('country');
    if (o) setOrder(o);
    if (c) setChild(c);
    if (s) setSize(s);
    if (col) setColor(col);
    if (ctry) setCountry(ctry);
  }, [params]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] text-[#0d0d0d]">
      {/* Print CSS — applies only when the browser is preparing to
          print. Hides the form column, the print button, and the
          page chrome. Sizes the label to a 4×6 thermal label and
          centers it. Black-on-white for readability on any printer. */}
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
        {/* Header — hidden when printing. */}
        <div className="print-hide mb-6">
          <h1
            className="text-2xl text-[#0d0d0d]"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Bag label
          </h1>
          <p className="text-sm text-[#666] mt-1 leading-relaxed">
            Fill the four fields, hit Print, then send the page to your
            thermal label printer. Sized to a 4&rdquo;×6&rdquo; thermal
            label. The form and these instructions hide automatically
            when you print.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Form column — hidden when printing. */}
          <div className="print-hide space-y-4">
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                Order #
              </span>
              <input
                type="text"
                value={order}
                onChange={e => setOrder(e.target.value)}
                placeholder="BAN-2026-914"
                className="w-full px-3 py-2 border border-[#e8e0d4] bg-white text-[#0d0d0d] focus:outline-none focus:border-[#D4A843]"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                Child Connected To
              </span>
              <input
                type="text"
                value={child}
                onChange={e => setChild(e.target.value)}
                placeholder="Emmanuel Olubrwot"
                className="w-full px-3 py-2 border border-[#e8e0d4] bg-white text-[#0d0d0d] focus:outline-none focus:border-[#D4A843]"
              />
            </label>

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
                under Destination and confirm paper size is 4&rdquo;×6&rdquo;
                (or set in printer preferences).
              </p>
            </div>
          </div>

          {/* Label preview column — always visible on screen, becomes
              the ONLY thing on the page when printing. */}
          <div className="flex justify-center">
            <div
              className="print-label bg-white border border-[#e8e0d4] shadow-md"
              style={{
                width: '4in',
                height: '6in',
                padding: '0.35in 0.4in',
                display: 'flex',
                flexDirection: 'column',
                color: '#0d0d0d',
                fontFamily:
                  'Georgia, "Times New Roman", serif',
              }}
            >
              {/* Brand mark */}
              <div
                style={{
                  textAlign: 'center',
                  borderBottom: '2px solid #0d0d0d',
                  paddingBottom: '0.18in',
                  marginBottom: '0.28in',
                }}
              >
                <div
                  style={{
                    fontSize: '11pt',
                    letterSpacing: '0.25em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Be A Number
                </div>
                <div
                  style={{
                    fontSize: '8pt',
                    color: '#666',
                    marginTop: '4px',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                  }}
                >
                  beanumber.org
                </div>
              </div>

              {/* Order # */}
              <div style={{ marginBottom: '0.22in' }}>
                <div
                  style={{
                    fontSize: '8pt',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: '#666',
                    fontWeight: 700,
                    marginBottom: '4px',
                  }}
                >
                  Order #
                </div>
                <div
                  style={{
                    fontSize: '16pt',
                    fontWeight: 700,
                    fontFamily: '"Courier New", monospace',
                    letterSpacing: '0.04em',
                  }}
                >
                  {order || ' '}
                </div>
              </div>

              {/* Child Connected To */}
              <div style={{ marginBottom: '0.28in' }}>
                <div
                  style={{
                    fontSize: '8pt',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: '#666',
                    fontWeight: 700,
                    marginBottom: '4px',
                  }}
                >
                  Child Connected To
                </div>
                <div
                  style={{
                    fontSize: '16pt',
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  {child || ' '}
                </div>
              </div>

              {/* Divider */}
              <div
                style={{
                  borderTop: '1px solid #ccc',
                  margin: '0 0 0.22in 0',
                }}
              />

              {/* Size + Color */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.2in',
                  marginBottom: '0.28in',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '8pt',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      color: '#666',
                      fontWeight: 700,
                      marginBottom: '4px',
                    }}
                  >
                    Size
                  </div>
                  <div style={{ fontSize: '20pt', fontWeight: 700 }}>
                    {size || ' '}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '8pt',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      color: '#666',
                      fontWeight: 700,
                      marginBottom: '4px',
                    }}
                  >
                    Color
                  </div>
                  <div style={{ fontSize: '20pt', fontWeight: 700 }}>
                    {color || ' '}
                  </div>
                </div>
              </div>

              {/* Country */}
              <div
                style={{
                  marginTop: 'auto',
                  borderTop: '2px solid #0d0d0d',
                  paddingTop: '0.18in',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    fontSize: '8pt',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: '#666',
                    fontWeight: 700,
                  }}
                >
                  Country
                </div>
                <div style={{ fontSize: '13pt', fontWeight: 700 }}>
                  {country || ' '}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Public wrapper. Suspense is required so useSearchParams doesn&rsquo;t
 * bail the page out of static rendering on Next 16.
 */
export function PrintLabelClient() {
  return (
    <Suspense fallback={null}>
      <PrintLabelInner />
    </Suspense>
  );
}
