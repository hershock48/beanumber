/**
 * Accessibility text-size toggle. Bumps the html element's font-size
 * which cascades through every Tailwind text-* class (rem-based) and
 * makes the whole site read bigger for sponsors with low vision.
 *
 * Persists in localStorage so the choice carries across pages and
 * sessions. Mounts in the nav so it's reachable from every page.
 *
 * Two states — Default (16px) and Large (20px). Two-state UI is
 * easier for older sponsors than a 3- or 4-step slider.
 */
'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ban_text_size';

type Size = 'default' | 'large';

function applySize(size: Size) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-text-size', size);
}

export function TextSizeToggle() {
  const [size, setSize] = useState<Size>('default');

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Size | null;
      if (stored === 'large' || stored === 'default') {
        setSize(stored);
        applySize(stored);
      }
    } catch {
      // localStorage unavailable — fall through with default.
    }
  }, []);

  function toggle() {
    const next: Size = size === 'default' ? 'large' : 'default';
    setSize(next);
    applySize(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best effort.
    }
  }

  const isLarge = size === 'large';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        isLarge
          ? 'Switch to default text size'
          : 'Switch to larger text size'
      }
      title={isLarge ? 'Smaller text' : 'Bigger text'}
      className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#e8e0d4] text-[#0d0d0d] hover:border-[#D4A843] transition-colors text-xs font-bold"
    >
      <span aria-hidden className="text-base leading-none">A</span>
      <span aria-hidden className="text-xs leading-none">{isLarge ? '−' : '+'}</span>
    </button>
  );
}
