/**
 * GET /api/mobile/v1/kids/[shirtNumber]
 *
 * Full kid detail for the mobile kid page + reveal screen. Base
 * fields + structured bio + viewer role + per-viewer access flags in
 * one round-trip so the RN screens render without dependent fetches.
 *
 * Resolution goes through the SAME resolver the claim flow uses
 * (src/lib/claim-resolve.ts): canonical numbers (≤53) hit their real
 * children row; cycle numbers (54+) resolve through the Batches table
 * with the hardcoded era math as safety net. Mobile and web can't
 * drift on which kid a number belongs to.
 *
 * Viewer role is PER-NUMBER first: a claimed_shirt_number match on
 * any of the viewer's emails (provider + linked — see
 * src/lib/mobile-viewer.ts) makes them the holder/sponsor of THIS
 * number, which is what gates correspondence. Child-identity matching
 * is the fallback for rows claimed before the per-number backfill.
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
  findSponsorshipForEmailAndClaimedNumber,
  getViewerSponsorshipForChild,
} from '@/lib/db/queries';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages } from '@/lib/db/schema';
import { getViewerEmails } from '@/lib/mobile-viewer';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';
import { sponsorGradeLabel, ageYearsFromDob } from '@/lib/mobile/format';

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
  /** True when the viewer can claim this number right now — nobody
   *  (including them) holds it yet. Drives the reveal screen's
   *  "Keep #N" CTA. */
  canClaim: boolean;
  /**
   * Holder only: whether the letter that came with the shirt is
   * still unsent ('available'), already used ('spent'), or not
   * applicable (null — monthly sponsors write freely, strangers
   * don't write at all). Drives the "your included letter is ready
   * to send" moments in the client.
   */
  freeLetter: 'available' | 'spent' | null;
}

export interface MobileKidResponse {
  reserved: boolean;
  id: string;
  firstName: string;
  shirtNumber: number | null;
  photoUrl: string | null;
  photoUrls: string[];
  ageYears: number | null;
  gradeLabel: string | null;
  /** One human detail for the reveal screen, composed from the kid's
   *  "loves" field. Null when we don't have one. */
  intro: string | null;
  bio: MobileKidBio;
  viewer: MobileKidViewer;
}

