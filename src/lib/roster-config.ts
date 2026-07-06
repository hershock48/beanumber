/**
 * Canonical roster configuration.
 *
 * The canonical roster is the set of shirt numbers reserved for real,
 * unique kids at the campus. Shirt numbers past this range are cycle
 * numbers that map back to canonical kids via the Batches table (so
 * shirt #106 is Marvin the same way shirt #2 is Marvin — one row of
 * data, many shirt numbers pointing at it).
 *
 * Bump CANONICAL_ROSTER_MAX when the campus needs more real kids on
 * the roster. Extending it is safe as long as the new range doesn't
 * overlap with an existing cycle batch's snapshot map. Practically:
 * bump it before opening a new canonical-range batch, then update
 * Batch 1's end_shirt_number in the batches table to match.
 *
 * All the places that used to hardcode 53 read from here now so we
 * don't have to hunt through the codebase when this changes.
 */

export const CANONICAL_ROSTER_MIN = 1;
export const CANONICAL_ROSTER_MAX = 53;
