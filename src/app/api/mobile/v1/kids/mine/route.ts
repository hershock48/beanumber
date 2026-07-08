/**
 * GET /api/mobile/v1/kids/mine
 *
 * The signed-in mobile user's "Your kids" list. Returns kids they hold
 * (shirt buyers who claimed a number via Hold-to-Meet) plus kids they
 * sponsor monthly. One row per sponsorship — a viewer with two monthly
 * sponsorships gets two rows; the shirt-holder relationship shows up
 * as one row with `roleForViewer='holder'` when they haven't converted
 * to $25/mo yet.
 *
 * Auth: mobile bearer (see requireMobileAuth). No cookie fallback.
 * Response: 200 with array; 401 when the bearer is missing/invalid.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import {
  getMobileMineKidsForEmail,
  getLatestUpdateForChild,
} from '@/lib/db/queries';
import { sponsorGradeLabel, ageYearsFromDob } from '@/lib/mobile/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface MobileKidsMineItem {
  id: string;
  firstName: string;
  shirtNumber: number | null;
  photoUrl: string | null;
  ageYears: number | null;
  gradeLabel: string | null;
  roleForViewer: 'monthly' | 'holder';
  unreadUpdatesCount: number;
  lastUpdatePreview: string | null;
}

export interface MobileKidsMineResponse {
  kids: MobileKidsMineItem[];
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/mobile/v1/kids/mine';
  logger.apiRequest(method, path);

  // TODO(auth-agent): once the mobile JWT verifier lands, this stays
  // exactly as-is — the helper resolves to { userId, email } either way.
  const viewer = await requireMobileAuth(request);

  const rows = await getMobileMineKidsForEmail(viewer.email);

  // Latest update per kid. Sequential because the sponsor rarely has
  // more than a handful of kids and the per-kid query is cheap; if the
  // /me digest ever needs to fan-out to 100 kids at once, batch this.
  const items: MobileKidsMineItem[] = [];
  for (const r of rows) {
    if (!r.childRecordId) continue;
    const monthly = Number(r.monthlyAmount ?? 0);
    const roleForViewer: 'monthly' | 'holder' =
      r.status === 'Active' && monthly > 0 ? 'monthly' : 'holder';

    let lastUpdatePreview: string | null = null;
    if (r.childIdLegacy) {
      try {
        const latest = await getLatestUpdateForChild({
          id: r.childRecordId,
          childId: r.childIdLegacy,
        });
        lastUpdatePreview = latest?.title ?? null;
      } catch {
        // Non-fatal — the digest line is optional. The kid card still
        // renders without a preview.
        lastUpdatePreview = null;
      }
    }

    items.push({
      id: r.childRecordId,
      firstName: r.firstName ?? r.displayName?.split(' ')[0] ?? 'them',
      shirtNumber: r.shirtNumber ?? null,
      photoUrl: r.profilePhotoUrl ?? null,
      ageYears: ageYearsFromDob(r.dateOfBirth),
      gradeLabel: sponsorGradeLabel(r.gradeClass),
      roleForViewer,
      // Placeholder until the read-state table exists. The web /me
      // computes unread via a cookie-persisted last-seen map; mobile
      // will do the equivalent server-side once the schema lands.
      unreadUpdatesCount: 0,
      lastUpdatePreview,
    });
  }

  logger.apiResponse(method, path, 200);
  const body: MobileKidsMineResponse = { kids: items };
  return createSuccessResponse(body);
}

export const GET = withErrorHandling(
  handler,
  'GET',
  '/api/mobile/v1/kids/mine'
);
