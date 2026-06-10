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
 * Brand colors (gold + cream + white), 220 particles, ~180 frames
 * of physics.
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
  const cy = canvas.height * 0.4;

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
 * Bell-like triumph arpeggio + sub-bass thump via Web Audio API.
 * Four ascending notes (C5 → E5 → G5 → C6) rendered as
 * fundamental + 2nd + 3rd + 5th harmonics with decreasing amplitude
 * (classic bell timbre). A brief 80→40Hz sub-bass thump fires with
 * the first note to give the moment physical weight where the
 * haptic API isn't available (iPhone Safari + all desktops).
 * ~1.5s total. Generated on the fly, no asset required.
 */
/**
 * Synthesized "yay!" — two-syllable upbeat exclamation layered over
 * the chime + confetti at reveal time. Two notes (A4 short then D5
 * longer) with brass-like harmonic content. Not a recorded sample;
 * fully procedural so it works offline and doesn't add asset weight.
 *
 * Plays alongside playRevealChime() — different audio context so
 * they overlap naturally. Falls back silently if Web Audio is
 * unavailable.
 */
function playYaySound() {
  try {
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;

    // Helper: play a single note as a fundamental + three harmonics
    // for a richer, brass-like timbre. Triangle on the fundamental
    // gives a bit of warmth without the buzz of sawtooth.
    const playNote = (
      freq: number,
      startTime: number,
      duration: number,
      peakGain: number
    ) => {
      const harmonicAmps = [1, 0.4, 0.2, 0.08];
      [1, 2, 3, 4].forEach((mult, h) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = h === 0 ? 'triangle' : 'sine';
        osc.frequency.value = freq * mult;
        const amp = peakGain * harmonicAmps[h];
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(amp, startTime + 0.02);
        gain.gain.linearRampToValueAtTime(amp * 0.8, startTime + duration * 0.5);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
      });
    };

    // "Ya"  — A4 (440 Hz), short staccato
    playNote(440, now, 0.12, 0.12);
    // "Ay!" — D5 (587 Hz), longer with sustained tail
    playNote(587, now + 0.10, 0.38, 0.16);

    setTimeout(() => { try { ctx.close(); } catch {} }, 700);
  } catch {
    // Audio not supported / blocked — visual reveal still works.
  }
}

function playRevealChime() {
  try {
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    const noteSpacing = 0.09;
    const harmonicAmps = [0.22, 0.14, 0.08, 0.05];

    notes.forEach((freq, i) => {
      const startTime = now + i * noteSpacing;
      [1, 2, 3, 5].forEach((mult, h) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq * mult;
        osc.type = h === 0 ? 'triangle' : 'sine';
        osc.connect(gain);
        gain.connect(ctx.destination);

        const amp = harmonicAmps[h];
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(amp, startTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.3 - i * 0.15);

        osc.start(startTime);
        osc.stop(startTime + 1.4);
      });
    });

    const thumpOsc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(80, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(38, now + 0.15);
    thumpOsc.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thumpGain.gain.setValueAtTime(0, now);
    thumpGain.gain.linearRampToValueAtTime(0.4, now + 0.005);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.28);

    setTimeout(() => {
      try { ctx.close(); } catch {}
    }, 1700);
  } catch {
    // Audio not supported / blocked — visual reveal still works.
  }
}

// Stages of the reveal:
//   idle    → blurred page, "Every number is a name" + Hold button
//   board   → confetti + chime fired; split-flap dominates the screen
//              on a dimmed backdrop, scrambling and locking the name
//              left-to-right
//   unblur  → board fades + page underneath unblurs to full visibility
//   done    → final state (same as return visits)
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
    playRevealChime();
    fireConfetti();
    // "Yay" lands a beat after the chime starts so the two sounds
    // overlap as celebration rather than collide as a single hit.
    // ~180ms gives the chime's first note room to register before
    // the vocal-style exclamation enters.
    setTimeout(() => playYaySound(), 180);
    try { localStorage.setItem(storageKey, 'yes'); } catch {}
    setStage('board');
    // Board scrambles + locks (~1.8s), holds locked for ~0.8s, then
    // we trigger the unblur. Total board screen time ~2.6s.
    setTimeout(() => setStage('unblur'), 2600);
    setTimeout(() => {
      setStage('done');
      // Broadcast that the reveal sequence has fully completed. Any
      // page-level UI that should wait for the reveal (e.g. the
      // AlreadySponsoringBanner) listens for this event.
      try {
        window.dispatchEvent(new CustomEvent('ban-reveal-done'));
      } catch {}
    }, 3800);
  }, [storageKey]);

  if (!checked) return <div className="min-h-[60vh]" />;
  if (alreadyRevealed || stage === 'done') return <>{children}</>;

  return (
    <div className="relative">
      <style>{`
        @keyframes revealIdleIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes revealBoardIn {
          0% { opacity: 0; transform: translateY(24px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes revealBoardOut {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-20px) scale(0.98); }
        }
        @keyframes revealScrimIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes revealScrimOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Page content — blurred while idle + board; clears on unblur */}
      <div
        className="transition-all ease-out"
        style={{
          filter: stage === 'unblur' ? 'blur(0px)' : 'blur(20px)',
          opacity: stage === 'unblur' ? 1 : 0.3,
          transform: stage === 'unblur' ? 'scale(1)' : 'scale(0.97)',
          transitionDuration: stage === 'unblur' ? '1200ms' : '0ms',
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

      {/* ── Stage: board ── dim scrim + split-flap takes center stage */}
      {(stage === 'board' || stage === 'unblur') && (
        <>
          {/* Dim scrim — gives the tiles a clean backdrop so the gold
              reads strongly without competing with anything else. */}
          <div
            className="fixed inset-0 z-10 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(13, 9, 5, 0.78) 0%, rgba(13, 9, 5, 0.55) 60%, rgba(13, 9, 5, 0.35) 100%)',
              animation:
                stage === 'unblur'
                  ? 'revealScrimOut 1000ms ease-in forwards'
                  : 'revealScrimIn 400ms ease-out forwards',
            }}
          />
          {/* Split-flap board — centered, big, the hero of the moment */}
          <div
            className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none px-5"
            style={{
              animation:
                stage === 'unblur'
                  ? 'revealBoardOut 800ms ease-in forwards'
                  : 'revealBoardIn 500ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
            }}
          >
            <div className="text-center w-full max-w-4xl">
              <p
                className="text-xs md:text-sm font-bold uppercase tracking-[0.4em] text-[#D4A843] mb-6"
              >
                #{shirtNumber} is
              </p>
              <div
                className="flex items-center justify-center"
                style={{ fontSize: 'clamp(2.4rem, 11vw, 5.2rem)' }}
              >
                <SplitFlapBoard
                  text={childName.toUpperCase()}
                  startDelay={200}
                  lockDuration={1800}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
