'use client';

/**
 * 3D rotating globe with Uganda highlighted.
 *
 * First-time visitors get a 3.5-second cinematic intro: camera starts
 * over North America (where the buyer probably is), spins eastward to
 * East Africa, zooms in, Uganda pulses gold, settles into a gentle
 * ambient rotation. Repeat visitors skip the intro and land on the
 * already-pointed-at Uganda. localStorage tracks who's seen it.
 *
 * Click the globe → fires onExpand() to open the Uganda context panel
 * in the parent. Same effect as clicking the location pill.
 *
 * Built on react-globe.gl (Three.js wrapper). The actual import happens
 * via next/dynamic with ssr: false because Three.js needs window.WebGL.
 * Globe textures pull from globe.gl's CDN so we don't bundle them.
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// react-globe.gl is dynamically imported to keep the ~700KB Three.js
// bundle out of the kid page's initial HTML stream. The placeholder
// during load is a static gold circle so the layout doesn't jump.
const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => <GlobePlaceholder />,
});

// Approximate center of Uganda — close enough for a 3D camera target.
const UGANDA_LAT = 1.37;
const UGANDA_LNG = 32.29;

// Where the camera starts on intro: over the eastern US (where most
// US-based shirt buyers live). Spinning eastward from here to East
// Africa feels like a natural "look across the ocean to find them"
// camera move.
const NORTH_AMERICA_LAT = 38;
const NORTH_AMERICA_LNG = -77;

// Globe size — fits the right column under the kid's name.
const GLOBE_DIAMETER = 240;

// localStorage key — track who's seen the intro animation. Per-device,
// not per-kid (the intro is a brand moment, not a per-kid moment).
const INTRO_SEEN_KEY = 'ban-globe-intro-seen-v1';

/**
 * Inline Uganda polygon — slim GeoJSON for the highlight. Coordinates
 * trace the country's border with ~30 points, accurate enough to look
 * like Uganda at small map scales. Avoids a network fetch for borders
 * data on every kid page load.
 */
const UGANDA_FEATURE = {
  type: 'Feature' as const,
  properties: { name: 'Uganda' },
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        // Border points, going clockwise from the NW corner.
        // Approximated from Natural Earth at 1:50m simplification.
        [31.16, 3.79],
        [31.96, 3.69],
        [32.45, 3.61],
        [32.96, 3.79],
        [33.91, 4.00],
        [34.07, 4.18],
        [34.49, 3.56],
        [34.97, 3.24],
        [35.00, 2.46],
        [34.78, 1.72],
        [34.65, 1.05],
        [34.83, 0.53],
        [34.18, 0.45],
        [33.95, 0.10],
        [33.96, -0.50],
        [33.49, -0.95],
        [32.61, -1.13],
        [31.81, -1.03],
        [30.83, -1.01],
        [30.47, -1.07],
        [29.94, -1.46],
        [29.83, -1.34],
        [29.59, -1.39],
        [29.58, -0.59],
        [29.82, -0.21],
        [29.88, 0.40],
        [30.09, 1.07],
        [30.78, 1.59],
        [31.30, 2.20],
        [31.16, 2.20],
        [31.16, 3.79],
      ],
    ],
  },
};

export function UgandaGlobe({ onClick }: { onClick?: () => void }) {
  const globeRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);
  const [pulseAlt, setPulseAlt] = useState(0.01);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Once Globe is mounted, drive the camera + auto-rotate.
  // Two paths:
  //   - First visit: start camera at NA, animate to Uganda over 3s,
  //     pulse the polygon, then enable slow auto-rotate.
  //   - Repeat visit: jump straight to Uganda, enable auto-rotate.
  const onGlobeReady = () => {
    const g = globeRef.current;
    if (!g) return;

    // Make controls slow + smooth for the ambient idle state.
    const controls = g.controls();
    if (controls) {
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35; // ~1 rotation per 90s — gentle, not distracting
    }

    const seen = typeof window !== 'undefined' && window.localStorage.getItem(INTRO_SEEN_KEY);

    if (seen) {
      // Repeat visit: point at Uganda immediately, no intro.
      g.pointOfView({ lat: UGANDA_LAT, lng: UGANDA_LNG, altitude: 1.6 }, 0);
      return;
    }

    // First visit: cinematic intro.
    // Frame 1 (0ms): camera starts over North America, zoomed out.
    g.pointOfView({ lat: NORTH_AMERICA_LAT, lng: NORTH_AMERICA_LNG, altitude: 2.4 }, 0);

    // Pause auto-rotate during the intro so it doesn't fight the
    // programmatic camera animation.
    if (controls) controls.autoRotate = false;

    // Frame 2 (after 600ms): start the long sweep east + south to Uganda.
    // Duration 2400ms — long enough to feel cinematic, short enough that
    // the user doesn't get bored before the rest of the page is usable.
    setTimeout(() => {
      g.pointOfView(
        { lat: UGANDA_LAT, lng: UGANDA_LNG, altitude: 1.6 },
        2400
      );
    }, 600);

    // Frame 3 (after ~3000ms total): pulse Uganda by briefly lifting
    // the polygon altitude, then settling it back. Visual "found you."
    setTimeout(() => {
      setPulseAlt(0.04);
      setTimeout(() => setPulseAlt(0.015), 700);
    }, 3000);

    // Frame 4 (after 3800ms): re-enable ambient rotation, mark intro seen.
    setTimeout(() => {
      if (controls) controls.autoRotate = true;
      try {
        window.localStorage.setItem(INTRO_SEEN_KEY, '1');
      } catch {
        // localStorage disabled (private mode) — fine, intro plays every visit
      }
    }, 3800);
  };

  if (!mounted) return <GlobePlaceholder />;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer select-none"
      style={{ width: GLOBE_DIAMETER, height: GLOBE_DIAMETER }}
      title="Click to learn more about Uganda"
    >
      <Globe
        ref={globeRef}
        width={GLOBE_DIAMETER}
        height={GLOBE_DIAMETER}
        backgroundColor="rgba(0,0,0,0)"
        // Photoreal Earth from globe.gl's CDN. ~150KB, cached after first load.
        globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
        // Subtle atmosphere ring — gives the globe a sense of depth.
        showAtmosphere={true}
        atmosphereColor="#D4A843"
        atmosphereAltitude={0.18}
        // Uganda highlight — a single polygon drawn slightly above the
        // surface and tinted gold. Altitude is state so we can pulse it
        // during the intro.
        polygonsData={[UGANDA_FEATURE]}
        polygonCapColor={() => 'rgba(212, 168, 67, 0.85)'}
        polygonSideColor={() => 'rgba(212, 168, 67, 0.45)'}
        polygonStrokeColor={() => '#0d0d0d'}
        polygonAltitude={pulseAlt}
        polygonsTransitionDuration={400}
        onGlobeReady={onGlobeReady}
      />
    </div>
  );
}

/**
 * Lightweight placeholder while the Globe library lazy-loads. Matches
 * the final size so the layout doesn't jump when the globe replaces it.
 */
function GlobePlaceholder() {
  return (
    <div
      className="rounded-full bg-gradient-to-br from-[#1a3a6e] via-[#2d5a8a] to-[#0d2040] flex items-center justify-center"
      style={{ width: GLOBE_DIAMETER, height: GLOBE_DIAMETER }}
      aria-hidden
    >
      <span className="text-[#D4A843] text-xs font-bold tracking-widest opacity-70">
        LOADING…
      </span>
    </div>
  );
}
