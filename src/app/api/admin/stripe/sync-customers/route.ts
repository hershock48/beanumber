/**
 * POST /api/admin/stripe/sync-customers
 *
 * Reconciles ALL Stripe customers → Airtable Donors. The existing
 * /api/admin/stripe/sync only walks subscriptions, which means
 * one-time shirt buyers never end up in Donors when the webhook
 * misses them (signature-failure stale endpoint, dropped events,
 * historical sales pre-webhook, etc).
 *
 * This sync is broader: it walks every Stripe Customer that has at
 * least one successful charge, and ensures a Donor row exists for
 * each one. It does NOT create Sponsorships — that's the other
 * sync's job. Use this to backfill the newsletter recipient list,
 * the donor directory, and the drip pipeline.
 *
 * Matching strategy:
 *   1. Donor lookup by Stripe Customer ID. Fallback: by email.
 *      If neither hits, create a new Donor row.
 *   2. Backfill Stripe Customer ID + recurring flag when missing.
 *   3. Track per-customer: shirts purchased? recurring? total cents?
 *
 * Admin only. Idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { verifyAdminToken } from '@/lib/auth';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface AirtableDonor {
  id: string;
  fields: Record<string, unknown>;
}

async function findDonorByStripeCustomer(
  customerId: string
): Promise<AirtableDonor | null> {
  const formula = `{Stripe Customer ID}="${customerId}"`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONORS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] || null;
}

async function findDonorByEmail(email: string): Promise<AirtableDonor | null> {
  const safe = email.replace(/"/g, '\\"').toLowerCase();
  const formula = `LOWER({Email Address})="${safe}"`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONORS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] || null;
}

async function createDonor(input: {
  email: string;
  name: string;
  customerId: string;
  phone?: string;
  recurring: boolean;
}): Promise<AirtableDonor> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONORS_TABLE
  )}`;
  const fields: Record<string, unknown> = {
    'Donor Name': input.name || input.email,
    'Email Address': input.email,
    'Stripe Customer ID': input.customerId,
    'Recurring Supporter': input.recurring,
  };
  if (input.phone) fields['Phone Number'] = input.phone;
  const res = await fetch(url, {
    method: 'POST',
    headers: atHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Donor create failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function updateDonor(
  recordId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONORS_TABLE
  )}/${recordId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: atHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Donor update failed: ${res.status} ${await res.text()}`);
  }
}

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
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json(
      { error: 'Airtable not configured' },
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

  // Walk charges (not customers). Every successful charge tells us
  // someone paid — including guest checkouts that didn't get a
  // Customer record. The Charge's customer field links back when
  // Stripe attached one; the billing_details.email + name give us a
  // recipient even when there's no Customer.
  //
  // Why charges (not paymentIntents): charges have a final paid/
  // refunded state and surface email via billing_details, which is
  // what we have on guest one-tap purchases.
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

        // c.customer is string | Customer | DeletedCustomer | null.
        // Narrow to live Customers only; deleted ones expose almost
        // nothing on the type, and we don't need them.
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
        const name =
          c.billing_details?.name || liveCustomer?.name || '';
        const phone =
          c.billing_details?.phone || liveCustomer?.phone || '';
        // Charges that come from a subscription renewal have an
        // `invoice` field set; the field exists on the Charge object
        // at runtime even when this SDK's types omit it. Cast through
        // unknown to read it without disabling type checking everywhere.
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

  // Upsert each into Donors. Slow but accurate — Donors table is
  // small (dozens) and we want to read-before-write per row to
  // honor any existing manual edits.
  for (const c of byEmail.values()) {
    report.totalRevenueCents += c.totalCents;
    try {
      let donor: AirtableDonor | null = null;
      let donorAction: 'created' | 'matched' | 'updated' = 'matched';

      if (c.customerId) {
        donor = await findDonorByStripeCustomer(c.customerId);
      }
      if (!donor) {
        donor = await findDonorByEmail(c.email);
        if (donor) {
          // Matched by email; backfill Stripe Customer ID if missing.
          const needs: Record<string, unknown> = {};
          if (c.customerId && !donor.fields['Stripe Customer ID']) {
            needs['Stripe Customer ID'] = c.customerId;
          }
          if (c.hasSubscription && !donor.fields['Recurring Supporter']) {
            needs['Recurring Supporter'] = true;
          }
          if (c.phone && !donor.fields['Phone Number']) {
            needs['Phone Number'] = c.phone;
          }
          if (Object.keys(needs).length > 0) {
            await updateDonor(donor.id, needs);
            donorAction = 'updated';
            report.donors.updated += 1;
          } else {
            donorAction = 'matched';
            report.donors.matched += 1;
          }
        } else {
          donor = await createDonor({
            email: c.email,
            name: c.name || c.email,
            customerId: c.customerId || '',
            phone: c.phone || undefined,
            recurring: c.hasSubscription,
          });
          donorAction = 'created';
          report.donors.created += 1;
        }
      } else {
        donorAction = 'matched';
        report.donors.matched += 1;
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

  // Sort rows by total descending so the biggest customers float up.
  report.rows.sort((a, b) => b.totalCents - a.totalCents);

  return NextResponse.json({ ok: true, report });
}
