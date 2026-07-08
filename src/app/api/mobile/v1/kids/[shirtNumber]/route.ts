/**
 * GET /api/mobile/v1/kids/[shirtNumber]
 *
 * Full kid detail for the mobile kid page. Wraps everything the mobile
 * profile view needs — base fields + structured bio + viewer role +
 * per-viewer access flags — in one round-trip so the RN screen can
 * render without a chain of dependent fetches.
 *
 * Cycle-shirt fallback (#67, #100, …) mirrors the web
 * /api/children/[number] endpoint so mobile and web resolve the same
 * kid for the same URL.
 *
 * Auth: mobile bearer. Bio + base fields are returned even for a
 * "cold" viewer (someone signed in but not linked to this kid) — that
 * matches the web /children/[N] rules, where the profile is public and
 * only correspondence + updates are gated.
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
  getViewerSponsorshipForChild,
  isChildClaimedByOtherEmail,
} from '@/lib/db/queries';
import { sponsorGradeLabel, ageYearsFromDob } from '@/lib/mobile/format';
import { canonicalShirtNumber } from '@/lib/mobile/shirt-cycle';
import type { Child } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface MobileKidBio {
  fullName: string;
  ageYears: number | null;
  gradeLabel: string | null;
  favoriteClass: string | null;
  wantsToBe: string | null;
  family: string | null;
  homeVillage: string | null;
  sponsoredSince: string | null;
}

export type MobileKidViewerRole =
  | 'monthly'
  | 'holder'
  | 'otherSponsor'
  | 'anonymous';

export interface MobileKidViewer {
  roleForKid: MobileKidViewerRole;
  canReadNotes: boolean;
  canWriteNotes: boolean;
  canReadUpdates: boolean;
}

export interface MobileKidResponse {
  reserved: boolean;
  id: string;
  firstName: string;
  shirtNumber: number | null;
  photoUrl: string | null;
  photoUrls: string[];
  bio: MobileKidBio;
  viewer: MobileKidViewer;
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ shirtNumber: string }> }
): Promise<NextResponse> {
  const method = 'GET';
  const { shirtNumber: raw } = await context.params;
  const shirtNumber = parseInt(raw, 10);
  const path = `/api/mobile/v1/kids/${raw}`;
  logger.apiRequest(method, path);

  if (isNaN(shirtNumber) || shirtNumber <= 0) {
    throw new ValidationError('Invalid shirt number');
  }

  const viewer = await requireMobileAuth(request);

  // Direct lookup, then cycle-shirt fallback so #67 → its canonical kid.
  let child: Child | null = await getChildByShirtNumber(shirtNumber);
  if (!child) {
    const canonicalNum = canonicalShirtNumber(shirtNumber);
    if (canonicalNum) {
      const canonical = await getChildByShirtNumber(canonicalNum);
      if (canonical) {
        child = {
          ...canonical,
          shirtNumber,
          childId: `HSP/BAN-${String(shirtNumber).padStart(3, '0')}`,
        };
      }
    }
  }
  if (!child) {
    throw new NotFoundError('Kid not found');
  }

  // Reserved-for-auction kids don't have a profile to surface.
  if (child.reservedForAuction) {
    logger.apiResponse(method, path, 200);
    return createSuccessResponse({
      reserved: true,
      id: child.id,
      firstName: child.firstName ?? 'them',
      shirtNumber: shirtNumber,
      photoUrl: null,
      photoUrls: [],
      bio: {
        fullName: '',
        ageYears: null,
        gradeLabel: null,
        favoriteClass: null,
        wantsToBe: null,
        family: null,
        homeVillage: null,
        sponsoredSince: null,
      },
      viewer: {
        roleForKid: 'anonymous',
        canReadNotes: false,
        canWriteNotes: false,
        canReadUpdates: false,
      },
    } satisfies MobileKidResponse);
  }

  // Viewer-role resolution. Mirrors the /children/[N] page's rules —
  // monthly requires Active + monthlyAmount > 0; holder is Active-$0
  // or Holder status; otherSponsor is "this viewer has an Active or
  // Holder sponsorship of ANOTHER kid but not this one"; anonymous is
  // the fallback.
  const summary = await getViewerSponsorshipForChild(viewer.email, {
    id: child.id,
    childId: child.childId,
  });
  let roleForKid: MobileKidViewerRole;
  if (summary?.kind === 'sponsor') {
    roleForKid = 'monthly';
  } else if (summary?.kind === 'holder') {
    roleForKid = 'holder';
  } else {
    // No sponsorship of THIS kid. If they're claimed by anyone else,
    // this viewer is a stranger to this kid — treat as anonymous. We
    // can't tell here whether the viewer sponsors OTHER kids without a
    // second query; the mobile client resolves that via /kids/mine.
    // 'otherSponsor' role is reserved for a future join that surfaces
    // "you sponsor 3 kids but not this one" without an extra fetch.
    const claimedByAnother = await isChildClaimedByOtherEmail(
      { id: child.id, childId: child.childId },
      viewer.email
    );
    roleForKid = claimedByAnother ? 'anonymous' : 'anonymous';
  }

  const canReadNotes = roleForKid === 'monthly';
  const canWriteNotes = roleForKid === 'monthly';
  const canReadUpdates = roleForKid === 'monthly' || roleForKid === 'holder';

  const bio: MobileKidBio = {
    fullName:
      child.displayName ||
      `${child.firstName ?? 'Child'} ${child.lastInitial ?? ''}`.trim(),
    ageYears: ageYearsFromDob(child.dateOfBirth),
    gradeLabel: sponsorGradeLabel(child.gradeClass),
    // The current schema doesn't carry "favorite class" or "wants to be"
    // as their own columns — the loves + childQuote fields cover that
    // territory. We surface loves as favoriteClass and childQuote as
    // wantsToBe so the mobile UI has predictable slots to render; when
    // dedicated columns land they slot in cleanly.
    favoriteClass: child.loves ?? null,
    wantsToBe: child.childQuote ?? null,
    family: child.familyContext ?? null,
    homeVillage: child.homeVillage ?? null,
    sponsoredSince: summary?.sponsorshipStartDate
      ? new Date(summary.sponsorshipStartDate).toISOString()
      : null,
  };

  const responseBody: MobileKidResponse = {
    reserved: false,
    id: child.id,
    firstName: child.firstName ?? 'them',
    shirtNumber: child.shirtNumber ?? shirtNumber,
    photoUrl: child.profilePhotoUrl ?? null,
    photoUrls: (child.photoUrls as string[] | null) ?? [],
    bio,
    viewer: {
      roleForKid,
      canReadNotes,
      canWriteNotes,
      canReadUpdates,
    },
  };

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(responseBody);
}

export const GET = withErrorHandling(
  handler as (request: NextRequest) => Promise<NextResponse>,
  'GET',
  '/api/mobile/v1/kids/[shirtNumber]'
);
