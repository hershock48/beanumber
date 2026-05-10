'use client';

import { useState, useEffect, useCallback } from 'react';

interface RevealOverlayProps {
  shirtNumber: number;
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

  for (let i = 0; i < 120; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed * (0.6 + Math.random()),
      vy: Math.sin(angle) * speed * (0.6 + Math.random()) - 3,
      size: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }

  let frame = 0;
  const maxFrames = 120;

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
      p.vy += 0.18; // gravity
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

export function RevealOverlay({ shirtNumber, children }: RevealOverlayProps) {
  const storageKey = `ban-revealed-${shirtNumber}`;
  const [revealed, setRevealed] = useState<boolean | null>(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    // Check localStorage to see if they've already revealed this child.
    // Default to revealed=true so SSR/no-JS users see content immediately.
    try {
      const already = localStorage.getItem(storageKey);
      setRevealed(already === 'yes');
    } catch {
      setRevealed(true);
    }
  }, [storageKey]);

  const handleReveal = useCallback(() => {
    setAnimating(true);
    fireConfetti();
    try {
      localStorage.setItem(storageKey, 'yes');
    } catch {
      // Private browsing or full storage — just proceed.
    }
    // Let the unblur animation play, then fully reveal.
    setTimeout(() => {
      setRevealed(true);
      setAnimating(false);
    }, 900);
  }, [storageKey]);

  // While checking localStorage (first render), show nothing to avoid flash.
  if (revealed === null) {
    return <div className="min-h-[60vh]" />;
  }

  // Already revealed — render children normally.
  if (revealed) {
    return <>{children}</>;
  }

  // First visit — show the reveal experience.
  return (
    <div className="relative">
      {/* Blurred/hidden content underneath */}
      <div
        className="transition-all duration-700 ease-out"
        style={{
          filter: animating ? 'blur(0px)' : 'blur(16px)',
          opacity: animating ? 1 : 0.5,
          transform: animating ? 'scale(1)' : 'scale(0.98)',
          pointerEvents: animating ? 'auto' : 'none',
        }}
        aria-hidden={!animating}
      >
        {children}
      </div>

      {/* Overlay with reveal button — sits on top of blurred content */}
      {!animating && (
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
                has been waiting for you.
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
    </div>
  );
}
