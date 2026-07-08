/**
 * Cycle-shirt math shared across /api/mobile/v1/kids/[N] routes.
 *
 * Mirrors the formula used by /api/children/[number]/route.ts and
 * /children/[number]/page.tsx so mobile agrees with the web on what
 * kid #67, #100, etc. resolve to. See that file's docstring for the
 * derivation.
 *
 *   Era 1 (#54-150):  ((N - 54) % 52) + 2     → kid 2..53
 *   Era 2 (#151-300): ((N - 151) % 53) + 1    → kid 1..53
 *
 * Returns null for #1-53 (no cycle needed) and for out-of-range Ns.
 */
export function canonicalShirtNumber(n: number): number | null {
  if (!Number.isFinite(n) || n < 1 || n > 300) return null;
  if (n <= 53) return null;
  if (n <= 150) return ((n - 54) % 52) + 2;
  return ((n - 151) % 53) + 1;
}
