/**
 * GET /api/mobile/v1/kids/[shirtNumber]/updates
 *
 * Published, sponsor-visible updates the campus staff has posted about
 * this kid. Newest first, capped at 20. Powers the "Updates straight
 * from [kid]" tab on the mobile kid page.
 *
 * Access gate: viewer must have an Active OR Holder sponsorship of
 * THIS kid. Cold viewers get 403 — they see the profile but not the
 * per-kid update stream (that's a monthly-or-holder benefit, matching
 * the /children/[N] gate).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  NotFoundError,
  AuthorizationError,
  ValidationError,
} from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import {
  getChildByShirtNumber,
  getViewerSponsorshipForChild,
  getPublishedUpdatesForChild,
} from '@/lib/db/queries';
import { canonicalShirtNumber } from '@/lib/mobile/shirt-cycle';
import type { Child } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UPDATES_CAP = 20;

export interface MobileKidUpdate {
  id: string;
  publishedAt: string;
  caption: string;
  photoUrl: string | null;
}

export interface MobileKidUpdatesResponse {
  updates: MobileKidUpdate[];
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ shirtNumber: string }> }
): Promise<NextResponse> {
  const method = 'GET';
  const { shirtNumber: raw } = await context.params;
  const shirtNumber = parseInt(raw, 10);
  const path = `/api/mobile/v1/kids/${raw}/updates`;
  logger.apiRequest(method, path);

  if (isNaN(shirtNumber) || shirtNumber <= 0) {
    throw new ValidationError('Invalid shirt number');
  }

  const viewer = await requireMobileAuth(request);

  let child: Child | null = await getChildByShirtNumber(shirtNumber);
  if (!child) {
    const canonicalNum = canonicalShirtNumber(shirtNumber);
    if (canonicalNum) child = await getChildByShirtNumber(canonicalNum);
  }
  if (!child) {
    throw new NotFoundError('Kid not found');
  }

  const summary = await getViewerSponsorshipForChild(viewer.email, {
    id: child.id,
    childId: child.childId,
  });
  // Updates read gate: sponsor (monthly) OR holder of THIS kid.
  if (!summary) {
    throw new AuthorizationError(
      `Updates from ${child.firstName ?? 'this kid'} unlock once you're the shirt holder or monthly sponsor.`
    );
  }

  const rows = await getPublishedUpdatesForChild({
    id: child.id,
    childId: child.childId,
  });
  const capped = rows.slice(0, UPDATES_CAP);
  const updates: MobileKidUpdate[] = capped.map(r => {
    const photos = (r.photoUrls as string[] | null) ?? [];
    const caption =
      r.title || r.summary || 'A note from the campus';
    return {
      id: r.id,
      publishedAt: r.publishedAt
        ? new Date(r.publishedAt).toISOString()
        : new Date().toISOString(),
      caption,
      photoUrl: photos[0] ?? null,
    };
  });

  logger.apiResponse(method, path, 200);
  const body: MobileKidUpdatesResponse = { updates };
  return createSuccessResponse(body);
}

export const GET = withErrorHandling(
  handler as (request: NextRequest) => Promise<NextResponse>,
  'GET',
  '/api/mobile/v1/kids/[shirtNumber]/updates'
);
