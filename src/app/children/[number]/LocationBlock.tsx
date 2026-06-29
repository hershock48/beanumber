'use client';

/**
 * Geographic context block on every kid page.
 *
 * The 3D globe replaces what used to be a hand-drawn SVG + pill.
 * Globe sits in the right column under the kid's name. On first
 * visit, the globe runs a 3.5-second cinematic intro (camera starts
 * over North America, spins to East Africa, zooms in, Uganda pulses
 * gold). Repeat visitors get just the ambient rotation. Clicking the
 * globe expands a context panel below with the Uganda paragraph and
 * a link to /story.
 *
 * Why a globe instead of a flat map: sponsors lean in. A photoreal
 * spinning Earth with Uganda pulsing gold turns "they live in some
 * faraway place" into "they live on this specific point on the
 * planet I'm looking at right now." Conversion infrastructure.
 *
 * The globe is lazy-loaded (~700KB Three.js bundle) so it doesn't
 * block the kid page initial paint. While it's loading, a static
 * gold placeholder holds the layout open.
 */

import { useState } from 'react';
import { UgandaGlobe } from './UgandaGlobe';

export function LocationBlock() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-2 w-full">
      {/* Globe is the visual centerpiece — click it or the label below
          to expand the context panel. Centered in the hero column. */}
      <div className="flex flex-col items-center gap-4">
        <UgandaGlobe onClick={() => setOpen(o => !o)} />

        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="group inline-flex items-center gap-2"
          aria-expanded={open}
          aria-controls="location-detail"
        >
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
            Lives in
          </span>
          <span className="text-base md:text-lg text-[#0d0d0d] underline decoration-[#D4A843]/40 decoration-2 underline-offset-4 group-hover:decoration-[#D4A843]">
            Uganda, Africa
          </span>
          <svg
            className={`w-3 h-3 text-[#aaa] transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Expandable detail — just the context paragraph (globe is
          already visible above). */}
      {open && (
        <div
          id="location-detail"
          className="mt-4 bg-[#FFF8F0] border border-[#e8e0d4] p-5"
        >
          <p className="text-[15px] md:text-base text-[#444] leading-relaxed">
            The campus sits in <strong>Omoro District</strong>, in Northern
            Uganda — about 230 miles north of the capital, Kampala. Northern
            Uganda spent two decades rebuilding after a long conflict that
            ended in 2006. Today the region is home to about 270,000 people,
            most of them farming families. Our six-acre school, clinic, and
            vocational training campus opened to serve this community
            directly.
          </p>
          <p className="mt-3 text-[13px] text-[#888]">
            The kids you sponsor live within walking distance of the campus
            and attend classes here every day.{' '}
            <a
              href="/founder"
              className="text-[#D4A843] font-semibold underline decoration-[#D4A843]/40 underline-offset-2 hover:decoration-[#D4A843]"
            >
              Read the full story →
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
