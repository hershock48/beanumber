'use client';

/**
 * CSS-animated globe with Uganda highlighted.
 *
 * Pure CSS + SVG implementation — no Three.js, no react-globe.gl, no
 * runtime dependencies. The Earth texture is positioned so Uganda
 * sits at the center-front of the visible sphere; a gold marker
 * pulses over that exact spot. Ambient motion (gentle sway + breath
 * glow) keeps the globe feeling alive without the marker drifting
 * off the country it's anchored to.
 *
 * Why CSS instead of WebGL:
 *   - Always renders (no library compatibility risks on Next 16 +
 *     React 19 + turbopack).
 *   - ~5KB total weight vs ~700KB for Three.js.
 *   - Performant on every device.
 *
 * Texture math:
 *   - Equirectangular projection: lng -180..+180, lat +90..-90.
 *   - Uganda center: lat 1.37°N, lng 32.29°E.
 *   - On a 2:1 texture sized to 200% of the container width, Uganda
 *     sits at backgroundPosition X = -(58.97% - 25%) * 2 = -67.94%
 *     to center it in the visible circle. Sway oscillates around
 *     that value by ±4% for a subtle "breathing planet" effect.
 */

const GLOBE_DIAMETER = 240;

// NASA Blue Marble equirectangular — public domain, served via jsdelivr.
const EARTH_TEXTURE_URL =
  '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg';

export function UgandaGlobe({ onClick }: { onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer select-none group"
      style={{ width: GLOBE_DIAMETER, height: GLOBE_DIAMETER }}
      title="Click to learn more about Uganda"
      aria-label="Globe showing the location of Uganda"
    >
      {/* The sphere — circular div masked over the Earth texture, with
          Uganda positioned at the center-front. Gently sways for an
          ambient "alive" feel without losing the marker's anchor. */}
      <div
        className="ban-globe-sphere"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          backgroundImage: `url('${EARTH_TEXTURE_URL}')`,
          backgroundSize: '200% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: '-67.94% 50%',
          animation: 'ban-globe-sway 24s ease-in-out infinite',
          boxShadow:
            'inset -25px -25px 50px rgba(0,0,0,0.55), inset 15px 15px 35px rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.35), 0 0 40px rgba(212,168,67,0.18)',
        }}
      />

      {/* Atmospheric glow ring — breathes slowly. */}
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

      {/* Uganda marker — sits at the center where Uganda is rendered
          on the texture. Pulsing ring + solid gold dot. */}
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
        {/* Outer pulsing ring */}
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

      {/* Hover affordance */}
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

      <style jsx>{`
        @keyframes ban-globe-sway {
          0%, 100% { background-position: -67.94% 50%; }
          50%      { background-position: -71.94% 50%; }
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
