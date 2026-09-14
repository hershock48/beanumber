/**
 * GET /api/rep/dashboard?token=xxx
 *
 * Returns the cohort member's stats, scholarship balance, and cohort
 * leaderboard. Stats are computed live from the donations table by
 * matching "[Ref: code]" in the donation note, then cached on the
 * member row so the leaderboard is one query.
 *
 * "qualifiedSponsorCount" = sponsors who have been active 3+ months.
 * For now the total recurring count stands in, since per-sponsor
 * signup dates are not tracked against the referral yet.
 *
 * Backed by cohort_members in Postgres since 2026-09-14 (was Airtable).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  COHORT_CREDIT_PER_SPONSOR,
  COHORT_DEPOSIT,
  COHORT_SPONSOR_GOAL,
  COHORT_TRIP_COST,
  cacheCohortMemberStats,
  computeCohortRefStats,
  findCohortMemberByToken,
  isMissingCohortTable,
  isTokenExpired,
  listApprovedCohortMembers,
} from '@/lib/cohort-members';

const UNAVAILABLE = {
  error: 'Dashboard service temporarily unavailable. Please try again in a few minutes.',
};

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token required.' }, { status: 400 });
    }

    const member = await findCohortMemberByToken(token);
    if (!member) {
      return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 401 });
    }
    if (isTokenExpired(member)) {
      return NextResponse.json({ error: 'Session expired. Request a new login link.' }, { status: 401 });
    }
    if (member.status !== 'Approved') {
      return NextResponse.json({ error: 'Account not yet approved.' }, { status: 403 });
    }

    const refCode = member.refCode || '';

    let shirtsSold = member.shirtsSold;
    let sponsorCount = member.sponsorCount;
    if (refCode) {
      try {
        const stats = await computeCohortRefStats(refCode);
        shirtsSold = stats.shirtsSold;
        sponsorCount = stats.sponsorCount;
        await cacheCohortMemberStats(member.id, stats);
      } catch (e) {
        // Non-critical: fall back to the cached numbers on the row.
        console.error('[Cohort Dashboard] Stats query failed:', e);
      }
    }

    let cohortLeaderboard: Array<{ name: string; sponsorCount: number; isMe: boolean }> = [];
    try {
      const approved = await listApprovedCohortMembers();
      cohortLeaderboard = approved.map(r => ({
        name: (r.name || 'Anonymous').split(' ')[0],
        sponsorCount: r.id === member.id ? sponsorCount : r.sponsorCount,
        isMe: r.id === member.id,
      }));
      cohortLeaderboard.sort((a, b) => b.sponsorCount - a.sponsorCount);
    } catch (e) {
      console.error('[Cohort Dashboard] Leaderboard query failed:', e);
    }

    const qualifiedSponsorCount = sponsorCount;
    const scholarshipEarned = qualifiedSponsorCount * COHORT_CREDIT_PER_SPONSOR;

    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    return NextResponse.json({
      success: true,
      rep: {
        name: member.name,
        email: member.email,
        refCode,
        school: member.school || '',
        shirtsSold,
        sponsorCount,
        qualifiedSponsorCount,
        childNumber: member.childNumber,
        childName: member.childName,
      },
      progress: {
        sponsorCount,
        qualifiedSponsorCount,
        sponsorGoal: COHORT_SPONSOR_GOAL,
        percentComplete: Math.min(100, Math.round((sponsorCount / COHORT_SPONSOR_GOAL) * 100)),
        shirtsSold,
        scholarshipEarned,
        balanceRemaining: Math.max(0, COHORT_TRIP_COST - COHORT_DEPOSIT - scholarshipEarned),
      },
      referralLink: `${origin}/shirts?ref=${refCode}`,
      cohortLeaderboard,
    });
  } catch (error: unknown) {
    if (isMissingCohortTable(error)) {
      console.error('[Cohort Dashboard] cohort_members table missing. Apply drizzle/0018_cohort_members.sql.');
    } else {
      console.error('[Cohort Dashboard] Failed:', error instanceof Error ? error.message : error);
    }
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }
}
