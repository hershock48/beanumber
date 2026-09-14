/**
 * Founding Cohort members. Backs /rep (apply) and /rep/dashboard
 * (magic-link sign-in, stats, leaderboard).
 *
 * Lived in an Airtable "Reps" table until 2026-09-14. Airtable is
 * retired, so this is the only copy. See drizzle/0018_cohort_members.sql.
 *
 * Stats are computed live from the donations table: every checkout
 * started from a referral link carries "[Ref: <code>]" in the donation
 * note (see the webhook), so a member's shirts sold is the count of
 * those donations and their sponsor count is the recurring subset.
 */

import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from './db/client';
import { cohortMembers, donations } from './db/schema';

export type CohortMember = typeof cohortMembers.$inferSelect;

export const COHORT_SPONSOR_GOAL = 24;
export const COHORT_CREDIT_PER_SPONSOR = 100;
export const COHORT_TRIP_COST = 3000;
export const COHORT_DEPOSIT = 500;

/**
 * True when Postgres reports the table does not exist yet (42P01).
 * The routes turn this into a 503 that names the migration instead of
 * a bare 500, because the migration is applied by hand in Supabase.
 */
export function isMissingCohortTable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    String((err as { code: unknown }).code) === '42P01'
  );
}

export async function findCohortMemberByEmail(email: string) {
  const lowered = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(cohortMembers)
    .where(sql`lower(${cohortMembers.email}) = ${lowered}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findCohortMemberByToken(token: string) {
  if (!token) return null;
  const rows = await db
    .select()
    .from(cohortMembers)
    .where(eq(cohortMembers.authToken, token))
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateCohortMemberInput {
  name: string;
  email: string;
  phone?: string | null;
  school?: string | null;
  organization?: string | null;
  why: string;
  firstFive?: string | null;
  howHeard?: string | null;
  refCode: string;
}

export async function createCohortMember(input: CreateCohortMemberInput) {
  const rows = await db
    .insert(cohortMembers)
    .values({
      name: input.name,
      email: input.email.trim().toLowerCase(),
      phone: input.phone || null,
      school: input.school || null,
      organization: input.organization || null,
      why: input.why,
      firstFive: input.firstFive || null,
      howHeard: input.howHeard || null,
      refCode: input.refCode,
      status: 'Applied',
    })
    .returning();
  return rows[0];
}

export async function setCohortMemberAuthToken(
  id: string,
  token: string,
  expiry: Date
) {
  await db
    .update(cohortMembers)
    .set({ authToken: token, authTokenExpiry: expiry, updatedAt: new Date() })
    .where(eq(cohortMembers.id, id));
}

export async function cacheCohortMemberStats(
  id: string,
  stats: { shirtsSold: number; sponsorCount: number }
) {
  await db
    .update(cohortMembers)
    .set({
      shirtsSold: stats.shirtsSold,
      sponsorCount: stats.sponsorCount,
      updatedAt: new Date(),
    })
    .where(eq(cohortMembers.id, id));
}

/**
 * Live counts for one referral code. Refunded donations are excluded
 * so a chargeback does not keep earning scholarship credit.
 */
export async function computeCohortRefStats(refCode: string) {
  if (!refCode) return { shirtsSold: 0, sponsorCount: 0 };
  const marker = `%[Ref: ${refCode}]%`;
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      recurring: sql<number>`count(*) filter (where ${donations.recurringDonation} = true)::int`,
    })
    .from(donations)
    .where(
      and(
        sql`${donations.donationNote} like ${marker}`,
        ne(donations.paymentStatus, 'Refunded')
      )
    );
  return {
    shirtsSold: rows[0]?.total ?? 0,
    sponsorCount: rows[0]?.recurring ?? 0,
  };
}

export async function listApprovedCohortMembers() {
  return db
    .select({
      id: cohortMembers.id,
      name: cohortMembers.name,
      sponsorCount: cohortMembers.sponsorCount,
    })
    .from(cohortMembers)
    .where(eq(cohortMembers.status, 'Approved'))
    .orderBy(desc(cohortMembers.sponsorCount));
}

/**
 * The shape both /rep API routes return for a signed-in member. Kept
 * identical to the Airtable-era payload so RepDashboardContent.tsx did
 * not need to change.
 */
export function publicCohortMember(m: CohortMember) {
  return {
    name: m.name,
    email: m.email,
    refCode: m.refCode,
    school: m.school || '',
    shirtsSold: m.shirtsSold,
    sponsorCount: m.sponsorCount,
    status: m.status,
    appliedAt: m.appliedAt ? m.appliedAt.toISOString() : '',
    childNumber: m.childNumber,
    childName: m.childName,
  };
}

export function isTokenExpired(m: CohortMember): boolean {
  return !m.authTokenExpiry || m.authTokenExpiry.getTime() < Date.now();
}
