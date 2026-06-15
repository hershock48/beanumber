'use client';

import { useEffect, useState } from 'react';

/**
 * Split-flap tile board — Vestaboard / airport-board style.
 *
 * Scrambles through random characters per tile, then locks each tile
 * in sequence to spell out `text`. Each tile is a dark stacked plate
 * with a horizontal divider through the middle (the "fold line") and
 * a gold serif character. On lock, the tile flips its color palette —
 * dark turns gold, character snaps to its final form — with a brief
 * scale-bounce. Spaces render as blank gaps. Non-alpha characters
 * (numbers, punctuation) render as-is and lock immediately without
 * scrambling.
 *
 * Lock cadence: characters lock left-to-right, evenly spaced across
 * `lockDuration` ms after `startDelay`. The locked text stays on
 * screen until the parent unmounts the board.
 *
 * Used by:
 *   - RevealOverlay (first-time meet-them reveal on /[N])
 *   - ReassignReveal (second reveal after a departure auto-reveal)
 *
 * Brand vocabulary: this animation is the BAN signature for "a name
 * is being revealed." Any moment where a child's identity appears
 * for the first time should use it.
 */
export function SplitFlapBoard({
  text,
  startDelay = 0,
  lockDuration = 1800,
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

    const tickInterval = setInterval(() => setTick(t => t + 1), 60);

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
      startDelay + lockDuration + 600
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
        @keyframes splitFlapLock {
          0% {
            transform: scale(1);
            background: linear-gradient(180deg, #1f1812 0%, #0d0905 100%);
            color: #D4A843;
          }
          30% {
            transform: scale(1.18);
            background: linear-gradient(180deg, #f5d77a 0%, #D4A843 100%);
            color: #0d0905;
            box-shadow:
              0 8px 30px rgba(212,168,67,0.7),
              0 0 50px rgba(212,168,67,0.45);
          }
          100% {
            transform: scale(1);
            background: linear-gradient(180deg, #D4A843 0%, #a07a25 100%);
            color: #0d0905;
            box-shadow:
              0 8px 24px rgba(0,0,0,0.5) inset,
              0 4px 12px rgba(0,0,0,0.25);
          }
        }
        .split-flap-board {
          font-family: 'Helvetica Neue', 'Arial Black', sans-serif;
          line-height: 1;
        }
        .split-flap-tile {
          position: relative;
          display: inline-block;
          width: 1em;
          height: 1.5em;
          background: linear-gradient(180deg, #1f1812 0%, #0d0905 100%);
          color: #D4A843;
          font-weight: 900;
          text-align: center;
          line-height: 1.5em;
          border-radius: 5px;
          box-shadow:
            0 8px 24px rgba(0,0,0,0.5) inset,
            0 4px 12px rgba(0,0,0,0.25);
          vertical-align: middle;
        }
        .split-flap-tile-space {
          background: transparent;
          box-shadow: none;
          width: 0.5em;
        }
        .split-flap-tile-divider {
          position: absolute;
          left: 7%;
          right: 7%;
          top: 50%;
          height: 2px;
          background: rgba(0,0,0,0.55);
          box-shadow: 0 1px 0 rgba(255,255,255,0.06);
          z-index: 2;
          pointer-events: none;
        }
        .split-flap-tile-locked {
          animation: splitFlapLock 420ms cubic-bezier(0.22, 1, 0.36, 1) 1 forwards;
        }
      `}</style>
      <div className="split-flap-board flex flex-wrap items-center justify-center gap-1.5 md:gap-2.5">
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
                isLocked ? ' split-flap-tile-locked' : ''
              }`}
              aria-hidden={!isLocked}
            >
              {showChar}
              <span className="split-flap-tile-divider" />
            </span>
          );
        })}
      </div>
    </>
  );
}
