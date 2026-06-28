/**
 * One-off: backfill market sales from a Stripe CSV export into Postgres.
 *
 * Why this exists
 * ───────────────
 * Until commit 8473530, the Stripe webhook wrote to Airtable BEFORE
 * mirroring to Postgres. When Airtable was quota-blocked during the
 * Marshall farmers market, every market sale's webhook threw inside
 * findOrCreateDonor / upsertDonation BEFORE the Postgres mirror ran,
 * so those sales never landed in donations, donors, or the drip queue.
 * Stripe has them. Postgres doesn't. This script reconciles.
 *
 * Usage
 * ─────
 * Two input modes — Stripe API (preferred, no manual export needed)
 * or CSV file (kept for archival / replay):
 *
 *   # Pull today's payments directly from Stripe (default if no path):
 *     tsx scripts/backfill-market-sales.ts                       # dry-run
 *     tsx scripts/backfill-market-sales.ts --apply               # write
 *
 *   # Pull a custom date range from Stripe (YYYY-MM-DD, inclusive):
 *     tsx scripts/backfill-market-sales.ts --from=2026-06-26 --to=2026-06-27
 *
 *   # Read from a Stripe-exported CSV:
 *     tsx scripts/backfill-market-sales.ts <path-to-csv>
 *     tsx scripts/backfill-market-sales.ts <path-to-csv> --apply
 *
 * What it does, per row
 * ─────────────────────
 *   1. Read the Payment Intent ID from the CSV row.
 *   2. Idempotency: skip if donations.stripe_payment_intent_id already
 *      has it.
 *   3. Hit Stripe API for the full PaymentIntent (so metadata is
 *      authoritative even if the export omitted columns).
 *   4. Find the matching Checkout Session (for session-level metadata
 *      like order_type, sold_in_person, items_json).
 *   5. Upsert donor by lower(email). Set donor_status='Active' for
 *      successful payment, no overwrite of existing fields.
 *   6. Insert donation row (recurring=session.mode==='subscription').
 *   7. If subscription: insert sponsorship row + upsert subscription row.
 *   8. Enroll the donor in the shirt_nurture_inperson drip pipeline
 *      with dripStage=0 and dripNextSend=today+3d (matches the live
 *      webhook's in-person flow at /api/webhooks/stripe/route.ts ~L2576).
 *
 * What it does NOT do
 * ───────────────────
 *   - Does not send any emails. The buyers got their Stripe receipt
 *     when they paid; admin notifications would just be noise on a
 *     backfill. The drip enrollment IS set so the day-0 in-person
 *     email goes out 3 days from today via the existing cron.
 *   - Does not touch Airtable. Postgres-only by design.
 *   - Does not create fulfillment records or assign shirt numbers.
 *     Shirts were handed over at the booth; number assignment happens
 *     organically when the buyer claims at /[N].
 *
 * Cash buyers
 * ───────────
 * Kevin manually entered cash buyers as "new customer" in Stripe and
 * created a $25 charge. Those rows have a customer_email but no
 * order_type / sold_in_person metadata. The script treats any row
 * without an order_type as a single shirt sale, sold_in_person=true,
 * enrolls in shirt_nurture_inperson. That matches what would have
 * happened if they'd checked out via /market.
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/lib/db/client';
import { donations, donors, sponsorships, subscriptions } from '../src/lib/db/schema';
import { recordDonation, upsertDonorByEmail } from '../src/lib/db/mutations';

const APPLY = process.argv.includes('--apply');
const CSV_PATH = process.argv.find(a => a.endsWith('.csv'));
const FROM_FLAG = process.argv.find(a => a.startsWith('--from='));
const TO_FLAG = process.argv.find(a => a.startsWith('--to='));

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function parseDateFlag(flag: string | undefined, fallback: string): string {
  if (!flag) return fallback;
  const v = flag.split('=')[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    console.error(`Invalid date flag: ${flag}. Use YYYY-MM-DD.`);
    process.exit(1);
  }
  return v;
}
const FROM_DATE = parseDateFlag(FROM_FLAG, todayISO());
const TO_DATE = parseDateFlag(TO_FLAG, todayISO());

// If no CSV path supplied, default to Stripe API mode using the date
// range above (today by default).
const USE_STRIPE_API = !CSV_PATH;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY missing. Add it to .env.local.');
  process.exit(1);
}
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' });

const SHIRT_PRICE = 25;

// ─── CSV loading ─────────────────────────────────────────────────

function loadCsvRows(filepath: string): Record<string, string>[] {
  const abs = path.resolve(filepath);
  if (!fs.existsSync(abs)) {
    console.error(`CSV not found: ${abs}`);
    process.exit(1);
  }
  let raw = fs.readFileSync(abs, 'utf-8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM
  return parseCsv(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
}

// Stripe exports vary in column name across export presets. Try the
// common variants in order. Returns the first non-empty value.
function pickField(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = row[c];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

function extractPaymentIntentId(row: Record<string, string>): string {
  // Direct field
  const direct = pickField(row, 'Payment Intent ID', 'PaymentIntent ID', 'payment_intent_id');
  if (direct.startsWith('pi_')) return direct;
  // Sometimes the "id" column on a Payments export is the charge id (ch_)
  // — we'll resolve to PI via Stripe lookup if needed.
  const id = pickField(row, 'id', 'ID');
  return id; // may be ch_ or pi_
}

// ─── Per-row backfill ────────────────────────────────────────────

interface BackfillSummary {
  pi: string;
  email: string;
  amount: number;
  action: 'skip-existing' | 'skip-refunded' | 'skip-failed' | 'skip-no-email' | 'skip-existing-sponsor' | 'would-write' | 'wrote';
  isSubscription: boolean;
  note?: string;
}

async function resolvePaymentIntent(rawId: string): Promise<Stripe.PaymentIntent | null> {
  if (rawId.startsWith('pi_')) {
    try {
      return await stripe.paymentIntents.retrieve(rawId, { expand: ['customer', 'latest_charge'] });
    } catch (err) {
      console.error(`  ! could not retrieve PI ${rawId}: ${(err as Error).message}`);
      return null;
    }
  }
  if (rawId.startsWith('ch_')) {
    try {
      const charge = await stripe.charges.retrieve(rawId);
      if (!charge.payment_intent) return null;
      const piId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent.id;
      return await stripe.paymentIntents.retrieve(piId, { expand: ['customer', 'latest_charge'] });
    } catch (err) {
      console.error(`  ! could not resolve charge ${rawId}: ${(err as Error).message}`);
      return null;
    }
  }
  return null;
}

async function findCheckoutSession(piId: string): Promise<Stripe.Checkout.Session | null> {
  try {
    const list = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 });
    return list.data[0] ?? null;
  } catch {
    return null;
  }
}

async function findCheckoutSessionForSubscription(
  subId: string
): Promise<Stripe.Checkout.Session | null> {
  try {
    const list = await stripe.checkout.sessions.list({ subscription: subId, limit: 1 });
    return list.data[0] ?? null;
  } catch {
    return null;
  }
}

async function processOne(piId: string): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    pi: piId,
    email: '',
    amount: 0,
    action: 'would-write',
    isSubscription: false,
  };

  // Idempotency
  const existing = await db
    .select({ id: donations.id })
    .from(donations)
    .where(eq(donations.stripePaymentIntentId, piId))
    .limit(1);
  if (existing[0]) {
    summary.action = 'skip-existing';
    summary.note = `donations row ${existing[0].id} already present`;
    return summary;
  }

  const pi = await resolvePaymentIntent(piId);
  if (!pi) {
    summary.action = 'skip-failed';
    summary.note = 'could not resolve from Stripe API';
    return summary;
  }
  // Use the canonical PI id from Stripe (in case input was a charge id)
  summary.pi = pi.id;

  if (pi.status !== 'succeeded') {
    summary.action = 'skip-failed';
    summary.note = `pi.status=${pi.status}`;
    return summary;
  }
  // Re-check idempotency with the canonical id (charge→pi resolution
  // could have produced a different value than the CSV row's id column)
  if (pi.id !== piId) {
    const existing2 = await db
      .select({ id: donations.id })
      .from(donations)
      .where(eq(donations.stripePaymentIntentId, pi.id))
      .limit(1);
    if (existing2[0]) {
      summary.action = 'skip-existing';
      summary.note = `donations row ${existing2[0].id} already present (resolved from ${piId})`;
      return summary;
    }
  }

  const amount = (pi.amount_received || pi.amount || 0) / 100;
  summary.amount = amount;

  // ── EXISTING-SPONSOR GUARD ─────────────────────────────────────
  // If the customer behind this PI already has an active subscription
  // that PRE-DATES this PI's date, they're an existing sponsor — not a
  // fresh shirt buyer. Enrolling them in the shirt-nurture drip would
  // send "your shirt is in your hands, meet your kid" to someone who
  // already has their shirt and already knows their kid. The 6/28
  // backfill bit on this: 8 existing monthly sponsors got wrongly
  // enrolled. Skip them entirely here — Kevin can address those
  // separately if he wants to record the additional payment.
  const piCustomerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
  if (piCustomerId && pi.invoice == null) {
    try {
      const subs = await stripe.subscriptions.list({ customer: piCustomerId, status: 'all', limit: 10 });
      const preexisting = subs.data.find(s => {
        if (s.status !== 'active' && s.status !== 'trialing') return false;
        return s.start_date < pi.created;
      });
      if (preexisting) {
        summary.action = 'skip-existing-sponsor';
        summary.note = `customer already has active sub ${preexisting.id} (started ${new Date(preexisting.start_date * 1000).toISOString().slice(0, 10)}) — not a fresh shirt buyer`;
        return summary;
      }
    } catch (err) {
      // Fail-open: if Stripe sub lookup fails, fall through and treat
      // as a regular shirt order. The script is dry-run by default so
      // operator can catch any oddities before --apply.
      console.warn(`  ! sponsor-check failed for ${pi.id}: ${(err as Error).message}`);
    }
  }

  // Pull session for metadata (preferred over PI-level metadata since
  // /market routes set order_type / sold_in_person / items_json at the
  // session level).
  const session = await findCheckoutSession(pi.id);
  const sessionMeta = session?.metadata ?? {};
  const piMeta = pi.metadata ?? {};
  const meta: Record<string, string> = { ...piMeta, ...sessionMeta };

  // Refunds — let them through to donations as Refunded; webhook will
  // catch them in real time too. Most useful for completeness.
  const latestCharge = pi.latest_charge as Stripe.Charge | string | null;
  const chargeObj = typeof latestCharge === 'string' || !latestCharge ? null : latestCharge;
  const amountRefunded = (chargeObj?.amount_refunded ?? 0) / 100;
  const status = amountRefunded > 0 ? 'Refunded' : 'Succeeded';

  // Email / name
  const customerObj = typeof pi.customer === 'string' || !pi.customer ? null : pi.customer as Stripe.Customer;
  const email =
    session?.customer_email ||
    session?.customer_details?.email ||
    chargeObj?.billing_details?.email ||
    customerObj?.email ||
    pi.receipt_email ||
    '';
  const name =
    session?.customer_details?.name ||
    chargeObj?.billing_details?.name ||
    customerObj?.name ||
    'Anonymous';
  summary.email = email || '(none)';

  if (!email) {
    summary.action = 'skip-no-email';
    summary.note = 'no email on PI / session / customer / charge — cannot backfill drip';
    return summary;
  }

  const isSubscription = session?.mode === 'subscription';
  summary.isSubscription = isSubscription;

  const orderType = meta.order_type || (isSubscription ? 'shirt_plus_monthly' : 'shirt');
  const soldInPerson = (meta.sold_in_person === 'true') || !meta.order_type;
  const dripPipeline = soldInPerson ? 'shirt_nurture_inperson' : 'shirt_nurture';

  const donationSource = orderType === 'cart' ? 'Shirt Order'
    : orderType === 'shirt_plus_monthly' ? 'Shirt + Monthly'
    : orderType === 'shirt' ? 'Shirt Order'
    : 'Website';

  const created = new Date(pi.created * 1000);
  const donationDate = created.toISOString().slice(0, 10);

  if (!APPLY) {
    summary.action = 'would-write';
    summary.note = `email=${email} name=${name} amount=$${amount} subscription=${isSubscription} drip=${dripPipeline} source=${donationSource}`;
    return summary;
  }

  // ─── Real writes from here down ──────────────────────────────

  // 1. Donor (idempotent on lower(email)). upsertDonorByEmail preserves
  //    existing fields — passing undefined leaves them alone.
  const donor = await upsertDonorByEmail({
    email,
    name,
    phoneNumber: session?.customer_details?.phone || chargeObj?.billing_details?.phone || null,
    stripeCustomerId: typeof pi.customer === 'string' ? pi.customer : customerObj?.id ?? null,
    donorStatus: 'Active',
    notes: `Backfilled from Marshall market sale ${pi.id} on ${new Date().toISOString().slice(0, 10)}`,
  });

  // 2. Donation
  await recordDonation({
    donorId: donor.id,
    donationAmount: amount,
    currency: pi.currency || 'usd',
    donationSource,
    paymentStatus: status,
    recurringDonation: isSubscription,
    stripePaymentIntentId: pi.id,
    stripeCheckoutSessionId: session?.id ?? null,
    stripeCustomerId: typeof pi.customer === 'string' ? pi.customer : customerObj?.id ?? null,
    donorEmailAtDonation: email,
    donationDate,
    donationNote: `Market backfill — ${meta.shirt_color || meta.items_json || 'unknown'} / ${meta.shirt_size || ''} / sold_at=${meta.sold_at || 'farmers_market'}`,
  });

  // 3. Subscription + sponsorship (only if monthly)
  if (isSubscription && session?.subscription) {
    const subId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      const periodStart = new Date(((sub as any).current_period_start || pi.created) * 1000).toISOString().slice(0, 10);
      // Subscription shadow row. Schema uses `amount` (not monthlyAmount),
      // no currency column. Frequency defaults to 'monthly'.
      await db
        .insert(subscriptions)
        .values({
          stripeSubscriptionId: sub.id,
          donorId: donor.id,
          status: sub.status,
          amount: String(SHIRT_PRICE),
          startDate: new Date(sub.start_date * 1000).toISOString().slice(0, 10),
        })
        .onConflictDoNothing();

      // Sponsorship row. sponsor_code uses the subscription id as a
      // stable, unique key (mirrors how the webhook does it on the cart
      // path when no per-item code is set). No donor_id FK in this
      // table — the join goes through sponsor_email.
      const sponsorCode = `MARKET-${sub.id.slice(-8).toUpperCase()}`;
      const existingSp = await db
        .select({ id: sponsorships.id })
        .from(sponsorships)
        .where(eq(sponsorships.sponsorCode, sponsorCode))
        .limit(1);
      if (!existingSp[0]) {
        await db.insert(sponsorships).values({
          sponsorCode,
          sponsorEmail: email,
          sponsorName: name,
          stripeSubscriptionId: sub.id,
          monthlyAmount: String(SHIRT_PRICE),
          sponsorshipStartDate: periodStart,
          status: 'Active',
          // childId stays null — sponsorship is bound to the donor via
          // sponsor_email. Child link created when buyer claims at /[N].
        });
      }
    } catch (err) {
      console.error(`  ! subscription record skipped (non-fatal): ${(err as Error).message}`);
    }
  }

  // 4. Drip enrollment — 3-day delay matches in-person variant from
  //    /api/webhooks/stripe/route.ts line ~2576.
  const dripNextSend = new Date();
  dripNextSend.setDate(dripNextSend.getDate() + 3);
  await db
    .update(donors)
    .set({
      dripPipeline,
      dripStage: 0,
      dripNextSend: dripNextSend.toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(donors.id, donor.id));

  summary.action = 'wrote';
  summary.note = `donor=${donor.id} drip=${dripPipeline} subscription=${isSubscription}`;
  return summary;
}

// ─── Stripe API fetch (no CSV needed) ────────────────────────────
//
// Pulls every successful PaymentIntent in the date range. Paginates
// until exhausted. Local midnight semantics: from = 00:00:00 on
// FROM_DATE, to = 23:59:59 on TO_DATE, machine timezone.
async function fetchPaymentIntentIdsFromStripe(): Promise<string[]> {
  const fromTs = Math.floor(new Date(FROM_DATE + 'T00:00:00').getTime() / 1000);
  const toTs = Math.floor(new Date(TO_DATE + 'T23:59:59').getTime() / 1000);
  const ids: string[] = [];
  let starting_after: string | undefined;
  for (;;) {
    const page = await stripe.paymentIntents.list({
      created: { gte: fromTs, lte: toTs },
      limit: 100,
      starting_after,
    });
    for (const pi of page.data) {
      if (pi.status === 'succeeded') ids.push(pi.id);
    }
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1]?.id;
    if (!starting_after) break;
  }
  return ids;
}

// ─── Driver ──────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write to Postgres)' : 'DRY RUN (no writes)'}`);

  let ids: string[];
  if (USE_STRIPE_API) {
    console.log(`Source: Stripe API, payments from ${FROM_DATE} to ${TO_DATE} (local time)\n`);
    ids = await fetchPaymentIntentIdsFromStripe();
    console.log(`Found ${ids.length} succeeded PaymentIntents in that range.\n`);
  } else {
    console.log(`Source: CSV at ${CSV_PATH}\n`);
    const rows = loadCsvRows(CSV_PATH!);
    console.log(`Loaded ${rows.length} CSV rows.`);
    ids = Array.from(new Set(
      rows.map(r => extractPaymentIntentId(r)).filter(id => id && (id.startsWith('pi_') || id.startsWith('ch_')))
    ));
    console.log(`Found ${ids.length} unique payment ids.\n`);
  }

  const results: BackfillSummary[] = [];
  for (const id of ids) {
    process.stdout.write(`  ${id}: `);
    const r = await processOne(id);
    process.stdout.write(`${r.action}${r.note ? ' (' + r.note + ')' : ''}\n`);
    results.push(r);
  }

  console.log('\n─── Summary ─────────────────────────────────');
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.action] = (counts[r.action] || 0) + 1;
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  const writable = results.filter(r => r.action === 'would-write').length;
  const wrote = results.filter(r => r.action === 'wrote').length;
  if (!APPLY && writable > 0) {
    console.log(`\nRe-run with --apply to write ${writable} new donations to Postgres.`);
  }
  if (APPLY) {
    console.log(`\n✓ Wrote ${wrote} new donations.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
