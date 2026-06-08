/**
 * Replacement Chooser — the 3-card pick experience for sponsors
 * whose original kid has departed.
 *
 * Rendered server-side when the visitor's sponsorship has
 * PendingCandidateChildIDs set (see page.tsx). The page passes in
 * the 3 candidate kids' presentation data; this component handles
 * the animation, the POST, and the post-pick reveal.
 *
 * Visual sequence:
 *   1. Header + 3 cards slide in from below, staggered (0/120/240ms).
 *   2. Hover: card lifts, soft shadow expands, gold border highlights.
 *   3. Click: card scales up + rises to center, others fade out,
 *      confetti bursts.
 *   4. A split-flap board (Vestaboard style) materializes in the
 *      center and scrambles through random characters, with each
 *      character locking left-to-right in a staggered cascade,
 *      revealing the new kid's name + grade.
 *   5. ~3s beat, then navigate to /[N] (their new kid's page).
 *
 * The chooser doubles as the reveal — the post-reassign overlay
 * suppresses itself when ChildRevealedAt is set (we set it in the
 * pick endpoint).
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Split-flap tile board — scrambles through random characters per
 * tile, then locks each tile in sequence revealing `text`.
 *
 * Each character is a stacked tile (top half / bottom half) with a
 * dark brown background and gold serif character, like the
 * Vestaboard / airport boards of the 70s. Spaces render as blank
 * tiles. Non-alpha characters render as-is and lock immediately.
 *
 * Lock cadence: characters lock left-to-right, evenly spaced across
 * `lockDuration` ms after `startDelay`. Each tile keeps tumbling
 * through scramble chars until it locks.
 */
function SplitFlapBoard({
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
    <div className="split-flap-board flex flex-wrap items-center justify-center gap-1 md:gap-1.5 max-w-3xl">
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
  );
}

export interface CandidateKid {
  recordId: string;
  firstName: string;
  displayName: string;
  gradeClass: string;
  photoUrl: string | null;
  loves: string;
}

interface Props {
  shirtNumber: number;
  previousKidName: string | null;
  candidates: CandidateKid[];
}

