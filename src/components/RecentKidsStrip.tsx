'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface RecentKid {
  shirtNumber: number;
  displayName: string;
  firstName: string;
  photoUrl?: string;
  visitedAt: number;
}

/**
 * Horizontal "Kids you've met" strip — pulled from the client's
 * localStorage history (written by RecentKidsTracker on every kid
 * page visit). Renders nothing until at least 2 kids are met (one
 * kid alone reads as redundant when you're already on someone's
 * page).
 *
 * Excludes a kid if `excludeShirtNumber` is supplied — used on the
 * /[N] page to hide the current kid from the strip below them.
 *
 * Layer 2 of multi-kid identity: the campus feels populated and
 * the visitor's journey accumulates.
 */
export function RecentKidsStrip({
  excludeShirtNumber,
  variant = 'page',
}: {
  excludeShirtNumber?: number;
  /** 'page' (full-width section) or 'compact' (inline strip) */
  variant?: 'page' | 'compact';
}) {
  const [kids, setKids] = useState<RecentKid[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ban-recent-kids');
      const list: RecentKid[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) {
        setKids([]);
      } else {
        const filtered = list.filter(
          k => typeof k.shirtNumber === 'number' &&
            (!excludeShirtNumber || k.shirtNumber !== excludeShirtNumber)
        );
        setKids(filtered.slice(0, 8));
      }
    } catch {
      setKids([]);
    }
    setHydrated(true);
  }, [excludeShirtNumber]);

  if (!hydrated || kids.length < 2) return null;

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {kids.map(kid => (
          <Link
            key={kid.shirtNumber}
            href={`/children/${kid.shirtNumber}`}
            className="flex-shrink-0 group block w-20 text-center"
          >
            <div className="w-20 h-20 bg-[#f5f0e8] overflow-hidden mb-2 group-hover:ring-2 group-hover:ring-[#D4A843] transition-all">
              {kid.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={kid.photoUrl}
                  alt={kid.displayName}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <p
              className="text-xs text-[#0d0d0d] truncate"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {kid.firstName}
            </p>
            <p className="text-[10px] text-[#888]">#{kid.shirtNumber}</p>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-5 py-10 md:py-14">
      <div className="border-t border-[#e8e0d4] pt-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
          Kids you&rsquo;ve met
        </p>
        <h2
          className="text-2xl md:text-3xl text-[#0d0d0d] mb-6 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Your campus.
        </h2>
        <div className="flex gap-4 overflow-x-auto pb-3">
          {kids.map(kid => (
            <Link
              key={kid.shirtNumber}
              href={`/children/${kid.shirtNumber}`}
              className="flex-shrink-0 group block w-28 md:w-32 text-center"
            >
              <div className="w-28 h-28 md:w-32 md:h-32 bg-[#f5f0e8] overflow-hidden mb-2 group-hover:ring-2 group-hover:ring-[#D4A843] transition-all">
                {kid.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={kid.photoUrl}
                    alt={kid.displayName}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <p
                className="text-sm md:text-base text-[#0d0d0d] truncate"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                {kid.firstName}
              </p>
              <p className="text-xs text-[#888]">#{kid.shirtNumber}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
