/**
 * POST /api/admin/stripe/sync-customers
 *
 * Reconciles ALL Stripe customers → Donors (Postgres). Walks every
 * successful Stripe charge and ensures a Donor row exists per buyer
 * email. Backfills Stripe Customer ID on email-matched donors. Does
 * NOT touch Sponsorships — that's /api/admin/stripe/sync.
 *
 * Use for newsletter recipient list, donor directory, drip pipeline.
 *
 * Admin only. Idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { donors } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { upsertDonorByEmail } from '@/lib/db/mutations';

interface CustomerSyncReport {
  stripeCustomersFetched: number;
  customersWithPayments: number;
  customersSkippedNoEmail: number;
  donors: { created: number; matched: number; updated: number };
  totalRevenueCents: number;
  warnings: string[];
  rows: Array<{
    customerId: string;
    email: string;
    name: string;
    totalCents: number;
    chargeCount: number;
    hasSubscription: boolean;
    donorAction: 'created' | 'matched' | 'updated';
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

  const report: CustomerSyncReport = {
    stripeCustomersFetched: 0,
    customersWithPayments: 0,
    customersSkippedNoEmail: 0,
    donors: { created: 0, matched: 0, updated: 0 },
    totalRevenueCents: 0,
    warnings: [],
    rows: [],
  };

  // Walk charges. Each successful, non-refunded charge tells us someone
  // paid — including guest checkouts that didn't get a Customer record.
  // billing_details.email is what we have on guest one-tap purchases.
  type ChargeAccum = {
    email: string;
    name: string;
    customerId: string | null;
    totalCents: number;
    chargeCount: number;
    hasSubscription: boolean;
    phone: string;
  };
  const byEmail = new Map<string, ChargeAccum>();

  try {
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const page = await stripe.charges.list({
        limit: 100,
        starting_after: startingAfter,
      });
      for (const c of page.data) {
        if (c.status !== 'succeeded') continue;
        if (c.refunded) continue;

        const customer = c.customer;
        const liveCustomer:
          | { id: string; email?: string | null; name?: string | null; phone?: string | null }
          | null =
          typeof customer === 'object' && customer && !('deleted' in customer)
            ? (customer as { id: string; email?: string | null; name?: string | null; phone?: string | null })
            : null;
        const customerId =
          typeof customer === 'string'
            ? customer
            : liveCustomer
              ? liveCustomer.id
              : null;
        const email = (
          c.billing_details?.email ||
          liveCustomer?.email ||
          ''
        )
          .trim()
          .toLowerCase();
        if (!email) {
          report.customersSkippedNoEmail += 1;
          continue;
        }
        const name = c.billing_details?.name || liveCustomer?.name || '';
        const phone = c.billing_details?.phone || liveCustomer?.phone || '';
        const invoiceField = (c as unknown as { invoice?: string | null }).invoice;
        const hasSubscription = Boolean(invoiceField);
        const existing = byEmail.get(email);
        if (existing) {
          existing.totalCents += c.amount;
          existing.chargeCount += 1;
          if (hasSubscription) existing.hasSubscription = true;
          if (!existing.customerId && customerId) existing.customerId = customerId;
          if (!existing.name && name) existing.name = name;
          if (!existing.phone && phone) existing.phone = phone;
        } else {
          byEmail.set(email, {
            email,
            name,
            customerId,
            totalCents: c.amount,
            chargeCount: 1,
            hasSubscription,
            phone,
          });
        }
      }
      hasMore = page.has_more;
      startingAfter = page.data[page.data.length - 1]?.id;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: `Stripe charges list failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    );
  }

  report.stripeCustomersFetched = byEmail.size;
  report.customersWithPayments = byEmail.size;

  // Upsert each into Donors (Postgres). The webhook's behavior:
  //   - find donor by lower(email) — case-insensitive match
  //   - if found and customerId is missing, backfill it
  //   - else create a new row
  for (const c of byEmail.values()) {
    report.totalRevenueCents += c.totalCents;
    try {
      const existingRows = await db
        .select()
        .from(donors)
        .where(sql`lower(${donors.email}) = ${c.email}`)
        .limit(1);
      const existing = existingRows[0] || null;

      let donorAction: 'created' | 'matched' | 'updated';
      if (existing) {
        const patch: Record<string, unknown> = {};
        if (c.customerId && !existing.stripeCustomerId) {
          patch.stripeCustomerId = c.customerId;
        }
        if (c.hasSubscription && !existing.recurringSupporter) {
          patch.recurringSupporter = true;
        }
        if (c.phone && !existing.phoneNumber) {
          patch.phoneNumber = c.phone;
        }
        if (c.name && !existing.name) {
          patch.name = c.name;
        }
        if (Object.keys(patch).length > 0) {
          patch.updatedAt = new Date();
          await db.update(donors).set(patch).where(eq(donors.id, existing.id));
          donorAction = 'updated';
          report.donors.updated += 1;
        } else {
          donorAction = 'matched';
          report.donors.matched += 1;
        }
      } else {
        await upsertDonorByEmail({
          email: c.email,
          name: c.name || c.email,
          phoneNumber: c.phone || null,
          stripeCustomerId: c.customerId || null,
        });
        // upsertDonorByEmail doesn't expose a `recurringSupporter`
        // override. Set it on the newly-created row if applicable.
        if (c.hasSubscription) {
          await db
            .update(donors)
            .set({ recurringSupporter: true, updatedAt: new Date() })
            .where(sql`lower(${donors.email}) = ${c.email}`);
        }
        donorAction = 'created';
        report.donors.created += 1;
      }

      report.rows.push({
        customerId: c.customerId || '(none)',
        email: c.email,
        name: c.name || '(no name)',
        totalCents: c.totalCents,
        chargeCount: c.chargeCount,
        hasSubscription: c.hasSubscription,
        donorAction,
      });
    } catch (err) {
      report.warnings.push(
        `Upsert failed for ${c.email}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  report.rows.sort((a, b) => b.totalCents - a.totalCents);

  return NextResponse.json({ ok: true, report });
}
