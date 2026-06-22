/**
 * Admin Sponsor Reveal Status API
 *
 * Lists every Active/Holder sponsorship and bins each into "Revealed"
 * or "Waiting to reveal" based on whether childRevealedAt is set.
 *
 * Used for spotting shirts that may have gotten lost in shipping — a
 * "Waiting to reveal" entry sitting >14 days probably means the shirt
 * never showed up.
 *
 * REQUIRES ADMIN AUTH.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { sponsorships, children } from '@/lib/db/schema';
import { and, eq, or, sql } from 'drizzle-orm';

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

function daysBetween(startIso: string | null | undefined, nowMs: number): number | null {
  if (!startIso) return null;
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return null;
  return Math.floor((nowMs - start) / (1000 * 60 * 60 * 24));
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/admin/sponsors/reveal-status';
  logger.apiRequest(method, path);

  requireAdminAuth(request);

  // Mirrors the legacy findAllSponsorsForNewsletter query — every
  // sponsor row that's currently operational. Dual-key kid join (UUID
  // FK OR legacy ChildID).
  const rows = await db
    .select({
      id: sponsorships.id,
      sponsorCode: sponsorships.sponsorCode,
      sponsorName: sponsorships.sponsorName,
      sponsorEmail: sponsorships.sponsorEmail,
      monthlyAmount: sponsorships.monthlyAmount,
      sponsorshipStartDate: sponsorships.sponsorshipStartDate,
      childRevealedAt: sponsorships.childRevealedAt,
      childDisplayNameSnapshot: sponsorships.childDisplayName,
      childIdLegacy: sponsorships.childIdLegacy,
      kidId: sql<string | null>`coalesce(${children.id}, child_legacy.id)`,
      kidDisplayName: sql<string | null>`coalesce(${children.displayName}, child_legacy.display_name)`,
      kidChildId: sql<string | null>`coalesce(${children.childId}, child_legacy.child_id)`,
    })
    .from(sponsorships)
    .leftJoin(children, eq(children.id, sponsorships.childId))
    .leftJoin(
      sql`children as child_legacy`,
      sql`child_legacy.child_id = ${sponsorships.childIdLegacy}`
    )
    .where(
      and(
        or(
          eq(sponsorships.status, 'Active'),
          eq(sponsorships.authStatus, 'Active')
        )
      )
    );

  const nowMs = Date.now();
  const revealed: SponsorSummary[] = [];
  const waiting: SponsorSummary[] = [];

  for (const r of rows) {
    const summary: SponsorSummary = {
      id: r.id,
      sponsorCode: r.sponsorCode || '',
      sponsorName: r.sponsorName || undefined,
      sponsorEmail: r.sponsorEmail || '',
      childDisplayName:
        r.kidDisplayName || r.childDisplayNameSnapshot || '(unknown)',
      childId: r.kidChildId || r.childIdLegacy || '',
      monthlyAmount: r.monthlyAmount ? Number(r.monthlyAmount) : undefined,
      sponsorshipStartDate: r.sponsorshipStartDate || undefined,
      childRevealedAt: r.childRevealedAt
        ? new Date(r.childRevealedAt).toISOString()
        : undefined,
      daysSinceStart: daysBetween(r.sponsorshipStartDate, nowMs),
      daysSinceReveal: r.childRevealedAt
        ? daysBetween(new Date(r.childRevealedAt).toISOString(), nowMs)
        : null,
    };
    if (r.childRevealedAt) revealed.push(summary);
    else waiting.push(summary);
  }

  // Oldest start first — those are most likely to need a check-in nudge.
  waiting.sort((a, b) => {
    const aStart = a.sponsorshipStartDate || '9999';
    const bStart = b.sponsorshipStartDate || '9999';
    return aStart.localeCompare(bStart);
  });
  // Most recent reveal first — easy scan of happy-path activity.
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
      all: rows.length,
    },
  });
}

export const GET = withErrorHandling(handler, 'GET', '/api/admin/sponsors/reveal-status');
