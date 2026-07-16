/**
 * GET /api/mobile/v1/kids/mine
 *
 * The signed-in mobile user's "Your kids" list. Returns kids they hold
 * (shirt buyers who claimed a number) plus kids they sponsor monthly.
 *
 * Identity: matches sponsorships on the viewer's EMAIL SET — the
 * provider email they signed in with AND the verified purchase email
 * linked via /api/mobile/v1/link/* (see src/lib/mobile-viewer.ts).
 * Single-email matching was the original build's biggest gap: an
 * Apple-relay sign-in matched nothing and the app looked empty for
 * exactly the people who owned the most.
 *
 * Numbers: per-number claims (claimed_shirt_number) are authoritative.
 * Cycle numbers (54+) have no children row of their own — the row
 * comes back childless from the join and we resolve the canonical kid
 * for display through the same resolver the claim flow uses, so #67's
 * holder sees the same kid on mobile as on web.
 *
 * Auth: mobile bearer (see requireMobileAuth). No cookie fallback.
 * Response: 200 with array; 401 when the bearer is missing/invalid.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import {
  getMobileMineKidsForEmails,
  getLatestUpdateForChild,
} from '@/lib/db/queries';
import { getViewerEmails } from '@/lib/mobile-viewer';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';
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

  const viewer = await requireMobileAuth(request);
  const emails = await getViewerEmails(viewer);

  const rows = await getMobileMineKidsForEmails(emails);

  // Latest update per kid. Sequential because the sponsor rarely has
  // more than a handful of kids and the per-kid query is cheap; if the
  // /me digest ever needs to fan-out to 100 kids at once, batch this.
  const items: MobileKidsMineItem[] = [];
  for (const r of rows) {
    const monthly = Number(r.monthlyAmount ?? 0);
    const roleForViewer: 'monthly' | 'holder' =
      r.status === 'Active' && monthly > 0 ? 'monthly' : 'holder';

    // Display identity. Canonical rows come hydrated from the join.
    // Cycle-number rows (claimed #54+, no children row) resolve their
    // canonical kid here — same math as the web claim + /me surfaces.
    let childRecordId = r.childRecordId;
    let childIdLegacy = r.childIdLegacy;
    let firstName = r.firstName;
    let displayName = r.displayName;
    let photoUrl = r.profilePhotoUrl;
    let gradeClass = r.gradeClass;
    let dateOfBirth: Date | string | null = r.dateOfBirth;
    if (!childRecordId && r.claimedShirtNumber) {
      try {
        const resolved = await resolveShirtNumberForClaim(
          r.claimedShirtNumber
        );
        const canonical = resolved?.canonicalRow;
        if (canonical) {
          childRecordId = canonical.id;
          childIdLegacy = canonical.childId;
          firstName = canonical.firstName;
          displayName = canonical.displayName;
          photoUrl = canonical.profilePhotoUrl;
          gradeClass = canonical.gradeClass;
          dateOfBirth = canonical.dateOfBirth;
        }
      } catch {
        // Non-fatal — the row renders numberless-kid-less below and
        // gets skipped, same as before resolution existed.
      }
    }

    if (!childRecordId) continue; // truly childless (unclaimed checkout row)

    let lastUpdatePreview: string | null = null;
    if (childIdLegacy) {
      try {
        const latest = await getLatestUpdateForChild({
          id: childRecordId,
          childId: childIdLegacy,
        });
        lastUpdatePreview = latest?.title ?? null;
      } catch {
        // Non-fatal — the digest line is optional. The kid card still
        // renders without a preview.
        lastUpdatePreview = null;
      }
    }

    items.push({
      id: childRecordId,
      firstName: firstName ?? displayName?.split(' ')[0] ?? 'them',
      shirtNumber: r.shirtNumber ?? null,
      photoUrl: photoUrl ?? null,
      ageYears: ageYearsFromDob(dateOfBirth),
      gradeLabel: sponsorGradeLabel(gradeClass),
      roleForViewer,
      // Placeholder until the read-state table exists. The web /me
      // computes unread via a cookie-persisted last-seen map; mobile
      // will do the equivalent server-side once the schema lands.
      unreadUpdatesCount: 0,
      lastUpdatePreview,
    });
  }

  // Dedupe: with two emails in the set, the same kid can arrive on
  // two rows (e.g. holder row on the purchase email + co-sponsor row
  // on the provider email). One card per (kid, number) pair; monthly
  // beats holder when both exist.
  const seen = new Map<string, MobileKidsMineItem>();
  for (const item of items) {
    const key = `${item.id}:${item.shirtNumber ?? 'none'}`;
    const prior = seen.get(key);
    if (!prior || (prior.roleForViewer === 'holder' && item.roleForViewer === 'monthly')) {
      seen.set(key, item);
    }
  }
  const deduped = Array.from(seen.values());

  logger.apiResponse(method, path, 200);
  const body: MobileKidsMineResponse = { kids: deduped };
  return createSuccessResponse(body);
}

export const GET = withErrorHandling(
  handler,
  'GET',
  '/api/mobile/v1/kids/mine'
);
