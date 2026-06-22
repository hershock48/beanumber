import { NextResponse } from 'next/server';
import {
  getChildByShirtNumber,
  listAllChildren,
} from '@/lib/db/queries';
import type { Child } from '@/lib/db/schema';

// Never cache. The enrolled roster changes and we don't want the homepage grid
// or the fallback child lookup serving stale data.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface OutgoingChild {
  id: string;
  child_id: string;
  first_name: string;
  last_initial?: string;
  display_name?: string;
  age?: number;
  grade_class?: string;
  photo_url?: string;
  fun_fact?: string;
  child_quote?: string;
  family_context?: string;
  home_village?: string;
  shirt_number_start?: number;
  shirt_number_end?: number;
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

function toOutgoing(child: Child): OutgoingChild {
  const firstName =
    child.firstName || child.displayName?.split(' ')[0] || 'Child';
  return {
    // Preserve the legacy contract: `id` was Airtable record id; we now use
    // Postgres UUID. Callers should not treat this as a routing key.
    id: child.id,
    child_id: child.childId || child.id,
    first_name: firstName,
    last_initial: child.lastInitial ?? undefined,
    display_name: child.displayName ?? undefined,
    age: computeAge(child.dateOfBirth),
    grade_class: child.gradeClass ?? undefined,
    photo_url: child.profilePhotoUrl ?? undefined,
    fun_fact: child.loves ?? undefined,
    child_quote: child.childQuote ?? undefined,
    family_context: child.familyContext ?? undefined,
    home_village: child.homeVillage ?? undefined,
    shirt_number_start: child.shirtNumber ?? undefined,
    shirt_number_end: child.shirtNumber ?? undefined,
  };
}

// Status values from Airtable have inconsistent casing ("active" vs "Active").
// Treat any non-graduated status as visible on the homepage.
function isVisibleStatus(status?: string | null): boolean {
  if (!status) return false;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'graduated') return false;
  if (normalized === 'archived') return false;
  if (normalized === 'inactive') return false;
  if (normalized === 'departed') return false;
  return true;
}

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
      const child = await getChildByShirtNumber(num);
      if (!child) {
        return NextResponse.json(
          { error: 'Child not found', child: null },
          { status: 404 }
        );
      }
      return NextResponse.json({ child: toOutgoing(child) });
    }

    // Full roster for the homepage grid. Filter at the DB level; further
    // refine here to hide reserved-for-auction holds.
    const rows = await listAllChildren();
    const children = rows
      .filter(c => !c.reservedForAuction)
      .filter(c => isVisibleStatus(c.status))
      .map(toOutgoing)
      .sort(
        (a, b) =>
          (a.shirt_number_start ?? 0) - (b.shirt_number_start ?? 0)
      );

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
