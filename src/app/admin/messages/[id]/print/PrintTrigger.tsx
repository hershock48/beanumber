'use client';

/**
 * PrintTrigger — fires window.print() shortly after mount so Simon
 * doesn't have to remember ⌘P. Fires once, with a small delay so
 * fonts and layout have a beat to settle before the browser snaps
 * a preview.
 */

import { useEffect, useRef } from 'react';

export function PrintTrigger() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // Print blocked or unavailable — Simon can still ⌘P manually.
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
