'use client';

/**
 * Catalog UI for the bag label printer.
 *
 * Renders a 5×4 grid of all size × color combinations. Each tile is
 * a deep-link to /admin/print-label?size=X&color=Y, where the
 * single-label print page opens with the values pre-filled. Kevin
 * picks a tile when packing an order, hits Print on the next page,
 * sends to his Flashlabel Pro thermal printer.
 *
 * The tiles include a small visual swatch of the shirt color
 * (background fill) so Kevin can scan the catalog by sight rather
 * than reading every label. Black shirts get a near-black swatch
 * with white text; the pastel colors get tinted swatches with
 * dark text.
 */

import Link from 'next/link';
import {
  SIZE_OPTIONS,
  COLOR_OPTIONS,
} from '../PrintLabelClient';

// Visual swatch tints for each color. Tuned for legibility on a
// catalog tile, not literal cotton color — they need to identify
// the color quickly while keeping the tile&rsquo;s typography readable.
const COLOR_SWATCH: Record<
  (typeof COLOR_OPTIONS)[number],
  { bg: string; text: string; border: string }
> = {
  Pink: { bg: '#f3cfd4', text: '#0d0d0d', border: '#e3a8b1' },
  Green: { bg: '#c8dfc5', text: '#0d0d0d', border: '#a5c5a0' },
  Black: { bg: '#1a1a1a', text: '#FFF8F0', border: '#000000' },
  Blue: { bg: '#bdd5e5', text: '#0d0d0d', border: '#9bb9cd' },
};

const LORA = 'var(--font-lora), Georgia, "Times New Roman", serif';

export function LabelCatalogClient() {
  return (
    <div className="min-h-screen bg-[#f5f0e8] text-[#0d0d0d]">
      <div className="max-w-5xl mx-auto px-5 py-6 md:py-10">
        <div className="mb-8">
          <Link
            href="/admin"
            className="text-xs text-[#888] hover:text-[#0d0d0d] uppercase tracking-[0.15em] font-bold"
          >
            ← Admin
          </Link>
          <h1
            className="text-3xl text-[#0d0d0d] mt-3"
            style={{ fontFamily: LORA, fontWeight: 600 }}
          >
            Bag label catalog
          </h1>
          <p className="text-sm text-[#666] mt-2 leading-relaxed max-w-2xl">
            All 20 size × color combinations. Pick a tile to load the
            label with those values pre-filled, then print to your
            Flashlabel Pro (4&rdquo;×6&rdquo; thermal label). The label
            content is identical for every combo — only Size and Color
            change. Customer-facing side leans into the mystery: ORDER #
            and CHILD CONNECTED TO render as &ldquo;???&rdquo; on every
            bag, and the reveal only happens at beanumber.org/[N] when
            the buyer enters their Number.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {SIZE_OPTIONS.flatMap(size =>
            COLOR_OPTIONS.map(color => {
              const swatch = COLOR_SWATCH[color];
              const href = `/admin/print-label?size=${encodeURIComponent(
                size
              )}&color=${encodeURIComponent(color)}`;
              return (
                <Link
                  key={`${size}-${color}`}
                  href={href}
                  className="group block transition-transform hover:-translate-y-0.5"
                >
                  <div
                    style={{
                      background: swatch.bg,
                      color: swatch.text,
                      borderColor: swatch.border,
                    }}
                    className="border-2 p-4 h-32 flex flex-col items-center justify-center text-center"
                  >
                    <div
                      style={{
                        fontFamily: LORA,
                        fontSize: '32px',
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      {size}
                    </div>
                    <div
                      style={{
                        fontFamily: LORA,
                        fontSize: '16px',
                        fontWeight: 600,
                        marginTop: '6px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {color}
                    </div>
                  </div>
                  <div className="bg-[#0d0d0d] text-[#FFF8F0] text-[10px] font-bold uppercase tracking-[0.25em] text-center py-2 group-hover:bg-[#D4A843] group-hover:text-[#0d0d0d] transition-colors">
                    Open &amp; Print →
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="mt-10 border-t border-[#e8e0d4] pt-6 text-sm text-[#666] leading-relaxed max-w-2xl">
          <p className="font-bold text-[#0d0d0d] mb-2 uppercase tracking-[0.15em] text-xs">
            First-time print tips
          </p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>
              Paper size: <strong>100mm × 150mm</strong> on your
              Flashlabel Pro (the exact dimensions the label is
              built for — no scaling).
            </li>
            <li>
              In the browser print dialog, expand{' '}
              <strong>More settings</strong>. Set Margins to{' '}
              <strong>None</strong> and uncheck{' '}
              <strong>Headers and footers</strong> — that kills the
              page URL / date that&rsquo;d otherwise print along the
              bottom edge.
            </li>
            <li>
              Scale: <strong>100%</strong> (not &ldquo;Fit to page&rdquo;).
              The label is sized to fill the paper exactly.
            </li>
            <li>
              First run, &ldquo;Save as PDF&rdquo; to verify the layout
              before sending real labels through.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
