/**
 * Homepage roster — the kid cards on / and the /api/children payload,
 * built in one place.
 *
 * Extracted from /api/children (2026-07-16 SEO/LCP pass) so the
 * homepage server component can render the carousel into the initial
 * HTML instead of client-fetching it after hydration. Route handlers
 * can only export HTTP verbs, so shared logic has to live outside
 * the route file. Both callers use the same shape; the API contract
 * is unchanged.
 */
import { listAllChildren } from '@/lib/db/queries';
import type { Child } from '@/lib/db/schema';

export interface OutgoingChild {
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

export function computeAge(dateOfBirth?: string | null): number | undefined {
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

export function toOutgoing(child: Child): OutgoingChild {
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
export function isVisibleStatus(status?: string | null): boolean {
  if (!status) return false;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'graduated') return false;
  if (normalized === 'archived') return false;
  if (normalized === 'inactive') return false;
  if (normalized === 'departed') return false;
  return true;
}

/** The full visible roster, homepage shape, shirt-number order. */
export async function getHomepageRoster(): Promise<OutgoingChild[]> {
  const rows = await listAllChildren();
  return rows
    .filter(c => !c.reservedForAuction)
    .filter(c => isVisibleStatus(c.status))
    .map(toOutgoing)
    .sort(
      (a, b) => (a.shirt_number_start ?? 0) - (b.shirt_number_start ?? 0)
    );
}
