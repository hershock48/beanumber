'use client';

import {
  gradeLabelForSimon,
  isGradeCode,
  type GradeCode,
} from '@/lib/grades';

/**
 * Client-side filter + sort wrapper around the roster grid.
 *
 * Two things this component does that the previous server-rendered grid
 * couldn't:
 *
 *   1. Sorts incomplete kids to the top. Alphabetical inside the two
 *      buckets. Simon opens the page, sees exactly who needs work at
 *      the top, doesn't have to hunt through 35 completed kids first.
 *
 *   2. Provides an All / Needs finishing filter with a live count.
 *      Choice sticks in localStorage per device so Simon lands on the
 *      view he was using last time.
 *
 * The RosterCard rendering is inline here — it moved out of page.tsx
 * with a new completion display: instead of five gray dots that
 * required hovering to identify, incomplete cards show plain-language
 * text ("Missing: name meaning · family") so Simon can see the gap
 * without touching a mouse.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { RosterKid } from '@/lib/admin/queries';
import { AddKidButton } from './AddKidButton';

interface RosterGridProps {
  kids: RosterKid[];
  role: 'admin' | 'simon';
}

const FILTER_STORAGE_KEY = 'ban-roster-filter-v1';

// Required fields for a "complete" profile — matches the completion
// check in getRoster's consumers. If we add or remove one, update the
// LABELS map below to keep the Missing display in sync.
const REQUIRED_FIELDS = [
  'photo',
  'nameMeaning',
  'familyContext',
  'loves',
  'notes',
] as const;

const LABELS: Record<(typeof REQUIRED_FIELDS)[number], string> = {
  photo: 'photo',
  nameMeaning: 'name meaning',
  familyContext: 'family',
  loves: 'loves',
  notes: 'bio',
};

function isComplete(kid: RosterKid): boolean {
  return REQUIRED_FIELDS.every(f => (kid.has as Record<string, boolean>)[f]);
}

function missingLabels(kid: RosterKid): string[] {
  return REQUIRED_FIELDS.filter(f => !(kid.has as Record<string, boolean>)[f]).map(
    f => LABELS[f]
  );
}

export function RosterGrid({ kids, role }: RosterGridProps) {
  // Filter state. 'all' shows the full grid; 'needs' shows only
  // incompletes. Read from localStorage on first mount so the choice
  // sticks per device.
  const [filter, setFilter] = useState<'all' | 'needs'>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved === 'all' || saved === 'needs') setFilter(saved);
    } catch {
      // localStorage disabled (private mode) — stay with 'all'
    }
    setMounted(true);
  }, []);

  function setFilterPersistent(next: 'all' | 'needs') {
    setFilter(next);
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  // Sort: incompletes first (alphabetical within), then completes
  // (alphabetical within). Filter applied after sort.
  const { sorted, incompleteCount } = useMemo(() => {
    const incomplete: RosterKid[] = [];
    const complete: RosterKid[] = [];
    for (const kid of kids) {
      if (isComplete(kid)) complete.push(kid);
      else incomplete.push(kid);
    }
    incomplete.sort((a, b) => a.displayName.localeCompare(b.displayName));
    complete.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return {
      sorted: [...incomplete, ...complete],
      incompleteCount: incomplete.length,
    };
  }, [kids]);

  // Server + client render should match on first paint. Use the SSR
  // default ('all') until localStorage has been consulted, then let
  // client updates take over.
  const filterToUse = mounted ? filter : 'all';
  const visibleFinal =
    filterToUse === 'needs' ? sorted.filter(k => !isComplete(k)) : sorted;

  return (
    <>
      {/* Filter toggle — pill-shaped, thumb-friendly on mobile. */}
      <div className="flex items-center gap-2 mb-5">
        <FilterButton
          active={filterToUse === 'all'}
          label={`All ${kids.length}`}
          onClick={() => setFilterPersistent('all')}
        />
        <FilterButton
          active={filterToUse === 'needs'}
          label={`Needs finishing (${incompleteCount})`}
          onClick={() => setFilterPersistent('needs')}
          highlighted={incompleteCount > 0}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {visibleFinal.map(kid => (
          <RosterCard key={kid.recordId} kid={kid} role={role} />
        ))}
        {/* Always show the add tile — a newly-added kid starts with
            zero fields filled so they land in the needs-finishing
            bucket immediately, which is convenient regardless of
            which filter is active. */}
        <AddKidButton />
      </div>
    </>
  );
}

