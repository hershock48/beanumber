/**
 * POST /api/admin/stripe/sync
 *
 * Reconciles Stripe → Postgres. For every Stripe subscription (any
 * status), ensures there's a Donor + Sponsorship + Subscription row.
 * Mirrors the webhook's writes so subs that predated the webhook (or
 * that the webhook dropped due to a signature failure) still land in
 * the local store.
 *
 * Matching strategy:
 *   1. Donor lookup by stripe_customer_id. Fallback: lower(email).
 *      If neither hits, create a new Donor row.
 *   2. Sponsorship lookup by stripe_subscription_id. If not found,
 *      try to claim an existing Active/Pending row for this donor
 *      that doesn't yet have a sub linked (legacy backfill case).
 *      Otherwise, create a fresh Active row.
 *   3. Always upsert status, monthly amount, sponsor email/name.
 *   4. If sub.metadata.child_record_id is set and the Sponsorship has
 *      no child linked, link the kid.
 *   5. Mirror the Subscription row as well via upsertSubscription.
 *
 * Admin-only auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { donors, sponsorships, children } from '@/lib/db/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import {
  upsertDonorByEmail,
  createSponsorship,
  upsertSubscription,
} from '@/lib/db/mutations';

/**
 * Map a Stripe subscription `status` to our local Sponsorship status.
 *
 *   active / trialing / past_due   → Active (relationship is real).
 *   incomplete / paused            → Active (card decline or pause;
 *                                    the sponsor still exists, admin
 *                                    needs to see them to act).
 *   canceled / unpaid /
 *     incomplete_expired           → Cancelled (relationship is done).
 *
 * The earlier version returned `null` for `incomplete`/`paused`,
 * which `continue`'d the sync loop and silently dropped those
 * sponsors — they became invisible in the admin UI even though they
 * still existed in Stripe. Surfacing them as Active lets Kevin see
 * them on `/me`-style admin views and chase the card update.
 */
function mapStatus(stripeStatus: string): 'Active' | 'Cancelled' | null {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'incomplete':
    case 'paused':
      return 'Active';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'Cancelled';
    default:
      return null;
  }
}

function generateSponsorCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `BAN-${year}-${rand}`;
}

