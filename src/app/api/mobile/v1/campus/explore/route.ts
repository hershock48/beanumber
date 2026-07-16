/**
 * GET /api/mobile/v1/campus/explore?limit=20&excludeMine=true
 *
 * Kids browsable in the Explore tab. Same base shape as /kids/mine
 * (id, firstName, shirtNumber, photoUrl, ageYears, gradeLabel) minus
 * the viewer-role info — Explore is a "meet a new kid" surface, not a
 * "your kids" surface.
 *
 * `excludeMine=true` (default) drops kids the viewer already sponsors
 * or holds. `excludeMine=false` returns the full roster (used for a
 * standalone browse tab if we ever add one).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import { getViewerEmails } from '@/lib/mobile-viewer';
import {
  getExploreKids,
  getMobileMineKidsForEmails,
} from '@/lib/db/queries';
import { sponsorGradeLabel, ageYearsFromDob } from '@/lib/mobile/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

export interface MobileExploreItem {
  id: string;
  firstName: string;
  shirtNumber: number | null;
  photoUrl: string | null;
  ageYears: number | null;
  gradeLabel: string | null;
}

export interface MobileExploreResponse {
  kids: MobileExploreItem[];
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/mobile/v1/campus/explore';
  logger.apiRequest(method, path);

  const viewer = await requireMobileAuth(request);

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit =
    !isNaN(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  // Default excludeMine=true — the caller has to explicitly opt in to
  // "include my kids" so the mobile screen never accidentally shows
  // duplicates alongside the /kids/mine list on the Home tab.
  const excludeMineParam = url.searchParams.get('excludeMine');
  const excludeMine = excludeMineParam !== 'false';

  let excludeChildIds: string[] = [];
  if (excludeMine) {
    const mine = await getMobileMineKidsForEmails(await getViewerEmails(viewer));
    excludeChildIds = mine
      .map(r => r.childRecordId)
      .filter((v): v is string => !!v);
  }

  const rows = await getExploreKids({ limit, excludeChildIds });
  const kids: MobileExploreItem[] = rows.map(r => ({
    id: r.id,
    firstName: r.firstName ?? 'them',
    shirtNumber: r.shirtNumber ?? null,
    photoUrl: r.profilePhotoUrl ?? null,
    ageYears: ageYearsFromDob(r.dateOfBirth),
    gradeLabel: sponsorGradeLabel(r.gradeClass),
  }));

  logger.apiResponse(method, path, 200);
  const body: MobileExploreResponse = { kids };
  return createSuccessResponse(body);
}

export const GET = withErrorHandling(
  handler,
  'GET',
  '/api/mobile/v1/campus/explore'
);
