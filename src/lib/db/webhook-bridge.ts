/**
 * Stripe webhook → Postgres bridge.
 *
 * This module exists for the dual-write window: every event the
 * Stripe webhook handles in Airtable also writes to Postgres
 * through here. Once we cut Airtable off, the Airtable branches in
 * /api/webhooks/stripe/route.ts get deleted and these mirror calls
 * become the only writes.
 *
 * Design rules:
 *
 *   - Every exported function is wrapped at the call site with
 *     `mirrorToPostgres(...)` (below), which catches and logs all
 *     errors. A Postgres failure can never break the Airtable write
 *     or the user&rsquo;s Stripe receipt.
 *
 *   - Idempotency is the contract of every mutation in
 *     `mutations.ts` — Stripe retries the webhook on non-2xx, and we
 *     retry within our handlers, so every mirror call must be a no-op
 *     on the second run. The mutations enforce this via natural-key
 *     dedupe (stripe_payment_intent_id, stripe_subscription_id,
 *     email lowered, etc.).
 *
 *   - We mirror only the priority-1 tables — Donors, Donations,
 *     Sponsorships, Subscriptions. Fulfillment and Communications
 *     wait until the cut-over because they&rsquo;re recoverable from
 *     other sources (admin email, SendGrid logs) and add surface
 *     area without adding revenue protection.
 *
 *   - The bridge re-resolves the donor inside each function by email
 *     rather than accepting a donor id. This makes the bridge
 *     self-contained — callers don&rsquo;t need to know about Postgres
 *     UUIDs — and tolerant of out-of-order events (donor.created
 *     hasn&rsquo;t run yet? we&rsquo;ll find or insert it ourselves).
 */

import {
  cancelSponsorshipsBySubscription,
  createSponsorship,
  markDonationRefunded,
  recordDonation,
  upsertDonorByEmail,
  upsertSubscription,
  type RecordDonationInput,
  type UpsertDonorInput,
  type UpsertSubscriptionInput,
} from './mutations';
import { db } from './client';
import { children, donors, sponsorships } from './schema';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Universal wrapper. Use at every call site:
 *
 *   await mirrorToPostgres('checkout.session.completed standard',
 *     () => mirrorStandardDonation({ ... }));
 *
 * The label is for log clarity; it shows up in failure traces so we
 * can grep Vercel logs for any branch that&rsquo;s consistently failing.
 * Returns the mirror function&rsquo;s return value on success, undefined
 * on failure (caller can ignore — Airtable write already happened).
 */
