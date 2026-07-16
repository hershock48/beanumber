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
  findSponsorshipForEmailAndClaimedNumber,
  getViewerSponsorshipForChild,
  getPublishedUpdatesForChild,
} from '@/lib/db/queries';
import { getViewerEmails } from '@/lib/mobile-viewer';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';
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

  // Same resolver as the claim flow — canonical row ≤53, Batches
  // cycle math 54+ — so mobile and web agree on which kid a number is.
  const identity = await resolveShirtNumberForClaim(shirtNumber);
  if (!identity) {
    throw new NotFoundError('Kid not found');
  }
  const child: Child = identity.canonicalRow;

  // Updates read gate: sponsor (monthly) OR holder of THIS kid, on
  // ANY of the viewer's emails. Per-number claims count — a cycle
  // number's holder row carries claimed_shirt_number + the synthetic
  // legacy id, never the canonical kid's own identity.
  const emails = await getViewerEmails(viewer);
  let allowed = false;
  for (const email of emails) {
    const byNumber = await findSponsorshipForEmailAndClaimedNumber(
      email,
      shirtNumber
    );
    if (byNumber) {
      allowed = true;
      break;
    }
    const summary = await getViewerSponsorshipForChild(email, {
      id: child.id,
      childId: child.childId ?? identity.childIdLegacy,
    });
    if (summary) {
      allowed = true;
      break;
    }
  }
  if (!allowed) {
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
  handler,
  'GET',
  '/api/mobile/v1/kids/[shirtNumber]/updates'
);