interface SyncReport {
  stripeSubsFetched: number;
  stripeSubsByStatus: Record<string, number>;
  donors: { created: number; matched: number };
  sponsorships: { created: number; updated: number; claimed: number };
  uniqueSponsorEmails: number;
  warnings: string[];
  rows: Array<{
    subId: string;
    customer: string;
    email: string;
    name: string;
    amount: number;
    status: string;
    donorAction: 'created' | 'matched';
    sponsorshipAction: 'created' | 'updated' | 'claimed';
    hasChild: boolean;
  }>;
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY not configured' },
      { status: 500 }
    );
  }

  const StripeModule = (await import('stripe')).default;
  const stripe = new StripeModule(stripeSecretKey, {
    apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
  });

  const report: SyncReport = {
    stripeSubsFetched: 0,
    stripeSubsByStatus: {},
    donors: { created: 0, matched: 0 },
    sponsorships: { created: 0, updated: 0, claimed: 0 },
    uniqueSponsorEmails: 0,
    warnings: [],
    rows: [],
  };
  const emailSet = new Set<string>();

  let hasMore = true;
  let startingAfter: string | undefined;
  const allSubs: Stripe.Subscription[] = [];
  try {
    while (hasMore) {
      const page = await stripe.subscriptions.list({
        limit: 100,
        starting_after: startingAfter,
        status: 'all',
        expand: ['data.customer'],
      });
      allSubs.push(...page.data);
      hasMore = page.has_more;
      startingAfter = page.data[page.data.length - 1]?.id;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: `Stripe list failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    );
  }

  report.stripeSubsFetched = allSubs.length;
  for (const sub of allSubs) {
    report.stripeSubsByStatus[sub.status] =
      (report.stripeSubsByStatus[sub.status] || 0) + 1;
  }

  for (const sub of allSubs) {
    const mappedStatus = mapStatus(sub.status);
    if (!mappedStatus) continue;

    const customer = sub.customer as Stripe.Customer | string;
    const customerId =
      typeof customer === 'string' ? customer : customer?.id || '';
    const customerEmail =
      typeof customer === 'object' ? customer?.email || '' : '';
    const customerName =
      typeof customer === 'object' ? customer?.name || '' : '';
    const customerPhone =
      typeof customer === 'object' ? customer?.phone || '' : '';

    if (!customerId) {
      report.warnings.push(`Sub ${sub.id} has no customer; skipped.`);
      continue;
    }
    if (!customerEmail) {
      report.warnings.push(
        `Sub ${sub.id} (customer ${customerId}) has no email; skipped.`
      );
      continue;
    }

    try {
      // 1. Donor — find by stripe_customer_id, then by lowered email,
      //    then create.
      const emailLower = customerEmail.toLowerCase();
      let donor =
        (
          await db
            .select()
            .from(donors)
            .where(eq(donors.stripeCustomerId, customerId))
            .limit(1)
        )[0] || null;
      let donorAction: 'created' | 'matched';
      if (donor) {
        donorAction = 'matched';
        report.donors.matched++;
      } else {
        donor =
          (
            await db
              .select()
              .from(donors)
              .where(sql`lower(${donors.email}) = ${emailLower}`)
              .limit(1)
          )[0] || null;
        if (donor) {
          donorAction = 'matched';
          report.donors.matched++;
          // Backfill stripe customer id and recurring flag if missing.
          const patch: Record<string, unknown> = {};
          if (!donor.stripeCustomerId) patch.stripeCustomerId = customerId;
          if (!donor.recurringSupporter) patch.recurringSupporter = true;
          if (Object.keys(patch).length > 0) {
            patch.updatedAt = new Date();
            await db.update(donors).set(patch).where(eq(donors.id, donor.id));
          }
        } else {
          donor = await upsertDonorByEmail({
            email: customerEmail,
            name: customerName || customerEmail,
            phoneNumber: customerPhone || null,
            stripeCustomerId: customerId,
          });
          // upsertDonorByEmail doesn't set recurringSupporter directly;
          // do it post-create.
          await db
            .update(donors)
            .set({ recurringSupporter: true, updatedAt: new Date() })
            .where(eq(donors.id, donor.id));
          donorAction = 'created';
          report.donors.created++;
        }
      }

      // 2. Sponsorship
      const amount = (sub.items.data[0]?.price?.unit_amount || 2500) / 100;
      const startDate = new Date(sub.start_date * 1000).toISOString().slice(0, 10);
      const meta = (sub.metadata || {}) as Record<string, string>;
      const childRecordIdFromMeta =
        meta.child_record_id || meta.childRecordId || '';
      const childIdLegacyFromMeta = meta.child_id || meta.childId || '';

      // Resolve child UUID if only legacy id was supplied.
      let resolvedChildId: string | null = childRecordIdFromMeta || null;
      if (!resolvedChildId && childIdLegacyFromMeta) {
        const c = await db
          .select({ id: children.id })
          .from(children)
          .where(eq(children.childId, childIdLegacyFromMeta))
          .limit(1);
        resolvedChildId = c[0]?.id || null;
      }

      let existingSponsorship =
        (
          await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.stripeSubscriptionId, sub.id))
            .limit(1)
        )[0] || null;

      let sponsorshipAction: 'created' | 'updated' | 'claimed';
      let hasChild = false;
      if (existingSponsorship) {
        sponsorshipAction = 'updated';
        report.sponsorships.updated++;
        const patch: Record<string, unknown> = {
          status: mappedStatus,
          monthlyAmount: String(amount),
          sponsorEmail: customerEmail,
          updatedAt: new Date(),
        };
        if (customerName && !existingSponsorship.sponsorName) {
          patch.sponsorName = customerName;
        }
        if (resolvedChildId && !existingSponsorship.childId) {
          patch.childId = resolvedChildId;
          if (childIdLegacyFromMeta) patch.childIdLegacy = childIdLegacyFromMeta;
        }
        await db
          .update(sponsorships)
          .set(patch)
          .where(eq(sponsorships.id, existingSponsorship.id));
        hasChild = !!(existingSponsorship.childId || resolvedChildId);
      } else {
        // Try to claim a legacy sponsorship that has no sub yet.
        // Path (a): sponsorEmail matches AND no sub linked.
        // We don't have a Donor FK on sponsorships, so we match on
        // email instead.
        const claimable =
          (
            await db
              .select()
              .from(sponsorships)
              .where(
                and(
                  sql`lower(${sponsorships.sponsorEmail}) = ${emailLower}`,
                  or(isNull(sponsorships.stripeSubscriptionId), eq(sponsorships.stripeSubscriptionId, '')),
                  or(eq(sponsorships.status, 'Active'), eq(sponsorships.status, 'New'))
                )
              )
              .limit(1)
          )[0] || null;

        if (claimable) {
          sponsorshipAction = 'claimed';
          report.sponsorships.claimed++;
          const patch: Record<string, unknown> = {
            stripeSubscriptionId: sub.id,
            status: mappedStatus,
            monthlyAmount: String(amount),
            sponsorEmail: customerEmail,
            updatedAt: new Date(),
          };
          if (customerName && !claimable.sponsorName) {
            patch.sponsorName = customerName;
          }
          if (resolvedChildId && !claimable.childId) {
            patch.childId = resolvedChildId;
            if (childIdLegacyFromMeta) patch.childIdLegacy = childIdLegacyFromMeta;
          }
          await db
            .update(sponsorships)
            .set(patch)
            .where(eq(sponsorships.id, claimable.id));
          hasChild = !!(claimable.childId || resolvedChildId);
        } else {
          await createSponsorship({
            sponsorCode: generateSponsorCode(),
            sponsorEmail: customerEmail,
            sponsorName: customerName || customerEmail,
            childId: resolvedChildId || '',
            childIdLegacy: childIdLegacyFromMeta || null,
            monthlyAmount: amount,
            status: 'Active',
            stripeSubscriptionId: sub.id,
            sponsorshipStartDate: startDate,
          });
          sponsorshipAction = 'created';
          report.sponsorships.created++;
          hasChild = !!resolvedChildId;
        }
      }

      // 3. Mirror the Subscription row.
      const currentPeriodEnd = (() => {
        // Stripe SDK types vary across versions — older drops
        // current_period_end at the top level, newer at items[0].
        const top = (sub as unknown as { current_period_end?: number }).current_period_end;
        const item = (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)
          ?.current_period_end;
        const epoch = top || item || null;
        return epoch ? new Date(epoch * 1000).toISOString().slice(0, 10) : null;
      })();
      await upsertSubscription({
        stripeSubscriptionId: sub.id,
        donorId: donor.id,
        status: sub.status,
        amount,
        frequency: 'monthly',
        startDate,
        currentPeriodEnd,
      });

      if (mappedStatus === 'Active') {
        emailSet.add(emailLower);
      }

      report.rows.push({
        subId: sub.id,
        customer: customerId,
        email: customerEmail,
        name: customerName || '(no name)',
        amount,
        status: sub.status,
        donorAction,
        sponsorshipAction,
        hasChild,
      });
    } catch (err) {
      report.warnings.push(
        `Sub ${sub.id} (${customerEmail}) failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  report.uniqueSponsorEmails = emailSet.size;
  return NextResponse.json({ ok: true, report });
}
