'use client';

import { useEffect, useState } from 'react';

/**
 * Split-flap tile board — Vestaboard / airport-board style.
 *
 * Scrambles through random characters per tile, then locks each tile
 * in sequence to spell out `text`. Each character is a stacked tile
 * (top half / bottom half) with a dark brown background and gold
 * serif character. Spaces render as blank gaps. Non-alpha characters
 * (numbers, punctuation) render as-is and lock immediately without
 * scrambling.
 *
 * Lock cadence: characters lock left-to-right, evenly spaced across
 * `lockDuration` ms after `startDelay`. Each tile keeps tumbling
 * through scramble chars until it locks.
 *
 * Used by:
 *   - ReplacementChooser (post-pick reveal of new kid's name)
 *   - RevealOverlay (first-time meet-them reveal on /[N])
 *
 * Brand vocabulary: this animation is the BAN signature for "a name
 * is being revealed." Any moment where a child's identity appears
 * for the first time should use it.
 */
export function SplitFlapBoard({
  text,
  startDelay = 0,
  lockDuration = 1400,
}: {
  text: string;
  startDelay?: number;
  lockDuration?: number;
}) {
  // Tick drives the "scramble" character cycle.
  const [tick, setTick] = useState(0);
  // Per-character lock state: false while tumbling, true once final.
  const [locked, setLocked] = useState<boolean[]>(
    () => text.split('').map(c => !/[A-Za-z]/.test(c))
  );

  useEffect(() => {
    // Reset locks for new text.
    setLocked(text.split('').map(c => !/[A-Za-z]/.test(c)));

    const tickInterval = setInterval(() => setTick(t => t + 1), 70);

    const alphaIndices = text
      .split('')
      .map((c, i) => (/[A-Za-z]/.test(c) ? i : -1))
      .filter(i => i >= 0);

    const lockTimers = alphaIndices.map((idx, order) => {
      const lockAt =
        startDelay +
        (alphaIndices.length <= 1
          ? lockDuration
          : (order / (alphaIndices.length - 1)) * lockDuration);
      return window.setTimeout(() => {
        setLocked(prev => {
          const next = prev.slice();
          next[idx] = true;
          return next;
        });
      }, lockAt);
    });

    // Stop the tumble loop once everything is locked.
    const stopTumble = window.setTimeout(
      () => clearInterval(tickInterval),
      startDelay + lockDuration + 500
    );

    return () => {
      clearInterval(tickInterval);
      lockTimers.forEach(t => clearTimeout(t));
      clearTimeout(stopTumble);
    };
  }, [text, startDelay, lockDuration]);

  const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  return (
    <>
      <style>{`
        @keyframes splitFlapTumble {
          0% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }
        @keyframes splitFlapLock {
          0% { transform: scale(1); box-shadow: 0 4px 14px rgba(0,0,0,0.35) inset, 0 1px 0 rgba(255,255,255,0.04); }
          40% { transform: scale(1.06); box-shadow: 0 6px 22px rgba(212,168,67,0.5) inset, 0 0 18px rgba(212,168,67,0.3); }
          100% { transform: scale(1); box-shadow: 0 4px 14px rgba(0,0,0,0.35) inset, 0 1px 0 rgba(255,255,255,0.04); }
        }
        .split-flap-board {
          font-family: 'Courier New', ui-monospace, monospace;
          line-height: 1;
        }
        .split-flap-tile {
          position: relative;
          display: inline-block;
          width: 0.7em;
          height: 1.05em;
          background: #1f1812;
          color: #D4A843;
          font-weight: 700;
          text-align: center;
          border-radius: 3px;
          box-shadow:
            0 4px 14px rgba(0,0,0,0.35) inset,
            0 1px 0 rgba(255,255,255,0.04);
          overflow: hidden;
          vertical-align: middle;
        }
        .split-flap-tile-space {
          background: transparent;
          box-shadow: none;
          width: 0.32em;
        }
        .split-flap-tile-half {
          position: absolute;
          left: 0;
          width: 100%;
          height: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .split-flap-tile-top {
          top: 0;
          align-items: flex-end;
          padding-bottom: 0.04em;
        }
        .split-flap-tile-bottom {
          bottom: 0;
          align-items: flex-start;
          padding-top: 0.04em;
          background: linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 35%);
        }
        .split-flap-tile-divider {
          position: absolute;
          left: 6%;
          right: 6%;
          top: 50%;
          height: 1px;
          background: rgba(0,0,0,0.55);
          box-shadow: 0 1px 0 rgba(255,255,255,0.05);
        }
        .split-flap-tile-tumbling {
          animation: splitFlapTumble 70ms ease-in-out infinite;
        }
        .split-flap-tile-locked {
          animation: splitFlapLock 380ms ease-out 1 both;
        }
      `}</style>
      <div className="split-flap-board flex flex-wrap items-center justify-center gap-1 md:gap-1.5">
        {text.split('').map((char, i) => {
          const isAlpha = /[A-Za-z]/.test(char);
          const isLocked = locked[i];
          const showChar =
            !isAlpha
              ? char === ' '
                ? ''
                : char
              : isLocked
                ? char.toUpperCase()
                : SCRAMBLE_CHARS[(tick + i * 7) % SCRAMBLE_CHARS.length];
          const isSpace = char === ' ';
          return (
            <span
              key={i}
              className={`split-flap-tile${isSpace ? ' split-flap-tile-space' : ''}${
                isLocked ? ' split-flap-tile-locked' : ' split-flap-tile-tumbling'
              }`}
              aria-hidden={!isLocked}
            >
              <span className="split-flap-tile-half split-flap-tile-top">
                {showChar}
              </span>
              <span className="split-flap-tile-half split-flap-tile-bottom">
                {showChar}
              </span>
              <span className="split-flap-tile-divider" />
            </span>
          );
        })}
      </div>
    </>
  );
}
