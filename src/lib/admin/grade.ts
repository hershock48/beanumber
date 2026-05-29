/**
 * Grade normalization.
 *
 * The campus uses Uganda's grade system (Middle Class, Top Class,
 * P1–P5). Kevin's US-based audience knows it as Pre-K, K, 1st, 2nd,
 * etc. Airtable's GradeClass field stores whatever string was typed
 * (some legacy rows say "Kindergarten" or "TOP Class").
 *
 * This helper maps the raw string into a canonical structure:
 *   - key:   stable lookup ID (used for grouping)
 *   - label: human-readable form shown in UI ("P3 (3rd Grade)")
 *   - order: stable sort index so grade lists always render
 *            youngest to oldest
 *
 * Anything unrecognized falls into the catch-all 'unknown' bucket
 * so kids with empty / typo'd grades still surface somewhere.
 */

export interface NormalizedGrade {
  key: string;
  label: string;
  order: number;
}

const UNKNOWN: NormalizedGrade = {
  key: 'unknown',
  label: 'No grade set',
  order: 99,
};

/** The seven canonical grades, in age order. */
export const CANONICAL_GRADES: NormalizedGrade[] = [
  { key: 'middle_class', label: 'Middle Class (Pre-K)', order: 1 },
  { key: 'top_class', label: 'Top Class (Kindergarten)', order: 2 },
  { key: 'p1', label: 'P1 (1st Grade)', order: 3 },
  { key: 'p2', label: 'P2 (2nd Grade)', order: 4 },
  { key: 'p3', label: 'P3 (3rd Grade)', order: 5 },
  { key: 'p4', label: 'P4 (4th Grade)', order: 6 },
  { key: 'p5', label: 'P5 (5th Grade)', order: 7 },
];

export function normalizeGrade(raw: string | null | undefined): NormalizedGrade {
  if (!raw || typeof raw !== 'string') return UNKNOWN;
  const t = raw.trim().toLowerCase();
  if (!t) return UNKNOWN;

  if (t.includes('middle')) return CANONICAL_GRADES[0]; // Middle Class
  if (t.includes('pre-k') || t === 'pre k' || t === 'prek') return CANONICAL_GRADES[0];
  if (t.includes('top class')) return CANONICAL_GRADES[1];
  if (t.includes('kindergarten 3') || t.includes('k3')) return CANONICAL_GRADES[1];
  // "Kindergarten" without further qualifier — assume Top Class
  // (the older of the two pre-school groups).
  if (t === 'kindergarten' || t === 'k') return CANONICAL_GRADES[1];
  if (t.includes('kindergarten 2') || t.includes('k2')) return CANONICAL_GRADES[0];

  // Primary classes: 'P1', 'P 1', 'Primary 1', 'P1 class'...
  const pMatch = t.match(/p\s*-?\s*(\d)/) || t.match(/primary\s*(\d)/);
  if (pMatch) {
    const n = parseInt(pMatch[1], 10);
    if (n >= 1 && n <= 5) return CANONICAL_GRADES[1 + n]; // p1 → index 2
  }

  return UNKNOWN;
}
