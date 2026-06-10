/**
 * Shared helpers for the Children.PendingDraft JSON field.
 *
 * PendingDraft is a multilineText field that holds Simon&rsquo;s pending
 * structured-field edits as a JSON blob keyed by the same camelCase
 * field names the editor uses (nameMeaning, familyContext, loves,
 * childQuote, notes). The roster save endpoint, the approve endpoint,
 * the queries hydration, and the review page all parse the same shape;
 * this lib is the single source of truth for what that shape is and
 * how it&rsquo;s read.
 *
 * Add a field here:
 *   1. Add the key to PendingDraft and GATED_FIELDS.
 *   2. Add the matching PendingFields multi-select option to
 *      FIELD_TO_PENDING_OPTION.
 *   3. Make sure the Children record actually has a public field for
 *      it, and that the roster save endpoint&rsquo;s fieldKeyToAirtable
 *      already references it.
 */

export interface PendingDraft {
  nameMeaning?: string;
  familyContext?: string;
  loves?: string;
  childQuote?: string;
  notes?: string;
}

/** The set of structured-field keys that go through the gated-draft
 *  workflow when Simon edits them. */
export const GATED_FIELDS = new Set<keyof PendingDraft>([
  'nameMeaning',
  'familyContext',
  'loves',
  'childQuote',
  'notes',
]);

/** PendingDraft body key → matching PendingFields multi-select option. */
export const FIELD_TO_PENDING_OPTION: Record<keyof PendingDraft, string> = {
  nameMeaning: 'NameMeaning',
  familyContext: 'FamilyContext',
  loves: 'Loves',
  childQuote: 'ChildQuote',
  notes: 'Notes',
};

/** Parse the raw cell value of the PendingDraft field. Tolerates
 *  missing, empty, or malformed JSON &mdash; returns {} so callers can
 *  safely spread it. */
export function parsePendingDraft(raw: unknown): PendingDraft {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as PendingDraft;
  } catch {
    // fall through
  }
  return {};
}
