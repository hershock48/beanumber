/**
 * Admin Sponsor Reveal Status API
 *
 * Lists every active sponsorship and bins each into "Revealed" or
 * "Waiting to reveal" based on whether ChildRevealedAt is set.
 *
 * Useful for spotting shirts that may have gotten lost in shipping —
 * if someone has been a "Waiting to reveal" sponsor for >14 days,
 * their shirt probably never showed up.
 *
 * REQUIRES ADMIN AUTH.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { findAllSponsorsForNewsletter } from '@/lib/airtable';

interface SponsorSummary {
  id: string;
  sponsorCode: string;
  sponsorName?: string;
  sponsorEmail: string;
  childDisplayName: string;
  childId: string;
  monthlyAmount?: number;
  sponsorshipStartDate?: string;
  childRevealedAt?: string;
  daysSinceStart: number | null;
  daysSinceReveal: number | null;
}

function daysBetween(startIso: string | undefined, endIso: string): number | null {
  if (!startIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end)) return null;
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/admin/sponsors/reveal-status';
  logger.apiRequest(method, path);

  requireAdminAuth(request);

  // findAllSponsorsForNewsletter is the broader query — AuthStatus=Active
  // OR Status=Active, no VisibleToSponsor gate. Exactly what we want here:
  // we're looking at the operational state of every sponsor, not what they
  // can see in their portal.
  const sponsorships = await findAllSponsorsForNewsletter();

  const nowIso = new Date().toISOString();

  const revealed: SponsorSummary[] = [];
  const waiting: SponsorSummary[] = [];

  for (const record of sponsorships) {
    const f = record.fields;
    const summary: SponsorSummary = {
      id: record.id,
      sponsorCode: f.SponsorCode,
      sponsorName: f.SponsorName,
      sponsorEmail: f.SponsorEmail,
      childDisplayName: f.ChildDisplayName,
      childId: f.ChildID,
      monthlyAmount: f.MonthlyAmount,
      sponsorshipStartDate: f.SponsorshipStartDate,
      childRevealedAt: f.ChildRevealedAt,
      daysSinceStart: daysBetween(f.SponsorshipStartDate, nowIso),
      daysSinceReveal: daysBetween(f.ChildRevealedAt, nowIso),
    };

    if (f.ChildRevealedAt) {
      revealed.push(summary);
    } else {
      waiting.push(summary);
    }
  }

  // Sort waiting list by oldest start date first — those are the ones most
  // likely to have a missing shirt and need a check-in nudge.
  waiting.sort((a, b) => {
    const aStart = a.sponsorshipStartDate || '9999';
    const bStart = b.sponsorshipStartDate || '9999';
    return aStart.localeCompare(bStart);
  });

  // Revealed sorted by most recent reveal first — easier to scan for the
  // happy-path activity without scrolling past your earliest sponsors.
  revealed.sort((a, b) => {
    const aReveal = a.childRevealedAt || '0';
    const bReveal = b.childRevealedAt || '0';
    return bReveal.localeCompare(aReveal);
  });

  logger.info('Loaded sponsor reveal status', {
    revealedCount: revealed.length,
    waitingCount: waiting.length,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse({
    revealed,
    waiting,
    totals: {
      revealed: revealed.length,
      waiting: waiting.length,
      all: sponsorships.length,
    },
  });
}

export const GET = withErrorHandling(
  handler,
  'GET',
  '/api/admin/sponsors/reveal-status'
);
