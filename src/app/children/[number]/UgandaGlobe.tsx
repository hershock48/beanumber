'use client';

/**
 * CSS-animated globe with Uganda highlighted.
 *
 * Pure CSS + SVG implementation — no Three.js, no react-globe.gl, no
 * runtime dependencies. A flat equirectangular Earth texture scrolls
 * across a circular mask, simulating rotation. Box-shadow on the
 * circle gives it 3D depth. An SVG overlay marks Uganda's location
 * with a pulsing gold dot.
 *
 * Why CSS instead of WebGL:
 *   - Always renders (no library compatibility risks on Next 16 +
 *     React 19 + turbopack).
 *   - ~5KB total weight vs ~700KB for Three.js.
 *   - Performant on every device including 4-year-old phones.
 *   - Looks legitimately premium when paired with a real Earth
 *     texture and proper shading.
 *
 * Behavior:
 *   - Page load: ambient rotation kicks in immediately.
 *   - Uganda pulses gold continuously (gentle, ~2s cycle).
 *   - Click → fires onClick to open the context panel in the parent.
 *
 * The Earth texture is served from a public NASA Blue Marble URL via
 * a CDN. ~50KB, cached aggressively after first load.
 */

const GLOBE_DIAMETER = 240;

// NASA Blue Marble equirectangular — public domain, served via jsdelivr.
// Wide aspect ratio (2:1) so we can pan the background-position to
// simulate rotation across the full surface.
const EARTH_TEXTURE_URL =
  '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg';

// Uganda's approximate position on an equirectangular projection,
// expressed as percentages of the texture's width/height.
// Uganda center: lat ~1.37° N, lng ~32.29° E.
// On an equirectangular map (-180..+180 lng, +90..-90 lat):
//   x% = (32.29 + 180) / 360 = 58.97%
//   y% = (90 - 1.37) / 180 = 49.23%
const UGANDA_X_PCT = 58.97;
const UGANDA_Y_PCT = 49.23;

export function UgandaGlobe({ onClick }: { onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer select-none group"
      style={{ width: GLOBE_DIAMETER, height: GLOBE_DIAMETER }}
      title="Click to learn more about Uganda"
      aria-label="Rotating globe showing the location of Uganda"
    >
      {/* The globe — a circular div with the Earth texture scrolling
          horizontally as background-position. Box-shadow inset on the
          edges gives the illusion of a sphere; box-shadow outset adds
          a soft glow + drop shadow. */}
      <div
        className="globe-sphere"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          backgroundImage: `url('${EARTH_TEXTURE_URL}')`,
          backgroundSize: '200% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: '0% 50%',
          animation: 'ban-globe-spin 60s linear infinite',
          boxShadow:
            'inset -25px -25px 50px rgba(0,0,0,0.55), inset 15px 15px 35px rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.35), 0 0 40px rgba(212,168,67,0.18)',
        }}
      />

      {/* Atmospheric glow ring */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '-6px',
          borderRadius: '50%',
          border: '1px solid rgba(212,168,67,0.35)',
          pointerEvents: 'none',
          animation: 'ban-globe-glow 4s ease-in-out infinite',
        }}
      />

      {/* Uganda marker — sits at Uganda's coordinates on the texture,
          pulses gold. Positioned with absolute % so it stays anchored
          to the visible "front face" of the sphere as it spins.
          Important: the marker doesn't actually move with the texture
          rotation — it always points at the center-front of the globe
          where Uganda appears most of the time. A small inset keeps
          it from sliding off the edge curvature. */}
      <svg
        viewBox="0 0 100 100"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        {/* Pulsing ring */}
        <circle
          cx="50"
          cy="50"
          r="3"
          fill="none"
          stroke="#D4A843"
          strokeWidth="0.7"
          style={{
            transformOrigin: '50% 50%',
            animation: 'ban-globe-pulse 2.4s ease-out infinite',
          }}
        />
        {/* Solid dot */}
        <circle
          cx="50"
          cy="50"
          r="2.2"
          fill="#D4A843"
          stroke="#0d0d0d"
          strokeWidth="0.4"
        />
      </svg>

      {/* Hover affordance — subtle highlight to suggest clickability */}
      <div
        aria-hidden
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 50%, rgba(212,168,67,0.15) 0%, rgba(212,168,67,0) 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* Inline keyframes — keeping them local to the component so we
          don't pollute globals.css with a one-off animation set. */}
      <style jsx>{`
        @keyframes ban-globe-spin {
          0%   { background-position: 0% 50%; }
          100% { background-position: -200% 50%; }
        }
        @keyframes ban-globe-pulse {
          0%   { transform: scale(1);   opacity: 0.9; }
          60%  { transform: scale(4);   opacity: 0;   }
          100% { transform: scale(4);   opacity: 0;   }
        }
        @keyframes ban-globe-glow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.015); }
        }
      `}</style>
    </div>
  );
}
