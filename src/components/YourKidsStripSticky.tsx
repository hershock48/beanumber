'use client';

/**
 * Sticky/hide wrapper around YourKidsStrip.
 *
 * Behavior:
 *   - Below 120 px of scroll: always visible. The user is near the
 *     top of the page; the strip lives in its natural flow position
 *     under the navbar.
 *   - Scrolled past 120 px and scrolling DOWN: slide up under the
 *     navbar. Standard hide-on-scroll pattern, gets the strip out
 *     of the reading area.
 *   - Scrolling UP: slide back into view immediately. The user is
 *     reaching for navigation; show it.
 *
 * Translate (not display: none or opacity:0) so the transition is
 * smooth and the strip slides under the BANNavigation bar instead
 * of popping in and out.
 *
 * Implemented with requestAnimationFrame so the scroll handler
 * doesn't fire faster than the browser can paint. Threshold of
 * 6 px on the delta filters out tiny jitter from inertial scroll.
 */

import { useEffect, useRef, useState } from 'react';

interface YourKidsStripStickyProps {
  children: React.ReactNode;
}

export function YourKidsStripSticky({ children }: YourKidsStripStickyProps) {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let raf = 0;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastScrollY.current;

        if (y < 120) {
          // Always show near the top.
          setHidden(false);
        } else if (delta > 6) {
          // Scrolling down past the show-area — hide.
          setHidden(true);
        } else if (delta < -6) {
          // Scrolling up — show.
          setHidden(false);
        }
        lastScrollY.current = y;
      });
    };

    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', handler);
    };
  }, []);

  return (
    <div
      className="sticky z-40 transition-transform duration-300 ease-out"
      style={{
        // Read the navbar's actual rendered height from the CSS var
        // BANNavigationClient publishes (updated via ResizeObserver
        // whenever the navbar resizes, including when the mobile menu
        // expands). Falls back to 72 px if the var isn't set yet,
        // which is the static navbar height for the desktop case.
        top: 'var(--nav-height, 72px)',
        transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
        // Tell the browser this element's transform changes a lot;
        // gives it a separate compositing layer so the slide stays
        // smooth even on long pages.
        willChange: 'transform',
      }}
      aria-hidden={hidden}
    >
      {children}
    </div>
  );
}