export async function mirrorToPostgres<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    const result = await fn();
    console.log(`[pg-mirror] ✓ ${label}`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pg-mirror] ✗ ${label}: ${msg}`);
    return undefined;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

async function findChildByLegacyId(legacyId: string | null | undefined) {
  if (!legacyId) return null;
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.childId, legacyId))
    .limit(1);
  return rows[0] ?? null;
}

async function findChildByShirtNumber(shirtNumber: number | null | undefined) {
  if (shirtNumber == null) return null;
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.shirtNumber, shirtNumber))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Standard donation (one-time, /donate page, etc.) ────────────

export interface MirrorDonationArgs {
  donor: UpsertDonorInput;
  donation: Omit<RecordDonationInput, 'donorId' | 'designatedToChildIds'>;
  designatedChildLegacyId?: string | null; // Airtable ChildID, e.g. "HSP/BAN-005"
}

/**
 * Used by every checkout.session.completed branch that produces a
 * Donation row: standard donation, shirt order, shirt+monthly,
 * sponsorship, cart, portal repeat, gift, merch.
 *
 * Returns the donor and donation rows for caller-side correlation.
 */
export async function mirrorDonation(args: MirrorDonationArgs) {
  const donor = await upsertDonorByEmail(args.donor);
  const designations: string[] = [];
  if (args.designatedChildLegacyId) {
    const child = await findChildByLegacyId(args.designatedChildLegacyId);
    if (child) designations.push(child.id);
  }
  const donation = await recordDonation({
    ...args.donation,
    donorId: donor.id,
    designatedToChildIds: designations,
  });
  return { donor, donation };
}

// ─── Sponsorship (issued at sponsor checkout) ───────────────────

export interface MirrorSponsorshipArgs {
  sponsorCode: string;
  sponsorEmail: string;
  sponsorName?: string | null;
  monthlyAmount: number;
  // The child this sponsorship attaches to. Either a legacy ChildID
  // (preferred, comes from Airtable) or null if cart-mode where the
  // sponsor isn&rsquo;t bound to a kid yet.
  childLegacyId?: string | null;
  childDisplayName?: string | null;
  stripeSubscriptionId?: string | null;
  sponsorshipStartDate?: string | null; // YYYY-MM-DD
  // Cart-mode sponsorships from /[N] are revealed immediately because
  // the buyer already saw the kid on the page. Lockbox flow sets
  // false so the front-end can render the unboxing animation.
  revealedNow?: boolean;
}

/**
 * Idempotent on sponsor_code (uniquely indexed). A second call with
 * the same code is a no-op.
 */
export async function mirrorSponsorship(args: MirrorSponsorshipArgs) {
  // Idempotency: skip if the sponsor_code already exists.
  const existing = await db
    .select({ id: sponsorships.id })
    .from(sponsorships)
    .where(eq(sponsorships.sponsorCode, args.sponsorCode))
    .limit(1);
  if (existing[0]) return existing[0];

  // Look up donor by email — if the standard donor upsert ran in the
  // same handler, this is a fast hit. If the events come out of order,
  // create a stub donor here.
  let donor = await db
    .select({ id: donors.id })
    .from(donors)
    .where(sql`lower(${donors.email}) = ${args.sponsorEmail.toLowerCase()}`)
    .limit(1);
  let donorId = donor[0]?.id;
  if (!donorId) {
    const stub = await upsertDonorByEmail({
      email: args.sponsorEmail,
      name: args.sponsorName ?? null,
    });
    donorId = stub.id;
  }

  // Resolve child. If the legacy id doesn&rsquo;t resolve (e.g. cart-mode
  // before assignment, or a kid not yet migrated), insert with NULL
  // child_id — the child_id_legacy text column preserves the intent.
  let childPgId: string | null = null;
  if (args.childLegacyId) {
    const child = await findChildByLegacyId(args.childLegacyId);
    childPgId = child?.id ?? null;
  }

  // Status reflects the relationship reality, not the row template.
  // A sponsorship with monthly_amount = 0 is a Holder (claimed the
  // number, not paying monthly). The kind-derivation in queries.ts
  // already maps Active+0 → 'holder' on the read side, but storing
  // the correct status keeps the database honest for admin views.
  const statusForRow = args.monthlyAmount > 0 ? 'Active' : 'Holder';

  if (!childPgId) {
    // Sponsorships.childId is nullable, but the schema would benefit
    // from at least a legacy id for debugging. Insert with NULL UUID,
    // legacy text preserved.
    return await createSponsorship({
      sponsorCode: args.sponsorCode,
      sponsorEmail: args.sponsorEmail,
      sponsorName: args.sponsorName ?? null,
      childId: null as unknown as string, // schema allows NULL on this FK
      childIdLegacy: args.childLegacyId ?? null,
      childDisplayName: args.childDisplayName ?? null,
      monthlyAmount: args.monthlyAmount,
      status: statusForRow,
      stripeSubscriptionId: args.stripeSubscriptionId ?? null,
      sponsorshipStartDate: args.sponsorshipStartDate ?? null,
      childRevealedAt: args.revealedNow ? new Date() : null,
    });
  }

  return await createSponsorship({
    sponsorCode: args.sponsorCode,
    sponsorEmail: args.sponsorEmail,
    sponsorName: args.sponsorName ?? null,
    childId: childPgId,
    childIdLegacy: args.childLegacyId ?? null,
    childDisplayName: args.childDisplayName ?? null,
    monthlyAmount: args.monthlyAmount,
    status: statusForRow,
    stripeSubscriptionId: args.stripeSubscriptionId ?? null,
    sponsorshipStartDate: args.sponsorshipStartDate ?? null,
    childRevealedAt: args.revealedNow ? new Date() : null,
  });
}

// ─── Subscription shadow ─────────────────────────────────────────

export interface MirrorSubscriptionArgs {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  donorEmail: string;
  status: string;
  amount: number;
  frequency?: 'monthly' | 'yearly';
  startDate?: Date | null;
  currentPeriodEnd?: Date | null;
}

/**
 * Mirrors customer.subscription.{created,updated}. Upserts on
 * stripe_subscription_id (uniquely indexed). Looks up donor by
 * stripe_customer_id first, then email.
 */
export async function mirrorSubscription(args: MirrorSubscriptionArgs) {
  // Resolve donor — prefer stripe_customer_id since it&rsquo;s
  // authoritative; fall back to email.
  let donorRow = await db
    .select({ id: donors.id })
    .from(donors)
    .where(eq(donors.stripeCustomerId, args.stripeCustomerId))
    .limit(1);
  if (!donorRow[0]) {
    donorRow = await db
      .select({ id: donors.id })
      .from(donors)
      .where(sql`lower(${donors.email}) = ${args.donorEmail.toLowerCase()}`)
      .limit(1);
  }
  // If still no donor row, create a stub so the FK isn&rsquo;t lost.
  let donorId = donorRow[0]?.id;
  if (!donorId) {
    const stub = await upsertDonorByEmail({
      email: args.donorEmail,
      stripeCustomerId: args.stripeCustomerId,
    });
    donorId = stub.id;
  }

  const input: UpsertSubscriptionInput = {
    stripeSubscriptionId: args.stripeSubscriptionId,
    donorId,
    status: args.status,
    amount: args.amount,
    frequency: args.frequency,
    startDate: args.startDate
      ? args.startDate.toISOString().slice(0, 10)
      : null,
    currentPeriodEnd: args.currentPeriodEnd
      ? args.currentPeriodEnd.toISOString().slice(0, 10)
      : null,
  };
  return await upsertSubscription(input);
}

// ─── Subscription canceled ───────────────────────────────────────

/**
 * Mirrors customer.subscription.deleted. Flips every sponsorship
 * pointing at the subscription to Cancelled status.
 */
export async function mirrorSubscriptionDeleted(
  stripeSubscriptionId: string
) {
  return await cancelSponsorshipsBySubscription(stripeSubscriptionId);
}

// ─── Charge refunded ─────────────────────────────────────────────

/**
 * Mirrors charge.refunded — partial or full. Idempotent on
 * stripe_payment_intent_id; if the original donation isn&rsquo;t in
 * Postgres yet (race with checkout.session.completed mirror), the
 * mutation returns null and we skip silently.
 */
export async function mirrorRefund(args: {
  stripePaymentIntentId: string;
  partial: boolean;
  refundedAmount?: number;
  refundedAt: Date;
}) {
  return await markDonationRefunded(args);
}

// ─── Gift sponsorship: child assignment ──────────────────────────

/**
 * For gift sponsorships, the recipient&rsquo;s child needs to be tagged
 * with the buyer info. Idempotent — second call updates the same row.
 */
export async function mirrorGiftChildAssignment(args: {
  shirtNumber: number;
  recipientName: string;
  recipientEmail: string;
}) {
  const child = await findChildByShirtNumber(args.shirtNumber);
  if (!child) return null;
  // Only claim the kid if no one&rsquo;s already on it. A gift assignment
  // arriving after a real buyer has already claimed the shirt MUST
  // NOT overwrite the original buyer&rsquo;s identity — that would erase
  // the relationship the brand mechanic depends on. The shirt was
  // already assigned; the gift either arrived too late or to the
  // wrong number, and a human needs to look at it.
  if (child.shirtBuyerEmail || child.shirtBuyerName) {
    console.warn(
      `[pg-mirror] gift child assignment skipped: shirt #${args.shirtNumber} already has buyer ${child.shirtBuyerEmail}`
    );
    return child.id;
  }
  await db
    .update(children)
    .set({
      shirtBuyerName: args.recipientName,
      shirtBuyerEmail: args.recipientEmail,
      shirtAssignedAt: child.shirtAssignedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(children.id, child.id));
  return child.id;
}

// ─── Drip pipeline updates ───────────────────────────────────────

/**
 * Mirrors the donor.drip* field writes that happen alongside each
 * Airtable donor write. Separated from upsertDonorByEmail because
 * drip changes happen on subscription.created too, not just donation.
 */
export async function mirrorDripFields(args: {
  email: string;
  dripPipeline: string;
  dripStage: number;
  dripNextSend: Date;
  dripChildName?: string | null;
  dripShirtNumber?: string | null;
}) {
  await db
    .update(donors)
    .set({
      dripPipeline: args.dripPipeline,
      dripStage: args.dripStage,
      dripNextSend: args.dripNextSend.toISOString().slice(0, 10),
      dripChildName: args.dripChildName ?? null,
      dripShirtNumber: args.dripShirtNumber ?? null,
      updatedAt: new Date(),
    })
    .where(sql`lower(${donors.email}) = ${args.email.toLowerCase()}`);
}

// ─── Re-exports for convenience ──────────────────────────────────

export {
  upsertDonorByEmail,
  recordDonation,
  upsertSubscription,
  createSponsorship,
} from './mutations';
