/**
 * Sponsor relationship detection — shared between /children/[N] and
 * /meet/[childId] so both surfaces recognize signed-in sponsors via
 * the same code path.
 *
 * The viewer's email comes from the sponsor_session cookie. The
 * Postgres lookup matches on both the new child UUID and the legacy
 * ChildID text column so this works during the transition window
 * regardless of which join key the sponsorship row carries.
 *
 * Returns null when there's no signed-in viewer or no matching
 * sponsorship, allowing the calling page to fall through to its
 * cold-visitor view.
 */

import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';
import {
  getChildByChildId,
  getViewerSponsorshipForChild as getViewerSponsorshipForChildFromDb,
} from '@/lib/db/queries';

export interface ViewerRelationship {
  /** 'sponsor' when Active + monthly > 0, 'holder' otherwise. */
  kind: 'sponsor' | 'holder';
  sponsorCode: string;
  monthlyAmount: number;
  /** ISO date when the sponsorship started, or undefined. */
  startDate?: string;
  /** ISO timestamp when the sponsor first revealed this kid. */
  childRevealedAt?: string;
}

/**
 * Read the sponsor_session cookie and return the viewer's email
 * (lowercased, trimmed), or null if not signed in / cookie expired.
 */
export async function getViewerEmail(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return null;
    const session = JSON.parse(raw.value);
    if (new Date(session.expires) < new Date()) return null;
    const email = (session.email as string | undefined)?.trim().toLowerCase();
    return email && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

/**
 * Returns the viewer's sponsorship of the given kid, if any.
 *
 * Accepts the kid's legacy ChildID (e.g. "HSP/BAN-002") so existing
 * callers don't need to change. We resolve the kid record once
 * here, then delegate to the typed queries.ts function which knows
 * how to match against both UUID and legacy ID columns.
 */
export async function getViewerSponsorshipForChild(
  childId: string
): Promise<ViewerRelationship | null> {
  if (!childId) return null;

  const email = await getViewerEmail();
  if (!email) return null;

  try {
    const child = await getChildByChildId(childId);
    if (!child) return null;

    const result = await getViewerSponsorshipForChildFromDb(email, {
      id: child.id,
      childId: child.childId,
    });
    if (!result) return null;

    return {
      kind: result.kind,
      sponsorCode: result.sponsorCode,
      monthlyAmount: result.monthlyAmount,
      startDate: result.sponsorshipStartDate ?? undefined,
      childRevealedAt: result.childRevealedAt ?? undefined,
    };
  } catch (err) {
    console.warn('[sponsor-relationship] lookup failed', err);
    return null;
  }
}
