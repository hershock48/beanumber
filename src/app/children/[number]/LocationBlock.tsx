'use client';

/**
 * Geographic context block on every kid page.
 *
 * Sponsors land on a kid page and need to know — quickly, without
 * leaving — WHERE this kid actually lives. Without that anchor the
 * page reads as "child in some far place" instead of "child in this
 * specific community on this specific continent." Geographic
 * anchoring is conversion infrastructure: it lets the buyer hold the
 * relationship as a real place instead of an abstraction.
 *
 * Layout: location pill (always visible) + expandable "About Uganda"
 * with an inline SVG of the continent (Uganda highlighted gold) and
 * a few facts about the region. Collapsed by default so the page
 * stays kid-first; expanded for the curious.
 *
 * The SVG is a simplified continent outline — not geographic data,
 * just enough to communicate "Africa, Uganda is here." Drawn as a
 * single path with each country implied by the continent shape and
 * Uganda's specific location marked by a labeled circle.
 */

import { useState } from 'react';

export function LocationBlock() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-8">
      {/* Always-visible location pill */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="group inline-flex items-center gap-2 text-left"
        aria-expanded={open}
        aria-controls="location-detail"
      >
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
          Lives in
        </span>
        <span className="text-[17px] md:text-lg text-[#0d0d0d] underline decoration-[#D4A843]/40 decoration-2 underline-offset-4 group-hover:decoration-[#D4A843]">
          Uganda
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

      {/* Expandable detail */}
      {open && (
        <div
          id="location-detail"
          className="mt-4 bg-[#FFF8F0] border border-[#e8e0d4] p-5 md:p-6"
        >
          <div className="grid md:grid-cols-[180px,1fr] gap-5 md:gap-6 items-start">
            {/* Africa map with Uganda highlighted */}
            <div className="flex justify-center md:justify-start">
              <AfricaMap />
            </div>

            {/* Context paragraph */}
            <div>
              <p className="text-[15px] md:text-base text-[#444] leading-relaxed">
                The campus sits in <strong>Omoro District</strong>, in Northern
                Uganda — about 230 miles north of the capital, Kampala.
                Northern Uganda spent two decades rebuilding after a long
                conflict that ended in 2006. Today the region is home to
                about 270,000 people, most of them farming families. Our
                six-acre school, clinic, and vocational training campus
                opened to serve this community directly.
              </p>
              <p className="mt-3 text-[13px] text-[#888]">
                The kids you sponsor live within walking distance of the
                campus and attend classes here every day.{' '}
                <a
                  href="/story"
                  className="text-[#D4A843] font-semibold underline decoration-[#D4A843]/40 underline-offset-2 hover:decoration-[#D4A843]"
                >
                  Read the full story →
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Simplified Africa outline with Uganda marked in BAN gold.
 *
 * Hand-drawn polygon: not geo-accurate, but recognizable as Africa.
 * Uganda sits at roughly the right vertical center on the east side
 * (just below the Horn of Africa indentation). Marked with a gold
 * dot + label.
 */
function AfricaMap() {
  return (
    <svg
      viewBox="0 0 200 240"
      width="160"
      height="192"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Map of Africa with Uganda highlighted"
    >
      {/* Africa silhouette — simplified path */}
      <path
        d="
          M 55 25
          L 70 18
          L 95 16
          L 120 22
          L 145 30
          L 162 45
          L 165 60
          L 170 75
          L 175 95
          Q 178 105 168 110
          L 170 115
          L 178 122
          L 165 138
          L 158 155
          L 152 175
          L 145 195
          L 130 215
          L 110 228
          L 90 225
          L 75 215
          L 65 195
          L 58 175
          L 50 155
          L 42 135
          L 36 115
          L 32 95
          L 30 75
          L 35 55
          L 45 38
          Z
        "
        fill="#f5e9c8"
        stroke="#d4b675"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Uganda — small highlight region near east-center */}
      <circle cx="130" cy="115" r="6" fill="#D4A843" stroke="#0d0d0d" strokeWidth="0.5" />

      {/* Label line to Uganda */}
      <line x1="130" y1="115" x2="172" y2="100" stroke="#0d0d0d" strokeWidth="0.8" />
      <text
        x="174"
        y="103"
        fontSize="11"
        fontWeight="700"
        fill="#0d0d0d"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        Uganda
      </text>

      {/* Subtle "AFRICA" label at the bottom of the continent */}
      <text
        x="100"
        y="160"
        fontSize="9"
        fontWeight="600"
        fill="#a08555"
        textAnchor="middle"
        letterSpacing="2"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        AFRICA
      </text>
    </svg>
  );
}