function fireConfetti(originY: number = 0.4): void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const colors = ['#D4A843', '#F5E6B8', '#fff', '#c49a3a', '#e8d5a0', '#FFD700'];
  const particles: Array<{
    x: number; y: number; vx: number; vy: number;
    size: number; color: string; rot: number; rotV: number;
    opacity: number; shape: 'rect' | 'circle';
  }> = [];
  const cx = canvas.width / 2;
  const cy = canvas.height * originY;
  for (let i = 0; i < 220; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 11;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed * (0.6 + Math.random()),
      vy: Math.sin(angle) * speed * (0.6 + Math.random()) - 5,
      size: 4 + Math.random() * 9,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 14,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }
  let frame = 0;
  const max = 200;
  function animate() {
    if (!ctx) return;
    frame++;
    if (frame > max) { canvas.remove(); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.18; p.vx *= 0.99;
      p.rot += p.rotV;
      p.opacity = Math.max(0, 1 - frame / max);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

type Stage = 'choose' | 'celebrate' | 'boarding' | 'committing';

export function ReplacementChooser({
  shirtNumber,
  previousKidName,
  candidates,
}: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('choose');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(
    async (kid: CandidateKid) => {
      if (stage !== 'choose') return;
      setPickedId(kid.recordId);
      setStage('celebrate');
      // Fire confetti after the card has begun centering.
      setTimeout(() => fireConfetti(0.42), 400);
      // Transition into the split-flap board reveal once the picked
      // card has fully centered. The board scrambles for ~1.4s then
      // settles, so we hold the celebration through ~2.8s total.
      setTimeout(() => setStage('boarding'), 950);

      // Kick the API in parallel with the animation. The animation
      // is the experience; the POST is the bookkeeping.
      try {
        const res = await fetch('/api/sponsor/choose-replacement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chosenChildRecordId: kid.recordId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed: ${res.status}`);
        // Hold the board on screen long enough to scramble + settle +
        // breathe, then refresh into the new kid's page.
        setTimeout(() => {
          setStage('committing');
          setTimeout(() => {
            router.refresh();
            router.replace(`/children/${shirtNumber}`);
          }, 400);
        }, 2800);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Choice failed.');
        setStage('choose');
        setPickedId(null);
      }
    },
    [stage, router, shirtNumber]
  );

  const pickedKid = pickedId ? candidates.find(c => c.recordId === pickedId) : null;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-5 py-12 md:py-20">
      <style>{`
        @keyframes choosePromote {
          0% { opacity: 0; transform: translateY(24px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chooseCardEnter {
          0% { opacity: 0; transform: translateY(36px) scale(0.94); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes choosePickedScale {
          0% { transform: scale(1) translateY(0) rotate(0deg); }
          40% { transform: scale(1.06) translateY(-14px) rotate(-1deg); }
          100% { transform: scale(1.14) translateY(-40px) rotate(0deg); }
        }
        @keyframes chooseSiblingFade {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.94) translateY(20px); }
        }
        @keyframes chooseBoardIn {
          0% { opacity: 0; transform: translateY(28px) scale(0.94); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
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

        /* ─── Split-flap board (Vestaboard / airport board) ─── */
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

      {/* Header */}
      <div
        className="text-center max-w-2xl mb-10 md:mb-14"
        style={{ animation: 'choosePromote 700ms ease-out both' }}
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-4">
          A note about #{shirtNumber}
        </p>
        <h1
          className="text-2xl md:text-4xl text-[#0d0d0d] leading-tight mb-3"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {previousKidName
            ? `${previousKidName}'s no longer at Hope Bridge.`
            : 'There’s a change at Hope Bridge.'}
        </h1>
        <p className="text-base md:text-lg text-[#666] leading-relaxed">
          You get to choose where #{shirtNumber} goes next. Three kids at the
          campus. Pick the one you&rsquo;d like to know.
        </p>
      </div>

      {/* Cards or celebration */}
      <div className="w-full max-w-5xl">
        {stage === 'choose' || stage === 'celebrate' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-7 items-stretch">
            {candidates.map((kid, idx) => {
              const isPicked = pickedId === kid.recordId;
              const isUnpicked = stage === 'celebrate' && !isPicked;
              return (
                <button
                  type="button"
                  key={kid.recordId}
                  onClick={() => pick(kid)}
                  disabled={stage !== 'choose'}
                  className="group relative block bg-white border border-[#e8e0d4] text-left overflow-hidden disabled:cursor-default"
                  style={{
                    animation: isPicked
                      ? 'choosePickedScale 800ms cubic-bezier(0.22, 1, 0.36, 1) forwards'
                      : isUnpicked
                        ? 'chooseSiblingFade 600ms ease-in forwards'
                        : `chooseCardEnter 700ms cubic-bezier(0.22, 1, 0.36, 1) ${idx * 120}ms both`,
                    transition:
                      stage === 'choose'
                        ? 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 320ms ease-out, border-color 200ms ease-out'
                        : undefined,
                    transform: undefined,
                  }}
                  onMouseEnter={e => {
                    if (stage !== 'choose') return;
                    e.currentTarget.style.transform =
                      'translateY(-10px) scale(1.02)';
                    e.currentTarget.style.boxShadow =
                      '0 25px 50px -12px rgba(0,0,0,0.18), 0 10px 20px -8px rgba(212,168,67,0.18)';
                    e.currentTarget.style.borderColor = '#D4A843';
                  }}
                  onMouseLeave={e => {
                    if (stage !== 'choose') return;
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = '';
                    e.currentTarget.style.borderColor = '';
                  }}
                >
                  <div className="aspect-[4/5] bg-[#f5f0e8] relative">
                    {kid.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={kid.photoUrl}
                        alt={kid.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
                        👤
                      </div>
                    )}
                  </div>
                  <div className="p-4 md:p-5">
                    <p
                      className="text-xl md:text-2xl text-[#0d0d0d] leading-snug mb-1"
                      style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                    >
                      {kid.displayName}
                    </p>
                    {kid.gradeClass && (
                      <p className="text-xs uppercase tracking-wider text-[#D4A843] font-bold mb-3">
                        {kid.gradeClass}
                      </p>
                    )}
                    {kid.loves && (
                      <p className="text-sm text-[#666] leading-relaxed">
                        {kid.loves}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Split-flap board reveal — takes over during 'boarding' and
            'committing'. Centered over the page so the picked card
            (still animating) reads as the source of the reveal. */}
        {(stage === 'boarding' || stage === 'committing') && pickedKid && (
          <div
            className="fixed inset-0 flex items-center justify-center pointer-events-none z-20 px-5"
            style={{ animation: 'chooseBoardIn 500ms ease-out both' }}
          >
            <div className="text-center w-full max-w-3xl">
              <p
                className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-5"
                style={{ textShadow: '0 2px 14px rgba(255,248,240,1)' }}
              >
                #{shirtNumber} is now
              </p>
              <div
                className="flex items-center justify-center mb-4"
                style={{ fontSize: 'clamp(1.6rem, 6.5vw, 3.6rem)' }}
              >
                <SplitFlapBoard
                  text={pickedKid.displayName.toUpperCase()}
                  startDelay={150}
                  lockDuration={1400}
                />
              </div>
              {pickedKid.gradeClass && (
                <p
                  className="text-base md:text-lg text-[#D4A843] font-bold uppercase tracking-wider mt-4"
                  style={{
                    textShadow: '0 2px 20px rgba(255,248,240,1)',
                    animation: 'chooseBoardIn 600ms ease-out 1700ms both',
                  }}
                >
                  {pickedKid.gradeClass}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 mt-6 text-center">{error}</p>
      )}
    </div>
  );
}
