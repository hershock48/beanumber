/**
 * Grade class — canonical codes with bidirectional translation.
 *
 * The YDO campus uses the Ugandan school system: two pre-primary
 * kindergarten levels followed by Primary 1 through Primary 5.
 * American sponsors don't know what "P3" means. Ugandan teachers
 * don't refer to their classes as "3rd Grade."
 *
 * We store one canonical code per kid and translate at the display
 * boundary based on audience:
 *
 *   Storage code   Simon (Ugandan)         US sponsor
 *   ─────────────  ──────────────────────  ─────────────
 *   LK             Lower Kindergarten      Young 5's
 *   UK             Upper Kindergarten      Kindergarten
 *   P1             P1                      1st Grade
 *   P2             P2                      2nd Grade
 *   P3             P3                      3rd Grade
 *   P4             P4                      4th Grade
 *   P5             P5                      5th Grade
 *
 * Rules
 * ─────
 *   - `gradeLabelForSimon` renders on admin surfaces + admin emails.
 *   - `gradeLabelForSponsor` renders on public + sponsor surfaces
 *     (kid page, /me KidCards, newsletter body, etc.).
 *   - `normalizeGradeInput` maps the messy legacy strings that
 *     currently live in the DB ("Pre-K", "TOP Class", "3rd Grade",
 *     etc.) onto canonical codes. Used by the data migration and by
 *     any admin form that accepts free-text grade input.
 *   - `gradeSortOrder` returns a 0-based ordering so a UI can list
 *     grades in the right sequence (LK before UK before P1…).
 */

export type GradeCode = 'LK' | 'UK' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export const ALL_GRADES: readonly GradeCode[] = [
  'LK',
  'UK',
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
] as const;

const SIMON_LABELS: Record<GradeCode, string> = {
  LK: 'Lower Kindergarten',
  UK: 'Upper Kindergarten',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
  P5: 'P5',
};

const SPONSOR_LABELS: Record<GradeCode, string> = {
  LK: "Young 5's",
  UK: 'Kindergarten',
  P1: '1st Grade',
  P2: '2nd Grade',
  P3: '3rd Grade',
  P4: '4th Grade',
  P5: '5th Grade',
};

/** True when the value is one of the seven canonical codes. */
export function isGradeCode(value: unknown): value is GradeCode {
  return (
    typeof value === 'string' && (ALL_GRADES as readonly string[]).includes(value)
  );
}

/**
 * Ugandan/British-system label. Used on admin surfaces where Simon
 * or Kevin is looking at the roster.
 */
export function gradeLabelForSimon(code: GradeCode | null | undefined): string {
  if (!code || !isGradeCode(code)) return '';
  return SIMON_LABELS[code];
}

/**
 * American-system label. Used on every sponsor-facing surface (kid
 * page, /me KidCard, newsletter, share cards).
 */
export function gradeLabelForSponsor(code: GradeCode | null | undefined): string {
  if (!code || !isGradeCode(code)) return '';
  return SPONSOR_LABELS[code];
}

/**
 * 0-based ordering so UI lists render LK → UK → P1 → … → P5.
 * Unknown codes sort last.
 */
export function gradeSortOrder(code: GradeCode | null | undefined): number {
  if (!code || !isGradeCode(code)) return 99;
  return ALL_GRADES.indexOf(code);
}

/**
 * Legacy string → canonical code. Handles every value currently in
 * the DB across the 50-kid roster (as of 2026-07-06) plus common
 * variants Simon or an intake form might submit. Returns null when
 * we genuinely don't recognize the input — callers should treat
 * that as "grade unknown, needs Simon."
 *
 * Cases handled:
 *   - Canonical codes ("LK", "P3") pass through unchanged.
 *   - US labels currently in the DB ("Pre-K", "Kindergarten",
 *     "1st Grade", …, "5th Grade") map to the corresponding code.
 *   - Ugandan labels ("Lower Kindergarten", "P1", "P.1", …) map
 *     to the corresponding code.
 *   - Junk that came out of Simon's early intake ("TOP Class",
 *     "Kindergarten three") gets its best-guess mapping and is
 *     flagged in the migration audit for a manual check.
 */
export function normalizeGradeInput(
  input: string | null | undefined
): GradeCode | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Pass through canonical codes (case-insensitive).
  const upper = raw.toUpperCase();
  if ((ALL_GRADES as readonly string[]).includes(upper)) {
    return upper as GradeCode;
  }

  // Normalize whitespace, dots, and dashes so "P.1" / "P 1" / "P-1"
  // all collapse to "P1" before we test.
  const compact = raw.replace(/[.\s\-_]/g, '').toUpperCase();
  if ((ALL_GRADES as readonly string[]).includes(compact)) {
    return compact as GradeCode;
  }

  // Lower-case comparison for word-based labels.
  const lower = raw.toLowerCase();

  // Pre-primary / kindergarten
  if (
    lower === 'pre-k' ||
    lower === 'prek' ||
    lower === 'pre k' ||
    lower.includes('lower kindergarten') ||
    lower.includes('baby class') ||
    lower.includes('young') // "Young 5s" / "Young 5's"
  ) {
    return 'LK';
  }
  if (
    lower === 'kindergarten' ||
    lower.includes('upper kindergarten') ||
    lower.includes('top class') ||
    lower === 'kindergarten three' // legacy artifact of a mis-labelled intake
  ) {
    return 'UK';
  }

  // Primary / US grades
  if (lower.includes('1st') || lower.includes('first') || lower === 'p1') return 'P1';
  if (lower.includes('2nd') || lower.includes('second') || lower === 'p2') return 'P2';
  if (lower.includes('3rd') || lower.includes('third') || lower === 'p3') return 'P3';
  if (lower.includes('4th') || lower.includes('fourth') || lower === 'p4') return 'P4';
  if (lower.includes('5th') || lower.includes('fifth') || lower === 'p5') return 'P5';

  return null;
}