/** Compose the reveal screen's one-line human detail. */
function introFor(firstName: string, loves: string | null): string | null {
  const detail = loves?.trim().replace(/\.+$/, '');
  if (!detail) return null;
  return `${firstName} loves ${detail}.`;
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

  const identity = await resolveShirtNumberForClaim(shirtNumber);
  if (!identity) {
    throw new NotFoundError('Kid not found');
  }
  const child = identity.canonicalRow;

  // Reserved-for-auction kids don't have a profile to surface.
  if (identity.reservedForAuction) {
    logger.apiResponse(method, path, 200);
    return createSuccessResponse({
      reserved: true,
      id: child.id,
      firstName: identity.firstName,
      shirtNumber: shirtNumber,
      photoUrl: null,
      photoUrls: [],
      ageYears: null,
      gradeLabel: null,
      intro: null,
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
        canClaim: false,
        freeLetter: null,
      },
    } satisfies MobileKidResponse);
  }

  // ── Viewer-role resolution ────────────────────────────────────────
  // Per-NUMBER first (claimed_shirt_number is the authoritative
  // ownership column), then child-identity fallback for pre-backfill
  // rows. Both checks run across the viewer's whole email set.
  const emails = await getViewerEmails(viewer);

  let roleForKid: MobileKidViewerRole = 'anonymous';
  let sponsoredSince: string | null = null;
  let matched = false;
  for (const email of emails) {
    const byNumber = await findSponsorshipForEmailAndClaimedNumber(
      email,
      shirtNumber
    );
    if (byNumber) {
      const amount = Number(byNumber.monthlyAmount ?? 0);
      roleForKid =
        byNumber.status === 'Active' && amount > 0 ? 'monthly' : 'holder';
      sponsoredSince = byNumber.sponsorshipStartDate ?? null;
      matched = true;
      if (roleForKid === 'monthly') break;
      continue;
    }
    const summary = await getViewerSponsorshipForChild(email, {
      id: child.id,
      childId: child.childId ?? identity.childIdLegacy,
    });
    if (summary) {
      const kind = summary.kind === 'sponsor' ? 'monthly' : 'holder';
      // Don't demote a monthly found under another email.
      if (roleForKid !== 'monthly') {
        roleForKid = kind;
        sponsoredSince = summary.sponsorshipStartDate ?? null;
      }
      matched = true;
      if (kind === 'monthly') break;
    }
  }

  // Claimability — only meaningful for viewers with no relationship
  // to this number. The claim endpoint re-checks authoritatively; this
  // flag just decides whether the reveal screen offers the CTA.
  let canClaim = false;
  if (!matched) {
    try {
      const { isNumberClaimedOutsideEmails } = await import(
        '@/lib/db/queries'
      );
      const takenByOther = await isNumberClaimedOutsideEmails(
        shirtNumber,
        identity.childUuid ? null : identity.childIdLegacy,
        emails
      );
      canClaim = !takenByOther;
    } catch {
      canClaim = false;
    }
  }

  // Holder free letter — the printed shirt insert promises "a letter
  // to them, and a letter back." A holder who claimed this number gets
  // exactly one letter; spent-ness reads kid_messages directly (any
  // non-declined sponsor_to_kid row from any of the viewer's emails),
  // same source of truth as the thread route and the web notes gate.
  let freeLetter: 'available' | 'spent' | null = null;
  if (roleForKid === 'holder') {
    try {
      const prior = await db
        .select({ id: kidMessages.id })
        .from(kidMessages)
        .where(
          and(
            inArray(sql`lower(${kidMessages.sponsorEmail})`, emails),
            eq(kidMessages.childId, child.id),
            eq(kidMessages.direction, 'sponsor_to_kid'),
            ne(kidMessages.status, 'declined')
          )
        )
        .limit(1);
      freeLetter = prior.length === 0 ? 'available' : 'spent';
    } catch {
      // Fail closed on the WRITE right (no accidental extra letters),
      // open on the read.
      freeLetter = 'spent';
    }
  }

  const canReadNotes = roleForKid === 'monthly' || roleForKid === 'holder';
  const canWriteNotes =
    roleForKid === 'monthly' || freeLetter === 'available';
  const canReadUpdates = roleForKid === 'monthly' || roleForKid === 'holder';

  const ageYears = ageYearsFromDob(child.dateOfBirth);
  const gradeLabel = sponsorGradeLabel(child.gradeClass);

  const bio: MobileKidBio = {
    fullName:
      child.displayName ||
      `${child.firstName ?? 'Child'} ${child.lastInitial ?? ''}`.trim(),
    ageYears,
    gradeLabel,
    // The current schema doesn't carry "favorite class" or "wants to be"
    // as their own columns — the loves + childQuote fields cover that
    // territory. We surface loves as favoriteClass and childQuote as
    // wantsToBe so the mobile UI has predictable slots to render; when
    // dedicated columns land they slot in cleanly.
    favoriteClass: child.loves ?? null,
    wantsToBe: child.childQuote ?? null,
    family: child.familyContext ?? null,
    homeVillage: child.homeVillage ?? null,
    sponsoredSince: sponsoredSince
      ? new Date(sponsoredSince).toISOString()
      : null,
  };

  const responseBody: MobileKidResponse = {
    reserved: false,
    id: child.id,
    firstName: identity.firstName,
    // Always the number the viewer asked about — for cycle numbers the
    // canonical row's own number is a different shirt entirely.
    shirtNumber,
    photoUrl: child.profilePhotoUrl ?? null,
    photoUrls: (child.photoUrls as string[] | null) ?? [],
    ageYears,
    gradeLabel,
    intro: introFor(identity.firstName, child.loves ?? null),
    bio,
    viewer: {
      roleForKid,
      canReadNotes,
      canWriteNotes,
      canReadUpdates,
      canClaim,
      freeLetter,
    },
  };

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(responseBody);
}

export const GET = withErrorHandling(
  handler,
  'GET',
  '/api/mobile/v1/kids/[shirtNumber]'
);
