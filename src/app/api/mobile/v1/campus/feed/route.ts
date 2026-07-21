/**
 * GET /api/mobile/v1/campus/feed?limit=10&before=<ISODate>
 *
 * Campus-wide feed for the mobile home tab — chronological mix of the
 * latest kid updates and SOTM awards. Milestones + "campusPost" items
 * are wired into the same shape so a future admin surface can drop
 * events in without a new endpoint.
 *
 * Cursor pagination: pass `before` = the oldest publishedAt already
 * shown, get the next page. `nextCursor` is the oldest publishedAt
 * in the returned batch (null when we're at the end).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import {
  getCampusFeedUpdates,
  getCampusFeedSotm,
  getRecentCampusNewsletters,
} from '@/lib/db/queries';
import { gradeLabelForSponsor, isGradeCode } from '@/lib/grades';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 40;

export type MobileCampusFeedKind =
  | 'update'
  | 'sotm'
  | 'milestone'
  | 'campusPost'
  | 'newsletter';

export interface MobileCampusFeedItem {
  id: string;
  publishedAt: string;
  kind: MobileCampusFeedKind;
  title: string;
  body: string;
  photoUrl: string | null;
  kidRef: { firstName: string; shirtNumber: number } | null;
}

export interface MobileCampusFeedResponse {
  items: MobileCampusFeedItem[];
  nextCursor: string | null;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/mobile/v1/campus/feed';
  logger.apiRequest(method, path);

  // Auth is OPTIONAL. The feed must never be blank — a first-open
  // Home that says "nothing here yet" is the app apologizing on
  // arrival. Signed-in viewers get the full mix; anonymous viewers
  // get only the public-safe kinds (newsletters + SOTM — both
  // already public on the website). Per-kid personal updates stay
  // behind sign-in: those are sponsor-facing content about minors
  // and don't belong on an unauthenticated endpoint.
  let signedIn = false;
  try {
    await requireMobileAuth(request);
    signedIn = true;
  } catch {
    signedIn = false;
  }

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit =
    !isNaN(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  const beforeRaw = url.searchParams.get('before');
  let before: Date | null = null;
  if (beforeRaw) {
    const d = new Date(beforeRaw);
    if (!isNaN(d.getTime())) before = d;
  }

  // Pull `limit` from each source, then merge-sort in memory. All
  // streams are already ordered desc, so the merge is O(limit) and
  // the paginate-boundary reasoning stays clean.
  //
  // Newsletters are the floor of this feed: BAN has published issues
  // from day one, so even a brand-new viewer with no kid updates or
  // SOTM awards in the window sees a real, warm feed — never the
  // empty state. They're filtered by the `before` cursor in memory
  // (the query has no cursor param; the volume is a handful of rows).
  const [updates, sotms, newsletters] = await Promise.all([
    signedIn
      ? getCampusFeedUpdates({ limit, before })
      : Promise.resolve([]),
    getCampusFeedSotm({ limit, before }),
    getRecentCampusNewsletters(limit),
  ]);

  const items: MobileCampusFeedItem[] = [];
  for (const n of newsletters) {
    if (!n.publishedAt) continue;
    const publishedAt = new Date(n.publishedAt);
    if (isNaN(publishedAt.getTime())) continue;
    if (before && publishedAt >= before) continue;
    items.push({
      id: `newsletter:${n.id}`,
      publishedAt: publishedAt.toISOString(),
      kind: 'newsletter',
      title: n.title || 'A letter from the campus',
      // The subject line doubles as the teaser — it's written to make
      // someone open the issue, which is exactly this card's job.
      body: n.subject || '',
      photoUrl: n.heroPhotoUrl ?? null,
      kidRef: null,
    });
  }
  for (const u of updates) {
    const photos = u.photoUrls ?? [];
    const title =
      u.title ||
      u.positiveHighlight ||
      u.summary ||
      'An update from the campus';
    // Feed body — short teaser. Prefer summary, fall back to a
    // truncated content, fall back to the title.
    let body = u.summary || '';
    if (!body && u.content) {
      body = u.content.length > 220 ? `${u.content.slice(0, 217)}…` : u.content;
    }
    items.push({
      id: `update:${u.id}`,
      publishedAt: new Date(u.publishedAt).toISOString(),
      kind: 'update',
      title,
      body,
      photoUrl: photos[0] ?? null,
      kidRef:
        u.childFirstName && typeof u.childShirtNumber === 'number'
          ? {
              firstName: u.childFirstName,
              shirtNumber: u.childShirtNumber,
            }
          : null,
    });
  }
  for (const s of sotms) {
    const label = isGradeCode(s.gradeCode)
      ? gradeLabelForSponsor(s.gradeCode)
      : s.gradeCode;
    items.push({
      id: `sotm:${s.id}`,
      publishedAt: new Date(s.awardedAt).toISOString(),
      kind: 'sotm',
      title: `Student of the Month — ${label}`,
      body: s.reason || s.month,
      photoUrl: s.childPhotoUrl ?? null,
      kidRef:
        s.childFirstName && typeof s.childShirtNumber === 'number'
          ? {
              firstName: s.childFirstName,
              shirtNumber: s.childShirtNumber,
            }
          : null,
    });
  }

  items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const truncated = items.slice(0, limit);
  const nextCursor =
    truncated.length === limit
      ? truncated[truncated.length - 1].publishedAt
      : null;

  logger.apiResponse(method, path, 200);
  const body: MobileCampusFeedResponse = { items: truncated, nextCursor };
  return createSuccessResponse(body);
}

export const GET = withErrorHandling(
  handler,
  'GET',
  '/api/mobile/v1/campus/feed'
);
