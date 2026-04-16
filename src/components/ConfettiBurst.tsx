'use client';

import { useEffect } from 'react';

/**
 * Drop-in confetti celebration. Renders nothing visible — just fires
 * two bursts of BAN-branded confetti on mount.
 *
 * Uses dynamic import so canvas-confetti is loaded purely on the client
 * and never touches the server bundle. Creates its own cannon with
 * useWorker:false to avoid CSP blob: restrictions.
 */
export function ConfettiBurst() {
  useEffect(() => {
    let cancelled = false;

    import('canvas-confetti').then((mod) => {
      if (cancelled) return;

      const create = mod.default.create || mod.create;
      // Create a dedicated cannon — no Worker, high z-index, auto-resize.
      const canvas = document.createElement('canvas');
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '99999';
      document.body.appendChild(canvas);

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const fire = create(canvas, { resize: true });

      const colors = ['#D4A843', '#FFF8F0', '#0d0d0d', '#e8e0d4'];
      const burst = (opts: Record<string, unknown>) =>
        fire({ ...opts, colors });

      burst({ particleCount: 80, spread: 70, origin: { x: 0.3, y: 0.6 } });
      burst({ particleCount: 80, spread: 70, origin: { x: 0.7, y: 0.6 } });

      setTimeout(() => {
        burst({ particleCount: 50, spread: 90, origin: { x: 0.5, y: 0.5 } });
      }, 400);

      // Clean up canvas after animation completes (~3s is generous)
      setTimeout(() => {
        if (document.body.contains(canvas)) {
          document.body.removeChild(canvas);
        }
      }, 5000);
    });

    return () => { cancelled = true; };
  }, []);

  return null;
}
