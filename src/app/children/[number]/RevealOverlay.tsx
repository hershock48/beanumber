'use client';

import { useState, useEffect, useCallback } from 'react';

interface RevealOverlayProps {
  shirtNumber: number;
  childName: string;
  children: React.ReactNode;
}

function fireConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const colors = ['#D4A843', '#F5E6B8', '#fff', '#c49a3a', '#e8d5a0', '#FFD700'];
  const particles: Array<{
    x: number; y: number; vx: number; vy: number;
    size: number; color: string; rot: number; rotV: number;
    opacity: number; shape: 'rect' | 'circle';
  }> = [];

  const cx = canvas.width / 2;
  const cy = canvas.height * 0.38;

  for (let i = 0; i < 160; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed * (0.6 + Math.random()),
      vy: Math.sin(angle) * speed * (0.6 + Math.random()) - 4,
      size: 4 + Math.random() * 7,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 12,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }

  let frame = 0;
  const max = 150;

  function animate() {
    frame++;
    if (frame > max) { canvas.remove(); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.15; p.vx *= 0.99;
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

// ── Stages ─────────────────────────────────────────────────────
// 0 → pre-reveal: blurred content, "This number has a name" overlay
// 1 → name reveal: child's name appears large
// 2 → face reveal: confetti + unblur
// 3 → done (same as return visits)

type Stage = 0 | 1 | 2 | 3;

export function RevealOverlay({ shirtNumber, childName, children }: RevealOverlayProps) {
  const storageKey = `ban-revealed-${shirtNumber}`;
  const [checked, setChecked] = useState(false);
  const [alreadyRevealed, setAlreadyRevealed] = useState(false);
  const [stage, setStage] = useState<Stage>(0);

  useEffect(() => {
    try {
      setAlreadyRevealed(localStorage.getItem(storageKey) === 'yes');
    } catch {
      setAlreadyRevealed(true);
    }
    setChecked(true);
  }, [storageKey]);

  const handleReveal = useCallback(() => {
    setStage(1);
    setTimeout(() => {
      setStage(2);
      fireConfetti();
      try { localStorage.setItem(storageKey, 'yes'); } catch {}
    }, 1800);
    setTimeout(() => setStage(3), 3200);
  }, [storageKey]);

  if (!checked) return <div className="min-h-[60vh]" />;
  if (alreadyRevealed || stage === 3) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred content — unblurs during stage 2 */}
      <div
        className="transition-all ease-out"
        style={{
          filter: stage >= 2 ? 'blur(0px)' : 'blur(20px)',
          opacity: stage >= 2 ? 1 : 0.3,
          transform: stage >= 2 ? 'scale(1)' : 'scale(0.97)',
          transitionDuration: stage >= 2 ? '1400ms' : '0ms',
          pointerEvents: stage >= 2 ? 'auto' : 'none',
        }}
        aria-hidden={stage < 2}
      >
        {children}
      </div>

      {/* ── Stage 0: "This number has a name" ──
          Fixed to viewport so it's always visible above the fold,
          regardless of how tall the blurred content container is. */}
      {stage === 0 && (
        <div className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center px-8 pointer-events-auto">
            <div className="bg-white/90 backdrop-blur-sm border border-[#e8e0d4] py-10 px-8 md:py-14 md:px-16 shadow-xl max-w-lg mx-auto">
              <p
                className="text-3xl md:text-5xl text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                This number
              </p>
              <p
                className="text-3xl md:text-5xl text-[#0d0d0d] mb-1"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                has a name.
              </p>
              <p className="text-[#999] text-sm mb-8">
                Thanks to you.
              </p>
              <p
                className="text-5xl md:text-7xl text-[#D4A843] mb-10"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                #{shirtNumber}
              </p>
              <button
                onClick={handleReveal}
                className="w-full bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors text-lg"
              >
                Reveal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage 1: The name ── */}
      {stage === 1 && (
        <div className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div
            className="text-center px-6"
            style={{ animation: 'revealNameIn 700ms ease-out forwards' }}
          >
            <p
              className="text-5xl md:text-8xl text-[#0d0d0d] mb-3"
              style={{
                fontFamily: 'var(--font-lora), serif',
                fontWeight: 600,
                lineHeight: 1.1,
                textShadow: '0 2px 30px rgba(255,248,240,1), 0 0 60px rgba(255,248,240,0.8)',
              }}
            >
              {childName}
            </p>
            <p
              className="text-xl md:text-2xl text-[#D4A843]"
              style={{
                fontFamily: 'var(--font-lora), serif',
                fontWeight: 500,
                textShadow: '0 2px 20px rgba(255,248,240,1)',
              }}
            >
              #{shirtNumber}
            </p>
          </div>
          <style>{`
            @keyframes revealNameIn {
              0% { opacity: 0; transform: scale(0.92) translateY(16px); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* ── Stage 2: Face reveal — name lingers while photo unblurs ── */}
      {stage === 2 && (
        <div
          className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none"
          style={{ animation: 'revealFadeOut 1400ms ease-in forwards' }}
        >
          <div className="text-center px-6">
            <p
              className="text-5xl md:text-8xl text-[#0d0d0d] mb-3"
              style={{
                fontFamily: 'var(--font-lora), serif',
                fontWeight: 600,
                lineHeight: 1.1,
                textShadow: '0 2px 30px rgba(255,248,240,1), 0 0 60px rgba(255,248,240,0.8)',
              }}
            >
              {childName}
            </p>
            <p
              className="text-xl md:text-2xl text-[#D4A843]"
              style={{
                fontFamily: 'var(--font-lora), serif',
                fontWeight: 500,
                textShadow: '0 2px 20px rgba(255,248,240,1)',
              }}
            >
              #{shirtNumber}
            </p>
          </div>
          <style>{`
            @keyframes revealFadeOut {
              0% { opacity: 1; }
              50% { opacity: 1; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
