'use client';

/**
 * MarkKidUpdatesSeen — no-render side-effect component. Placed on the
 * kid's page (/children/[N]) it stamps localStorage with "you've seen
 * updates for this kid up to now" whenever a signed-in sponsor lands
 * on the page.
 *
 * We stamp `now()` (not the latest update's publishedAt) so that any
 * update published AFTER this visit will correctly show as unread on
 * the next /me visit, even if no update exists at the time of the
 * current visit. This matches the isUnread rule in updates-seen.ts.
 *
 * The parent server component decides whether to render this at all —
 * usually only for signed-in sponsors of THIS kid, so a random visitor
 * looking up /children/17 doesn't overwrite anyone's read state.
 */

import { useEffect } from 'react';
import { markSeen } from '@/lib/updates-seen';

export function MarkKidUpdatesSeen({
  childIdLegacy,
}: {
  childIdLegacy: string | null;
}) {
  useEffect(() => {
    if (!childIdLegacy) return;
    markSeen(childIdLegacy);
  }, [childIdLegacy]);
  return null;
}
