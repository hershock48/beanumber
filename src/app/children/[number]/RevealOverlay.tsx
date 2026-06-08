'use client';

import { useCallback, useEffect, useState } from 'react';
import { HoldButton } from '@/components/HoldButton';
import { SplitFlapBoard } from '@/components/SplitFlapBoard';

interface RevealOverlayProps {
  shirtNumber: number;
  childName: string;
  children: React.ReactNode;
}

/**
 * Confetti burst centered slightly above the viewport's middle.
 * Brand colors (gold + cream + white), 200 particles, ~180 frames
 * of physics. Same look as the chooser's confetti, slightly bumped.
 */
function fireConfetti() {
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
  const cy = canvas.height * 0.38;

  for (let i = 0; i < 200; i++) {
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
  const max = 180;

  function animate() {
    if (!ctx) return;
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

/**
 * Synthesize a soft triumph chime in the browser via Web Audio API.
 * Three sine notes (C5 → E5 → G5) staggered ~60ms apart with a
 * gentle attack + exponential decay envelope. ~850ms total. No
 * audio asset required — generated on the fly.
 *
 * The hold-button press is the user gesture that authorizes audio
 * playback, so the AudioContext can resume cleanly.
 */
function playRevealChime() {
  try {
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;

    // C5 → E5 → G5 (a major triad — reverent, slightly triumphant)
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      const startTime = now + i * 0.06;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.85);

      osc.start(startTime);
      osc.stop(startTime + 0.9);
    });

    // Close the context after the sound finishes so we don't leak.
    setTimeout(() => {
      try { ctx.close(); } catch {}
    }, 1100);
  } catch {
    // No audio support, or autoplay blocked, or context creation
    // failed — swallow silently. The visual reveal still works.
  }
}

// Stages of the reveal experience:
//   idle      → blurred content, "Every number is a name" + Hold button
//   board     → split-flap board scrambles, locks letter-by-letter
//   unblur    → board fades, page underneath unblurs
//   done      → final state (same as return visits)
type Stage = 'idle' | 'board' | 'unblur' | 'done';

export function RevealOverlay({ shirtNumber, childName, children }: RevealOverlayProps) {
  const storageKey = `ban-revealed-${shirtNumber}`;
  const [checked, setChecked] = useState(false);
  const [alreadyRevealed, setAlreadyRevealed] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');

  useEffect(() => {
    try {
      setAlreadyRevealed(localStorage.getItem(storageKey) === 'yes');
    } catch {
      setAlreadyRevealed(true);
    }
    setChecked(true);
  }, [storageKey]);

  const handleComplete = useCallback(() => {
    // Sound + confetti + persistence fire immediately on hold-complete.
    // Then the split-flap board takes over from the idle overlay.
    playRevealChime();
    fireConfetti();
    try { localStorage.setItem(storageKey, 'yes'); } catch {}
    setStage('board');
    // The board scrambles + locks over ~1.4s; give it ~2.4s on screen
    // (lock cascade + breath) before the unblur takes over.
    setTimeout(() => setStage('unblur'), 2400);
    setTimeout(() => setStage('done'), 3800);
  }, [storageKey]);

  if (!checked) return <div className="min-h-[60vh]" />;
  if (alreadyRevealed || stage === 'done') return <>{children}</>;

  return (
    <div className="relative">
      <style>{`
        @keyframes revealBoardIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes revealBoardOut {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-16px) scale(0.98); }
        }
        @keyframes revealIdleIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Blurred content — unblurs during 'unblur' */}
      <div
        className="transition-all ease-out"
        style={{
          filter: stage === 'unblur' ? 'blur(0px)' : 'blur(20px)',
          opacity: stage === 'unblur' ? 1 : 0.3,
          transform: stage === 'unblur' ? 'scale(1)' : 'scale(0.97)',
          transitionDuration: stage === 'unblur' ? '1400ms' : '0ms',
          pointerEvents: stage === 'unblur' ? 'auto' : 'none',
        }}
        aria-hidden={stage !== 'unblur'}
      >
        {children}
      </div>

      {/* ── Stage: idle ── pre-reveal overlay with hold button */}
      {stage === 'idle' && (
        <div className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div
            className="text-center px-8 pointer-events-auto"
            style={{ animation: 'revealIdleIn 500ms ease-out both' }}
          >
            <div className="bg-white/90 backdrop-blur-sm border border-[#e8e0d4] py-10 px-8 md:py-14 md:px-16 shadow-xl max-w-lg mx-auto">
              <p
                className="text-3xl md:text-5xl text-[#0d0d0d] mb-7"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Every number is a name.
              </p>
              <p
                className="text-5xl md:text-7xl text-[#D4A843] mb-9"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                #{shirtNumber}
              </p>
              <div className="flex flex-col items-center">
                <HoldButton
                  onComplete={handleComplete}
                  label="Hold to meet"
                  holdDurationMs={1500}
                  size={180}
                />
                <p className="text-xs text-[#999] mt-5 uppercase tracking-[0.2em]">
                  Press and hold
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage: board ── split-flap reveals the name */}
      {(stage === 'board' || stage === 'unblur') && (
        <div
          className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none px-5"
          style={{
            animation:
              stage === 'unblur'
                ? 'revealBoardOut 600ms ease-in forwards'
                : 'revealBoardIn 500ms ease-out forwards',
          }}
        >
          <div className="text-center w-full max-w-3xl">
            <p
              className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-5"
              style={{ textShadow: '0 2px 14px rgba(255,248,240,1)' }}
            >
              #{shirtNumber} is
            </p>
            <div
              className="flex items-center justify-center"
              style={{ fontSize: 'clamp(1.6rem, 6.5vw, 3.6rem)' }}
            >
              <SplitFlapBoard
                text={childName.toUpperCase()}
                startDelay={150}
                lockDuration={1400}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
