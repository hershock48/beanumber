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

  // Geometry for the SVG ring. Stroke sits inside the perimeter; the
  // gold button fills the whole 180-px circle so the visible gold IS
  // the tappable surface (the prior inset-2 left a ~10 px gap between
  // the button's hit zone and the gold ring, which on mobile Safari
  // caused taps on the ring/edge to fall through to the SVG, which
  // has pointer-events: none).
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  // Outer tap-expansion zone — 16 px of invisible padding around the
  // visible button so a finger landing just outside the gold still
  // triggers the hold. Apple HIG recommends 44 pt minimum; this gives
  // us ~210 pt of forgiving target around a 180 px visual.
  const tapPad = 16;
  const outerSize = size + tapPad * 2;

  return (
    <div
      className="relative inline-block"
      style={{ width: outerSize, height: outerSize }}
    >
      {/* Transparent outer hit zone — catches pointer events anywhere
          within the expansion radius and forwards to the button's
          handlers. select-none + touchAction:none stop iOS Safari from
          mistaking the press for a long-press text-selection gesture. */}
      <div
        onPointerDown={start}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={e => e.preventDefault()}
        className="absolute inset-0 cursor-pointer select-none"
        style={{ touchAction: 'none' }}
        aria-hidden
      />

      {/* Visible button + ring — centered inside the outer hit zone. */}
      <div
        className="absolute"
        style={{
          width: size,
          height: size,
          top: tapPad,
          left: tapPad,
          pointerEvents: 'none', // outer zone owns the events
        }}
      >
        <svg
          className="absolute inset-0"
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
          onKeyDown={onKeyDown}
          className="absolute inset-0 rounded-full bg-[#D4A843] hover:bg-[#c49a3a] focus:bg-[#c49a3a] active:bg-[#b88d2e] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm md:text-base focus:outline-none focus:ring-4 focus:ring-[#D4A843]/30 transition-colors select-none"
          style={{
            pointerEvents: 'auto', // keep keyboard focus working
            transform: holding ? 'scale(0.97)' : 'scale(1)',
            transition: 'transform 120ms ease-out, background-color 200ms ease-out',
          }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