function FilterButton({
  active,
  label,
  highlighted,
  onClick,
}: {
  active: boolean;
  label: string;
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-1.5 text-xs font-bold uppercase tracking-wider border transition-colors',
        active
          ? 'bg-[#0d0d0d] text-white border-[#0d0d0d]'
          : highlighted
            ? 'bg-white text-[#0d0d0d] border-[#D4A843] hover:bg-[#FFF8F0]'
            : 'bg-white text-[#666] border-[#e8e0d4] hover:border-[#0d0d0d] hover:text-[#0d0d0d]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function RosterCard({ kid, role }: { kid: RosterKid; role: 'admin' | 'simon' }) {
  const complete = isComplete(kid);
  const missing = missingLabels(kid);

  // Admin badges: red ring for Simon's touched-but-unreviewed kids;
  // amber for kids Simon flagged for departure; gray+desaturated for
  // departed. Simon sees a cleaner view without those signals.
  const isDeparted = !!kid.departedAt;
  const hasDepartureRequest =
    role === 'admin' && !isDeparted && !!kid.departureRequestedAt;

  const borderClass = isDeparted
    ? 'border-[#aaa] opacity-60 grayscale-[40%]'
    : hasDepartureRequest
      ? 'border-amber-400 ring-2 ring-amber-100'
      : role === 'admin' && (kid.hasPendingIntake || !!kid.lastEditedBySimon)
        ? 'border-red-400 ring-2 ring-red-100'
        : 'border-[#e8e0d4]';

  return (
    <Link
      href={`/admin/roster/${kid.shirtNumber}`}
      className={`block bg-white border ${borderClass} hover:border-[#D4A843] transition-colors overflow-hidden relative`}
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
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-3xl opacity-30">👤</p>
          </div>
        )}
        {role === 'admin' && (kid.hasPendingIntake || !!kid.lastEditedBySimon) && (
          <div
            className="absolute top-2 left-2 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white"
            title="Simon edited this kid — review and polish"
          />
        )}
        {role === 'admin' && kid.deletionRequestedAt && (
          <div
            className="absolute bottom-2 left-2 inline-flex items-center justify-center bg-red-600 text-white w-6 h-6 text-xs ring-2 ring-white"
            title="Deletion requested — review in editor"
            aria-hidden
          >
            🗑
          </div>
        )}
        {isDeparted && (
          <div
            className="absolute bottom-2 right-2 bg-[#666] text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1"
            title="Departed — no longer at the campus"
          >
            Departed
          </div>
        )}
        {hasDepartureRequest && (
          <div
            className="absolute bottom-2 right-2 bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1"
            title="Departure requested — review in editor"
          >
            Departure?
          </div>
        )}
        {kid.studentOfMonth && (
          <span
            className="absolute top-2 right-2 inline-flex items-center justify-center bg-[#D4A843] text-[#0d0d0d] w-7 h-7 text-base font-bold ring-2 ring-white"
            title={`Student of the Month · ${kid.studentOfMonth}`}
            aria-hidden
          >
            ★
          </span>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className="text-base text-[#0d0d0d] leading-snug truncate min-w-0"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {kid.displayName}
          </p>
          {role === 'admin' && (
            <span
              className="text-xs font-bold text-[#D4A843] tabular-nums flex-shrink-0"
              title={`Shirt #${kid.shirtNumber}`}
            >
              #{kid.shirtNumber}
            </span>
          )}
        </div>
        {kid.gradeClass && (
          <p className="text-xs text-[#888] mt-1 truncate">
            {isGradeCode(kid.gradeClass)
              ? gradeLabelForSimon(kid.gradeClass as GradeCode)
              : kid.gradeClass /* fall back to raw when we don't recognize it — better than showing nothing while data is drifting */}
          </p>
        )}

        {/* Completion state. Complete kids get a green celebration pill;
            incomplete kids get a plain-language 'Missing: name meaning ·
            family' line so it's obvious what's needed without hovering
            over anonymous dots. */}
        {complete ? (
          <div className="flex items-center mt-3">
            <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wider px-2 py-1 border border-green-200">
              <svg
                className="w-3 h-3"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              Complete
            </span>
          </div>
        ) : (
          <div className="mt-3 text-xs text-[#666] leading-relaxed">
            <span className="font-bold text-[#D4A843] uppercase tracking-wider">
              Missing:
            </span>{' '}
            {missing.join(' · ')}
          </div>
        )}
      </div>
    </Link>
  );
}
