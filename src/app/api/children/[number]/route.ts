/**
 * GET /api/children/[number]
 *
 * Returns a single kid by shirt number as JSON. Mobile app calls
 * this when the sponsor types a number on the home screen. The
 * existing web-side server-rendered /children/[number]/page.tsx
 * stays as it is — this is a new additive endpoint that surfaces
 * the same data over JSON for non-Next.js clients.
 *
 * Public endpoint. Same fields the public profile page renders;
 * sponsor-gated fields (report cards, letters, billing) are NOT
 * included — those require an authenticated session and live on
 * the sponsor portal endpoint.
 *
 * Returns 200 with kid JSON, 404 if no kid matches that shirt
 * number, 500 on Postgres errors. Reserved-for-auction numbers
 * return 200 with `{ reserved: true }` so the client can render
 * the right state without a second API call.
 *
 * Mirrors the cycle-math fallback in /api/children?number=N: cycle
 * shirts (e.g. #67, #100) resolve to their canonical kid so this
 * endpoint and the kid page agree on what shirt #N means.
 */

import { NextResponse } from 'next/server';
import { getChildByShirtNumber } from '@/lib/db/queries';
import type { Child } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Map a cycle shirt number to its canonical kid (shirts > 53). Mirrors
 * the formula in /api/children/route.ts and /children/[number]/page.tsx
 * so all three surfaces agree on what kid #67, #100, etc. show.
 *
 *   Era 1 (#54-150):  ((N - 54) % 52) + 2     → kid 2..53
 *   Era 2 (#151+):    ((N - 151) % 53) + 1    → kid 1..53
 *
 * Returns null for #1-53 (no cycle).
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

function computeAge(dateOfBirth?: string | null): number | undefined {
  if (!dateOfBirth) return undefined;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  return years >= 0 ? years : undefined;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ number: string }> }
) {
  const { number } = await context.params;
  const shirtNumber = parseInt(number, 10);
  if (isNaN(shirtNumber) || shirtNumber <= 0) {
    return NextResponse.json(
      { error: 'Invalid shirt number' },
      { status: 400 }
    );
  }

  try {
    let child: Child | null = await getChildByShirtNumber(shirtNumber);

    // Cycle-math fallback so this endpoint mirrors the kid page +
    // /api/children?number=N: cycle shirts (#55, #100, ...) resolve
    // to their canonical kid rather than 404'ing.
    if (!child) {
      const canonicalNum = canonicalShirtNumber(shirtNumber);
      if (canonicalNum) {
        const canonical = await getChildByShirtNumber(canonicalNum);
        if (canonical) {
          // Synthesize a row that carries the cycle shirt number as
          // identity. The kid is the canonical kid; we just project
          // the typed-in shirt number onto it.
          child = {
            ...canonical,
            shirtNumber,
            childId: `HSP/BAN-${String(shirtNumber).padStart(3, '0')}`,
          };
        }
      }
    }

    if (!child) {
      return NextResponse.json(
        { error: 'No kid found for that number' },
        { status: 404 }
      );
    }

    // Reserved-for-auction short circuit. The kid record exists to
    // hold the number; we don't have a profile to surface.
    if (child.reservedForAuction) {
      return NextResponse.json({
        reserved: true,
        shirt_number: shirtNumber,
      });
    }

    return NextResponse.json({
      reserved: false,
      record_id: child.id,
      child_id: child.childId || '',
      display_name:
        child.displayName ||
        `${child.firstName || 'Child'} ${child.lastInitial || ''}`.trim(),
      first_name: child.firstName || 'Child',
      last_initial: child.lastInitial ?? undefined,
      age: computeAge(child.dateOfBirth),
      grade_class: child.gradeClass ?? undefined,
      shirt_number:
        typeof child.shirtNumber === 'number' ? child.shirtNumber : shirtNumber,
      photo_url: child.profilePhotoUrl ?? undefined,
      photo_urls: child.profilePhotoUrl ? [child.profilePhotoUrl] : [],
      home_village: child.homeVillage ?? undefined,
      family_context: child.familyContext ?? undefined,
      loves: child.loves ?? undefined,
      child_quote: child.childQuote ?? undefined,
      teacher_name: child.teacherName ?? undefined,
      teacher_quote: child.teacherQuote ?? undefined,
      name_meaning: child.nameMeaning ?? undefined,
      notes: child.notes ?? undefined,
      student_of_month: child.studentOfMonth ?? undefined,
      student_of_month_reason: child.studentOfMonthReason ?? undefined,
      departed_at: child.departedAt
        ? new Date(child.departedAt).toISOString()
        : undefined,
      departure_note: child.departureNote ?? undefined,
    });
  } catch (error) {
    console.error('[api/children/N] Error', {
      shirtNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to fetch kid' },
      { status: 500 }
    );
  }
}
