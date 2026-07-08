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
  | 'campusPost';

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

  await requireMobileAuth(request);

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

  // Pull `limit` from each source, then merge-sort in memory. Because
  // both streams are already ordered desc, the merge is O(limit) and
  // the paginate-boundary reasoning stays clean.
  const [updates, sotms] = await Promise.all([
    getCampusFeedUpdates({ limit, before }),
    getCampusFeedSotm({ limit, before }),
  ]);

  const items: MobileCampusFeedItem[] = [];
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
