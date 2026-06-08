'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Press-and-hold button with a circular gold progress ring around
 * its perimeter. The ring fills clockwise as the user holds; when it
 * completes, `onComplete` fires. Release early = ring drains back to
 * zero, no penalty.
 *
 * Used for the meet-them reveal on /[N] — the hold makes the moment
 * feel earned rather than impulsively clicked.
 *
 * Accessibility:
 *   - Renders an `<button>` so screen readers + keyboard users get
 *     it for free.
 *   - Space/Enter trigger an immediate "complete" (no hold required)
 *     so keyboard navigation doesn't get gated.
 *   - A small "tap to skip" link below the button (rendered by the
 *     parent) gives motor-impaired users an instant path.
 *
 * Haptics:
 *   - `navigator.vibrate(15)` on press-start (tactile feedback that
 *     the hold registered).
 *   - `navigator.vibrate(80)` on complete (success pulse).
 *   Graceful no-op on devices without vibration support (most
 *   desktops + iOS).
 */
export function HoldButton({
  onComplete,
  holdDurationMs = 1500,
  label,
  size = 200,
}: {
  onComplete: () => void;
  holdDurationMs?: number;
  label: string;
  size?: number;
}) {
  const [progress, setProgress] = useState(0); // 0 → 1
  const [holding, setHolding] = useState(false);
  const completedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startedAtRef.current = null;
    setHolding(false);
  }, []);

  const tick = useCallback(
    (now: number) => {
      if (startedAtRef.current === null) return;
      const elapsed = now - startedAtRef.current;
      const p = Math.min(1, elapsed / holdDurationMs);
      setProgress(p);
      if (p >= 1) {
        if (!completedRef.current) {
          completedRef.current = true;
          try {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              navigator.vibrate(80);
            }
          } catch {}
          onComplete();
        }
        stop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [holdDurationMs, onComplete, stop]
  );

  const start = useCallback(() => {
    if (completedRef.current) return;
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(15);
      }
    } catch {}
    setHolding(true);
    startedAtRef.current = performance.now() - progress * holdDurationMs;
    rafRef.current = requestAnimationFrame(tick);
  }, [progress, holdDurationMs, tick]);

  const release = useCallback(() => {
    if (completedRef.current) return;
    stop();
    // Drain the ring back to zero over ~250ms for the visual reset.
    const startAt = performance.now();
    const from = progress;
    function drain(now: number) {
      const t = Math.min(1, (now - startAt) / 250);
      const eased = 1 - Math.pow(1 - t, 2);
      const next = from * (1 - eased);
      setProgress(next);
      if (t < 1) requestAnimationFrame(drain);
    }
    requestAnimationFrame(drain);
  }, [progress, stop]);

  // Keyboard: Space/Enter triggers immediate complete (no hold
  // required) so the moment is reachable for non-pointer users.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (completedRef.current) return;
        completedRef.current = true;
        setProgress(1);
        try {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(80);
          }
        } catch {}
        onComplete();
      }
    },
    [onComplete]
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  // Geometry for the SVG ring. Stroke goes on the OUTSIDE of the
  // button so the gold fill grows from the perimeter rather than
  // through the button face.
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <svg
        className="absolute inset-0 pointer-events-none"
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Track ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(212, 168, 67, 0.18)"
          strokeWidth={stroke}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#D4A843"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: holding
              ? 'none'
              : 'stroke-dashoffset 250ms ease-out',
          }}
        />
      </svg>
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={e => e.preventDefault()}
        onKeyDown={onKeyDown}
        className="absolute inset-2 rounded-full bg-[#D4A843] hover:bg-[#c49a3a] focus:bg-[#c49a3a] active:bg-[#b88d2e] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm md:text-base focus:outline-none focus:ring-4 focus:ring-[#D4A843]/30 transition-colors select-none"
        style={{
          touchAction: 'none',
          transform: holding ? 'scale(0.97)' : 'scale(1)',
          transition: 'transform 120ms ease-out, background-color 200ms ease-out',
        }}
      >
        {label}
      </button>
    </div>
  );
}
