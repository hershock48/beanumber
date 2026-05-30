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
 *   3. Click: card scales up + rises to center, others fade out, big
 *      kid name reveals in Lora gold serif, confetti bursts.
 *   4. ~2.5s beat, then navigate to /[N] (their new kid's page).
 *
 * The chooser doubles as the reveal — the post-reassign overlay
 * suppresses itself when ChildRevealedAt is set (we set it in the
 * pick endpoint).
 */
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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

type Stage = 'choose' | 'celebrate' | 'committing';

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
        setStage('committing');
        // Hold the celebration on screen for the full ~2.5s, then
        // refresh into the new kid's page.
        setTimeout(() => {
          router.refresh();
          router.replace(`/children/${shirtNumber}`);
        }, 1600);
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
        @keyframes chooseNameIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
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
        {stage !== 'committing' ? (
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

        {/* Centered name reveal during 'celebrate' + 'committing' */}
        {(stage === 'celebrate' || stage === 'committing') && pickedKid && (
          <div
            className="fixed inset-0 flex items-center justify-center pointer-events-none z-20"
            style={{
              animation:
                stage === 'committing'
                  ? 'chooseNameIn 400ms ease-out both'
                  : 'chooseNameIn 900ms ease-out 450ms both',
            }}
          >
            <div className="text-center px-6">
              <p
                className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3"
                style={{ textShadow: '0 2px 14px rgba(255,248,240,1)' }}
              >
                #{shirtNumber} is now
              </p>
              <p
                className="text-5xl md:text-7xl text-[#0d0d0d] leading-tight mb-2"
                style={{
                  fontFamily: 'var(--font-lora), serif',
                  fontWeight: 600,
                  textShadow:
                    '0 2px 30px rgba(255,248,240,1), 0 0 60px rgba(255,248,240,0.8)',
                }}
              >
                {pickedKid.displayName}
              </p>
              {pickedKid.gradeClass && (
                <p
                  className="text-base md:text-lg text-[#D4A843] font-bold uppercase tracking-wider"
                  style={{ textShadow: '0 2px 20px rgba(255,248,240,1)' }}
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
