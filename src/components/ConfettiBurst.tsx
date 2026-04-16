'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';

/**
 * Drop-in confetti celebration. Renders nothing visible — just fires
 * two bursts of BAN-branded confetti on mount. Respects prefers-reduced-motion.
 */
export function ConfettiBurst() {
  useEffect(() => {
    const colors = ['#D4A843', '#FFF8F0', '#0d0d0d', '#e8e0d4'];
    const burst = (opts: confetti.Options) =>
      confetti({ ...opts, colors, disableForReducedMotion: true });

    burst({ particleCount: 80, spread: 70, origin: { x: 0.3, y: 0.6 } });
    burst({ particleCount: 80, spread: 70, origin: { x: 0.7, y: 0.6 } });

    setTimeout(() => {
      burst({ particleCount: 50, spread: 90, origin: { x: 0.5, y: 0.5 } });
    }, 400);
  }, []);

  return null;
}
