/**
 * Shared formatters used by /api/mobile/v1/* routes. Kept out of the
 * route files so the JSON shapes stay consistent across kids/mine,
 * kids/[N], campus/explore, etc. — sponsors don't get a grade string
 * one place and a different one somewhere else in the app.
 */

import { normalizeGradeInput, gradeLabelForSponsor } from '@/lib/grades';

/**
 * Age in whole years from a stored ISO date string, or null when the
 * date of birth isn't recorded yet (many kids on the roster don't have
 * a birthday captured — that's fine, the mobile UI hides the field).
 */
export function ageYearsFromDob(
  dateOfBirth: Date | string | null | undefined
): number | null {
  if (!dateOfBirth) return null;
  const birth =
    dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birth.getDate())
  ) {
    years -= 1;
  }
  return years >= 0 ? years : null;
}

/**
 * US-sponsor-facing grade label. Uses the canonical code translation
 * in src/lib/grades — same output the web /children/[N] page uses so
 * the two surfaces never disagree on what grade a kid is in.
 */
export function sponsorGradeLabel(
  gradeClass: string | null | undefined
): string | null {
  const code = normalizeGradeInput(gradeClass);
  if (!code) return gradeClass && gradeClass.trim() ? gradeClass : null;
  const label = gradeLabelForSponsor(code);
  return label || null;
}
