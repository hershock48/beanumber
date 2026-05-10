'use client';

import { useState, useEffect, useCallback } from 'react';

interface RevealOverlayProps {
  shirtNumber: number;
  /** Child's display name — shown as the title card in beat one of the
   *  reveal before the photo unblurs in beat two. */
  childName: string;
  children: React.ReactNode;
}

// Lightweight confetti burst — no external dependency. Fires gold and white
// particles from the center of the viewport, then cleans up its canvas.
function fireConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const colors = ['#D4A843', '#F5E6B8', '#ffffff', '#c49a3a', '#e8d5a0', '#FFD700'];
  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    rotation: number;
    rotationSpeed: number;
    opacity: number;
    shape: 'rect' | 'circle';
  }> = [];

  const cx = canvas.width / 2;
  const cy = canvas.height * 0.4;

  for (let i = 0; i < 150; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed * (0.6 + Math.random()),
      vy: Math.sin(angle) * speed * (0.6 + Math.random()) - 4,
      size: 4 + Math.random() * 7,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }

  let frame = 0;
  const maxFrames = 140;

  function animate() {
    frame++;
    if (frame > maxFrames) {
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16; // gravity
      p.vx *= 0.99; // air resistance
      p.rotation += p.rotationSpeed;
      p.opacity = Math.max(0, 1 - frame / maxFrames);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
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

// ── Reveal stages ──────────────────────────────────────────────
// Stage 0: pre-reveal — blurred content, overlay card with "Meet your child"
// Stage 1: name title card — child's name appears large, background still blurred
// Stage 2: photo unblur + confetti — the face reveal
// Stage 3: done — full profile visible (same as return-visit state)

type RevealStage = 0 | 1 | 2 | 3;

export function RevealOverlay({ shirtNumber, childName, children }: RevealOverlayProps) {
  const storageKey = `ban-revealed-${shirtNumber}`;
  const [checked, setChecked] = useState(false);
  const [alreadyRevealed, setAlreadyRevealed] = useState(false);
  const [stage, setStage] = useState<RevealStage>(0);

  useEffect(() => {
    try {
      const already = localStorage.getItem(storageKey);
      setAlreadyRevealed(already === 'yes');
    } catch {
      setAlreadyRevealed(true);
    }
    setChecked(true);
  }, [storageKey]);

  const handleReveal = useCallback(() => {
    // Beat 1: show the name title card
    setStage(1);

    // Beat 2: after a pause, fire confetti and unblur the photo
    setTimeout(() => {
      setStage(2);
      fireConfetti();
      try {
        localStorage.setItem(storageKey, 'yes');
      } catch {
        // Private browsing — just proceed.
      }
    }, 1600);

    // Beat 3: fully revealed
    setTimeout(() => {
      setStage(3);
    }, 2800);
  }, [storageKey]);

  // While checking localStorage, show a placeholder to avoid flash.
  if (!checked) {
    return <div className="min-h-[60vh]" />;
  }

  // Return visit — render content immediately.
  if (alreadyRevealed || stage === 3) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content underneath — unblurs during stage 2 */}
      <div
        className="transition-all ease-out"
        style={{
          filter: stage >= 2 ? 'blur(0px)' : 'blur(18px)',
          opacity: stage >= 2 ? 1 : 0.4,
          transform: stage >= 2 ? 'scale(1)' : 'scale(0.97)',
          transitionDuration: stage >= 2 ? '1200ms' : '0ms',
          pointerEvents: stage >= 2 ? 'auto' : 'none',
        }}
        aria-hidden={stage < 2}
      >
        {children}
      </div>

      {/* ── Stage 0: "Meet your child" card ── */}
      {stage === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center px-6 max-w-md">
            <div className="bg-white/95 backdrop-blur-sm border border-[#e8e0d4] p-8 md:p-12 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
                Your shirt. Your child.
              </p>
              <p
                className="text-3xl md:text-4xl text-[#0d0d0d] mb-3"
                style={{
                  fontFamily: 'var(--font-lora), serif',
                  fontWeight: 600,
                }}
              >
                #{shirtNumber}
              </p>
              <p className="text-[#777] mb-8 leading-relaxed">
                A real child at the YDO campus in Northern Uganda
                is on the other side of this button.
              </p>
              <button
                onClick={handleReveal}
                className="w-full bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors text-lg"
              >
                Meet your child
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage 1: Name title card ── */}
      {stage === 1 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="text-center px-6"
            style={{
              animation: 'revealNameIn 600ms ease-out forwards',
            }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
              Meet
            </p>
            <p
              className="text-5xl md:text-7xl text-[#0d0d0d] mb-4"
              style={{
                fontFamily: 'var(--font-lora), serif',
                fontWeight: 600,
              }}
            >
              {childName}
            </p>
            <p className="text-lg text-[#999]">#{shirtNumber}</p>
          </div>
          <style>{`
            @keyframes revealNameIn {
              0% { opacity: 0; transform: scale(0.9) translateY(20px); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* ── Stage 2: photo unblurring + confetti (overlay fades out) ── */}
      {stage === 2 && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
          style={{
            animation: 'revealFadeOut 1200ms ease-in forwards',
          }}
        >
          <div className="text-center px-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
              Meet
            </p>
            <p
              className="text-5xl md:text-7xl text-[#0d0d0d] mb-4"
              style={{
                fontFamily: 'var(--font-lora), serif',
                fontWeight: 600,
              }}
            >
              {childName}
            </p>
            <p className="text-lg text-[#999]">#{shirtNumber}</p>
          </div>
          <style>{`
            @keyframes revealFadeOut {
              0% { opacity: 1; }
              60% { opacity: 1; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
