/**
 * POST /api/admin/stripe/sync
 *
 * Reconciles Stripe → Airtable. For every active (and trialing /
 * past_due) Stripe subscription, ensures there's a Donor + a
 * Sponsorship record that matches. Returns a detailed report so
 * Kevin can see exactly what was created vs. already in sync.
 *
 * This is a backfill tool. Going forward the Stripe webhook keeps
 * everything in sync — but subs that predate the webhook handler
 * never got Airtable rows. Running this once fixes that.
 *
 * Matching strategy:
 *   1. Donor lookup by Stripe Customer ID. Fallback: by email.
 *      If neither hits, create a new Donor row.
 *   2. Sponsorship lookup by StripeSubscriptionID. If not found,
 *      try to claim an existing Active-or-Pending Sponsorship for
 *      this donor that doesn't yet have a subscription ID linked
 *      (legacy backfill case). Otherwise, create a fresh row with
 *      Status=Active.
 *   3. Always upsert: Status, MonthlyAmount, Donor link, sub ID,
 *      sponsor email/name from Stripe customer.
 *   4. If subscription metadata includes a child_record_id and the
 *      Sponsorship has no Children linked, link the kid too.
 *
 * Admin-only auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { verifyAdminToken } from '@/lib/auth';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface AirtableRecord<F = Record<string, unknown>> {
  id: string;
  fields: F;
}

async function findDonorByStripeCustomer(
  customerId: string
): Promise<AirtableRecord | null> {
  const formula = `{Stripe Customer ID}="${customerId}"`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONORS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] || null;
}

async function findDonorByEmail(email: string): Promise<AirtableRecord | null> {
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
}): Promise<AirtableRecord> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONORS_TABLE
  )}`;
  const fields: Record<string, unknown> = {
    'Donor Name': input.name || input.email,
    'Email Address': input.email,
    'Stripe Customer ID': input.customerId,
    'Recurring Supporter': true,
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

async function findSponsorshipBySubscriptionId(
  subId: string
): Promise<AirtableRecord | null> {
  const formula = `{StripeSubscriptionID}="${subId}"`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] || null;
}

async function findClaimableSponsorshipForDonor(
  donorId: string,
  sponsorEmail: string
): Promise<AirtableRecord | null> {
  // Active or Pending Review row for this donor that has NO Stripe
  // subscription ID linked yet. Indicates a legacy sponsorship we
  // can adopt rather than creating a duplicate.
  //
  // We check TWO matching paths:
  //   (a) Donor link contains donorId. Standard case for rows the
  //       webhook wrote.
  //   (b) SponsorEmail matches AND Donor link is empty. Catches
  //       manually-created legacy rows (e.g. Kevin staging a
  //       sponsorship before the buyer subscribed via Stripe) that
  //       never got their Donor link populated.
  //
  // Either path is sufficient; we OR them together. Without (b),
  // running the sync produces duplicate Sponsorship rows every
  // time a customer with a manual stub gets a real Stripe sub.
  const safeEmail = sponsorEmail.replace(/"/g, '\\"');
  const formula = `AND(
    OR(
      FIND("${donorId}", ARRAYJOIN({Donor}))>0,
      AND(
        LOWER({SponsorEmail})="${safeEmail.toLowerCase()}",
        ARRAYJOIN({Donor})=""
      )
    ),
    OR({Status}="Active", {Status}="Pending Review"),
    {StripeSubscriptionID}=""
  )`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula.replace(/\s+/g, ' '))}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] || null;
}

function generateSponsorCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900 + 100); // 3 digits
  return `BAN-${year}-${rand}`;
}

async function createSponsorship(input: {
  donorId: string;
  subId: string;
  sponsorEmail: string;
  sponsorName: string;
  monthlyAmount: number;
  startDate: string;
  childRecordId?: string;
}): Promise<AirtableRecord> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}`;
  const fields: Record<string, unknown> = {
    SponsorCode: generateSponsorCode(),
    SponsorEmail: input.sponsorEmail,
    SponsorName: input.sponsorName,
    Status: 'Active',
    AuthStatus: 'Active',
    VisibleToSponsor: true,
    SponsorshipStartDate: input.startDate,
    Donor: [input.donorId],
    MonthlyAmount: input.monthlyAmount,
    StripeSubscriptionID: input.subId,
  };
  if (input.childRecordId) fields.Children = [input.childRecordId];
  const res = await fetch(url, {
    method: 'POST',
    headers: atHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Sponsorship create failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function updateSponsorship(
  recordId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}/${recordId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: atHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Sponsorship update failed: ${res.status} ${await res.text()}`);
  }
}

/** Map Stripe subscription status → Airtable Sponsorship Status. */
function mapStatus(stripeStatus: string): 'Active' | 'Cancelled' | null {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return 'Active';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'Cancelled';
    default:
      return null; // skip unknown / incomplete / paused
  }
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

  // Pull every subscription (all statuses) — paginated.
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

    // 1. Donor
    let donor = await findDonorByStripeCustomer(customerId);
    let donorAction: 'created' | 'matched';
    if (donor) {
      donorAction = 'matched';
      report.donors.matched++;
    } else {
      // Try email match (legacy donor row without Stripe Customer ID set).
      donor = await findDonorByEmail(customerEmail);
      if (donor) {
        donorAction = 'matched';
        report.donors.matched++;
        // Backfill the Stripe Customer ID so future syncs are faster.
        if (!donor.fields['Stripe Customer ID']) {
          await updateDonor(donor.id, {
            'Stripe Customer ID': customerId,
            'Recurring Supporter': true,
          });
        }
      } else {
        donor = await createDonor({
          email: customerEmail,
          name: customerName || customerEmail,
          customerId,
          phone: customerPhone || undefined,
        });
        donorAction = 'created';
        report.donors.created++;
      }
    }

    // 2. Sponsorship
    const amount =
      (sub.items.data[0]?.price?.unit_amount || 2500) / 100;
    const startDate = new Date(sub.start_date * 1000)
      .toISOString()
      .split('T')[0];
    const meta = (sub.metadata || {}) as Record<string, string>;
    const childRecordIdFromMeta =
      meta.child_record_id || meta.childRecordId || '';

    let sponsorship = await findSponsorshipBySubscriptionId(sub.id);
    let sponsorshipAction: 'created' | 'updated' | 'claimed';
    if (sponsorship) {
      sponsorshipAction = 'updated';
      report.sponsorships.updated++;
      const patch: Record<string, unknown> = {
        Status: mappedStatus,
        MonthlyAmount: amount,
        SponsorEmail: customerEmail,
      };
      if (customerName && !sponsorship.fields.SponsorName) {
        patch.SponsorName = customerName;
      }
      const existingDonor = (sponsorship.fields.Donor as string[]) || [];
      if (!existingDonor.includes(donor.id)) {
        patch.Donor = [donor.id];
      }
      const existingChildren = (sponsorship.fields.Children as string[]) || [];
      if (childRecordIdFromMeta && existingChildren.length === 0) {
        patch.Children = [childRecordIdFromMeta];
      }
      await updateSponsorship(sponsorship.id, patch);
    } else {
      // Try to claim an existing legacy sponsorship that has no sub ID.
      sponsorship = await findClaimableSponsorshipForDonor(
        donor.id,
        customerEmail
      );
      if (sponsorship) {
        sponsorshipAction = 'claimed';
        report.sponsorships.claimed++;
        const patch: Record<string, unknown> = {
          StripeSubscriptionID: sub.id,
          Status: mappedStatus,
          MonthlyAmount: amount,
          SponsorEmail: customerEmail,
        };
        if (customerName && !sponsorship.fields.SponsorName) {
          patch.SponsorName = customerName;
        }
        // Backfill the Donor link when missing — this is the path
        // (b) claim case (email match, no donor linked yet).
        // Writing the link here makes future syncs hit path (a)
        // directly.
        const existingDonor = (sponsorship.fields.Donor as string[]) || [];
        if (existingDonor.length === 0) {
          patch.Donor = [donor.id];
        }
        const existingChildren = (sponsorship.fields.Children as string[]) || [];
        if (childRecordIdFromMeta && existingChildren.length === 0) {
          patch.Children = [childRecordIdFromMeta];
        }
        await updateSponsorship(sponsorship.id, patch);
      } else {
        await createSponsorship({
          donorId: donor.id,
          subId: sub.id,
          sponsorEmail: customerEmail,
          sponsorName: customerName || customerEmail,
          monthlyAmount: amount,
          startDate,
          childRecordId: childRecordIdFromMeta || undefined,
        });
        sponsorshipAction = 'created';
        report.sponsorships.created++;
      }
    }

    if (mappedStatus === 'Active') {
      emailSet.add(customerEmail.toLowerCase());
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
      hasChild:
        !!childRecordIdFromMeta ||
        ((sponsorship?.fields?.Children as string[])?.length || 0) > 0,
    });
  }

  report.uniqueSponsorEmails = emailSet.size;
  return NextResponse.json({ ok: true, report });
}
