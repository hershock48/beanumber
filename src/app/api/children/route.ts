import { NextResponse } from 'next/server';
import {
  getChildByShirtNumber,
  getChildByChildId,
} from '@/lib/db/queries';
import type { Child } from '@/lib/db/schema';
import { resolveShirtToKid } from '@/lib/cycle';
import { getHomepageRoster, toOutgoing } from '@/lib/homepage-roster';

/**
 * Hardcoded-formula safety net for shirts whose Batches row hasn&rsquo;t
 * been loaded. Same shape as the kid page&rsquo;s fallback so the API
 * never returns 404 for a number that&rsquo;s logically a cycle of a
 * real kid.
 *
 *   Era 1 (#54-150):  ((N - 54) % 52) + 2     → kid 2..53
 *   Era 2 (#151+):    ((N - 151) % 53) + 1    → kid 1..53
 */
function canonicalShirtNumber(n: number): number | null {
  // Upper bound at 300 (end of Batch 3) — without this the modulo
  // math would happily map arbitrarily large N to a real kid. Do NOT
  // bump past 300: the era formulas only describe Batches 1-3. Batch 4+
  // (#301-450, opened 2026-07-18) resolves via the Batches table ONLY.
  if (!Number.isFinite(n) || n < 1 || n > 300) return null;
  if (n <= 53) return null;
  if (n <= 150) return ((n - 54) % 52) + 2;
  return ((n - 151) % 53) + 1;
}

// Never cache. The enrolled roster changes and we don't want the homepage grid
// or the fallback child lookup serving stale data.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// OutgoingChild shape + mapping live in src/lib/homepage-roster.ts —
// shared with the homepage server component so both render the same cards.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const numberParam = searchParams.get('number');

  try {
    // Single-child lookup by shirt number (used by legacy callers).
    if (numberParam) {
      const num = parseInt(numberParam, 10);
      if (isNaN(num)) {
        return NextResponse.json(
          { error: 'Invalid number', child: null },
          { status: 400 }
        );
      }
      let child = await getChildByShirtNumber(num);
      // Cycle-math fallback so the API mirrors the kid page: cycle
      // shirts (e.g., #55, #100) resolve to their canonical kid.
      // Prefer the Batches resolver (DB-driven, future-batch safe);
      // fall through to the hardcoded formula for any shirt not
      // yet covered by a Batches row.
      if (!child) {
        let canonical: Child | null = null;
        try {
          const resolved = await resolveShirtToKid(num);
          if (resolved?.childRecordId) {
            canonical = await getChildByChildId(resolved.childRecordId);
          }
        } catch {
          /* Batches read failed; fall through to formula */
        }
        if (!canonical) {
          const canonicalNum = canonicalShirtNumber(num);
          if (canonicalNum) {
            canonical = await getChildByShirtNumber(canonicalNum);
          }
        }
        if (canonical) {
          child = {
            ...canonical,
            shirtNumber: num,
            childId: `HSP/BAN-${String(num).padStart(3, '0')}`,
          };
        }
      }
      if (!child) {
        return NextResponse.json(
          { error: 'Child not found', child: null },
          { status: 404 }
        );
      }
      return NextResponse.json({ child: toOutgoing(child) });
    }

    // Full roster for the homepage grid — shared with the homepage
    // server component via getHomepageRoster().
    const children = await getHomepageRoster();

    return NextResponse.json({ children });
  } catch (error) {
    console.error('[api/children] Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        children: [],
      },
      { status: 500 }
    );
  }
}
