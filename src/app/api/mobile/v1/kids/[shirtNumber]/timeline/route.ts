/**
 * GET /api/mobile/v1/kids/[shirtNumber]/timeline
 *
 * Chronological achievements + milestones for one kid — Student of the
 * Month awards, grade promotions, hand-authored milestones. Powers the
 * "Timeline" tab on the mobile kid page. Reverse chronological, capped
 * at 30 entries.
 *
 * Open to any signed-in viewer — no sponsor gating. The timeline is a
 * "here's who this kid is" surface, not privileged sponsor content.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import {
  getChildByShirtNumber,
  getSotmHistoryForChild,
} from '@/lib/db/queries';
import { canonicalShirtNumber } from '@/lib/mobile/shirt-cycle';
import { gradeLabelForSponsor, isGradeCode } from '@/lib/grades';
import type { Child } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TIMELINE_CAP = 30;

export type MobileKidTimelineType = 'sotm' | 'promotion' | 'milestone';

export interface MobileKidTimelineEntry {
  id: string;
  occurredOn: string;
  type: MobileKidTimelineType;
  title: string;
  subtitle: string;
}

export interface MobileKidTimelineResponse {
  entries: MobileKidTimelineEntry[];
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ shirtNumber: string }> }
): Promise<NextResponse> {
  const method = 'GET';
  const { shirtNumber: raw } = await context.params;
  const shirtNumber = parseInt(raw, 10);
  const path = `/api/mobile/v1/kids/${raw}/timeline`;
  logger.apiRequest(method, path);

  if (isNaN(shirtNumber) || shirtNumber <= 0) {
    throw new ValidationError('Invalid shirt number');
  }

  await requireMobileAuth(request);

  let child: Child | null = await getChildByShirtNumber(shirtNumber);
  if (!child) {
    const canonicalNum = canonicalShirtNumber(shirtNumber);
    if (canonicalNum) child = await getChildByShirtNumber(canonicalNum);
  }
  if (!child) {
    throw new NotFoundError('Kid not found');
  }

  // Currently the two structured event streams are SOTM awards and the
  // implicit "enrollment / departure" bookends on the children row.
  // Promotions live conceptually per-award (grade code snapshot) — we
  // could infer a promotion timeline from the sequence of gradeCodes
  // in sotm_history, but that's noisy. For phase-1 mobile timeline we
  // return SOTMs as "sotm" and derive an "enrollment" milestone from
  // enrollmentDate when we have one; anything else lands here when it
  // gets structured.
  const sotm = await getSotmHistoryForChild(child.id);
  const entries: MobileKidTimelineEntry[] = [];

  for (const award of sotm) {
    const gradeLabel = isGradeCode(award.gradeCode)
      ? gradeLabelForSponsor(award.gradeCode)
      : award.gradeCode;
    entries.push({
      id: `sotm:${award.id}`,
      occurredOn: award.awardedAt,
      type: 'sotm',
      title: `Student of the Month — ${gradeLabel}`,
      subtitle: award.reason || award.month,
    });
  }

  // Grade-change promotions inferred from the sequence of gradeCodes
  // across SOTM awards. When the same kid earns SOTM in P2 and then
  // later in P3, that's a promotion event between the two awards.
  const orderedAsc = [...sotm].reverse(); // oldest → newest
  let lastGrade: string | null = null;
  let promotionCounter = 0;
  for (const award of orderedAsc) {
    if (lastGrade && award.gradeCode !== lastGrade) {
      promotionCounter += 1;
      const toLabel = isGradeCode(award.gradeCode)
        ? gradeLabelForSponsor(award.gradeCode)
        : award.gradeCode;
      const fromLabel = isGradeCode(lastGrade)
        ? gradeLabelForSponsor(lastGrade)
        : lastGrade;
      entries.push({
        id: `promotion:${award.id}:${promotionCounter}`,
        occurredOn: award.awardedAt,
        type: 'promotion',
        title: `Promoted to ${toLabel}`,
        subtitle: `Up from ${fromLabel}`,
      });
    }
    lastGrade = award.gradeCode;
  }

  // Enrollment milestone — when we have an enrollment date on file.
  if (child.enrollmentDate) {
    entries.push({
      id: `enrolled:${child.id}`,
      occurredOn: new Date(child.enrollmentDate).toISOString(),
      type: 'milestone',
      title: 'Joined the campus',
      subtitle: `${child.firstName ?? 'They'} started at the YDO campus`,
    });
  }

  // Departure milestone — when applicable. Rare for the mobile screen
  // because the /kids/mine list already excludes departed kids, but a
  // sponsor visiting their old kid's profile should still see it.
  if (child.departedAt) {
    entries.push({
      id: `departed:${child.id}`,
      occurredOn: new Date(child.departedAt).toISOString(),
      type: 'milestone',
      title: 'Departed the campus',
      subtitle: child.departureNote ?? 'Moved on from the YDO campus',
    });
  }

  entries.sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  const capped = entries.slice(0, TIMELINE_CAP);

  logger.apiResponse(method, path, 200);
  const body: MobileKidTimelineResponse = { entries: capped };
  return createSuccessResponse(body);
}

export const GET = withErrorHandling(
  handler as (request: NextRequest) => Promise<NextResponse>,
  'GET',
  '/api/mobile/v1/kids/[shirtNumber]/timeline'
);
