/**
 * Newsletter title helpers — deterministic titles for the monthly
 * campus update draft.
 *
 * Naming convention (as of July 2026):
 *   "{Month} at the campus"   e.g. "July at the campus"
 *
 * Kevin's read: naming by publish-month feels timely, whereas titling
 * by the content-month reads like a lookback and makes the site feel
 * a step behind. So the auto-generated title uses the CURRENT month
 * (the month the newsletter is being sent in), even though the body
 * inside typically covers the previous month's events. Same pattern
 * magazines have always used — a "July issue" hits inboxes in July,
 * regardless of when the photos were taken.
 *
 * Legacy titles ("Campus update — {Month} {Year}") from before this
 * rename are still recognized by candidateTitlesForCurrentMonth so
 * any in-progress drafts under the old name continue to load into
 * the same editor.
 */

export function buildCampusUpdateTitle(d: Date = new Date()): string {
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `${month} at the campus`;
}

export function buildLegacyMonthTitle(d: Date = new Date()): string {
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `Campus update — ${month} ${d.getFullYear()}`;
}

/**
 * Both titles for the same calendar month — new format first, legacy
 * second. Use this when looking up "this month's draft" so a draft
 * saved under the old title still gets picked up.
 */
export function candidateTitlesForMonth(d: Date = new Date()): string[] {
  return [buildCampusUpdateTitle(d), buildLegacyMonthTitle(d)];
}
