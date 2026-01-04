'use client';

import { useEffect, useState, useRef } from 'react';

interface CountUpNumberProps {
  target: number;
  suffix?: string;
  duration?: number;
  className?: string;
}

export function CountUpNumber({ target, suffix = '', duration = 2000, className = '' }: CountUpNumberProps) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasAnimated) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            setHasAnimated(true);
            const startTime = Date.now();
            const startValue = 0;

            const animate = () => {
              const now = Date.now();
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              
              // Easing function for smooth animation
              const easeOut = 1 - Math.pow(1 - progress, 3);
              const current = Math.floor(startValue + (target - startValue) * easeOut);
              
              setCount(current);

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                setCount(target);
              }
            };

            animate();
          }
        });
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [target, duration, hasAnimated]);

  return (
    <div ref={ref} className={className}>
      {count}{suffix}
    </div>
  );
}
