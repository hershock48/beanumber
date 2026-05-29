/**
 * "Hey, you've been assigned a new child" overlay.
 *
 * Fires for sponsors whose Sponsorship.LastReassignedAt is set AND
 * whose ChildRevealedAt was cleared by the reassignment. The page
 * computes this server-side and passes `needsReveal` here; we just
 * render the overlay when true.
 *
 * UX:
 *   1. Full-screen translucent overlay with the child name + photo
 *      placeholder, ready for the reveal.
 *   2. Big "Meet your new child" copy with the previous kid's name
 *      (if known) for emotional continuity — "Sunday's slot is now
 *      Naume's."
 *   3. CTA button "Meet them" → confetti fires, overlay fades, the
 *      regular profile page is revealed underneath.
 *
 * Dismissing the overlay does NOT itself set ChildRevealedAt — the
 * existing RevealBeacon component (which fires on mount silently)
 * handles that for any sponsor visiting their own kid. So after the
 * reveal, future visits won't show this overlay again.
 */
'use client';

import { useState, useCallback } from 'react';

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
    const speed = 4 + Math.random() * 10;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed * (0.6 + Math.random()),
      vy: Math.sin(angle) * speed * (0.6 + Math.random()) - 4,
      size: 4 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 12,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }

  let frame = 0;
  const max = 180;

  function animate() {
    frame++;
    if (!ctx) return;
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

interface ReassignRevealProps {
  needsReveal: boolean;
  shirtNumber: number;
  newChildName: string;
  previousChildName: string | null;
  children: React.ReactNode;
}

type Stage = 'overlay' | 'celebrate' | 'done';

export function ReassignReveal({
  needsReveal,
  shirtNumber,
  newChildName,
  previousChildName,
  children,
}: ReassignRevealProps) {
  const [stage, setStage] = useState<Stage>(needsReveal ? 'overlay' : 'done');

  const handleMeet = useCallback(() => {
    setStage('celebrate');
    fireConfetti();
    // After the confetti runs, fade out and reveal the page.
    setTimeout(() => setStage('done'), 1800);
  }, []);

  if (!needsReveal || stage === 'done') return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred + dim content underneath. Unblurs gradually after
          'celebrate' fires so the reveal feels like a curtain
          lifting on the new kid. */}
      <div
        className="transition-all ease-out"
        style={{
          filter: stage === 'overlay' ? 'blur(20px)' : 'blur(0px)',
          opacity: stage === 'overlay' ? 0.3 : 1,
          transform: stage === 'overlay' ? 'scale(0.97)' : 'scale(1)',
          transitionDuration: '1400ms',
          pointerEvents: stage === 'overlay' ? 'none' : 'auto',
        }}
        aria-hidden={stage === 'overlay'}
      >
        {children}
      </div>

      {stage === 'overlay' && (
        <div className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none px-5">
          <div className="text-center pointer-events-auto max-w-lg w-full">
            <div className="bg-white/95 backdrop-blur-sm border border-[#e8e0d4] py-10 px-8 md:py-14 md:px-12 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-4">
                An update for #{shirtNumber}
              </p>
              <p
                className="text-2xl md:text-3xl text-[#0d0d0d] mb-4 leading-tight"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                {previousChildName
                  ? `${previousChildName}'s no longer at Hope Bridge.`
                  : 'There’s been a change at Hope Bridge.'}
              </p>
              <p className="text-base md:text-lg text-[#666] mb-7 leading-relaxed">
                Same shirt, same campus, same hot lunch. Just a new
                face in the photo.
              </p>
              <p
                className="text-4xl md:text-5xl text-[#D4A843] mb-8 leading-tight"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                {newChildName}
              </p>
              <button
                onClick={handleMeet}
                className="w-full bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors text-lg"
              >
                Meet {newChildName.split(/\s+/)[0]}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'celebrate' && (
        <div
          className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none"
          style={{ animation: 'reassignFadeOut 1800ms ease-in forwards' }}
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
              {newChildName}
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
            @keyframes reassignFadeOut {
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
