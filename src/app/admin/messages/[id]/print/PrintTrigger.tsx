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
    // Don't flip `fired` until the callback actually runs. React 19
    // strict-mode double-invokes effects in dev: previously we set
    // fired.current=true on the first mount + cleared the timer in
    // cleanup, then the second mount's early-return skipped
    // scheduling entirely, so window.print() never fired in `next
    // dev`. Now the ref only guards a re-schedule AFTER a real
    // print attempt, which strict-mode double-mount handles
    // correctly.
    const t = window.setTimeout(() => {
      fired.current = true;
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
