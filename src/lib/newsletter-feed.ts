/**
 * Public newsletter feed — shared fetcher used by:
 *   - /children/[number] page (CampusNewsfeed below the kid bio)
 *   - /news page (campus newsfeed without kid framing)
 *
 * Returns recent Sent newsletters from Postgres, newest first.
 * Implementation moved to src/lib/db/queries.ts; this file is a
 * thin re-export for source-compatibility with all existing
 * callers.
 *
 * See docs/claude/newsletter.md for the publishing model.
 */

export type { CampusNewsletterEntry } from './db/queries';
export { getRecentCampusNewsletters } from './db/queries';
