/**
 * Typed mutation helpers — the write side of the data-access layer.
 *
 * Everything that creates or updates a row goes through here. The
 * Stripe webhook, the newsletter sender, the admin tools, and the
 * scheduled jobs all import from this file. Pages should not write
 * directly; route through a server action that calls one of these.
 *
 * Conventions:
 *   - Every mutation returns the affected row(s) so the caller can
 *     log / react / cascade without a second round-trip.
 *   - Idempotency: upsert helpers use natural-key lookups (email for
 *     donors, stripe_subscription_id for subscriptions, etc.) so
 *     webhook retries don&rsquo;t double-write.
 *   - Audit log: every mutation writes a row to audit_log via the
 *     `audit()` helper so we have a paper trail from day one.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from './client';
import {
  auditLog,
  children,
  donations,
  donationChildren,
  donors,
  sponsorships,
  subscriptions,
} from './schema';

// ─── Audit ──────────────────────────────────────────────────────

type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';
type AuditActorType = 'admin' | 'system' | 'webhook' | 'sponsor' | 'migration';

interface AuditArgs {
  table: string;
  recordId: string;
  action: AuditAction;
  actorType?: AuditActorType;
  actorId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Diffs before/after and writes a compact changed_fields jsonb.
 * Falls back to a full snapshot for inserts. Failures are logged but
 * never thrown — audit must not break the underlying write.
 */
async function audit(args: AuditArgs) {
  try {
    const changed = computeChangedFields(args.before, args.after);
    await db.insert(auditLog).values({
      tableName: args.table,
      recordId: args.recordId,
      action: args.action,
      changedFields: changed,
      actorId: args.actorId ?? null,
      actorType: args.actorType ?? 'system',
    });
  } catch (err) {
    console.error('[audit] failed to write audit row', err);
  }
}

/**
 * Audit-log diff between two row snapshots.
 *
 * Pitfalls handled:
 *   - `Object.is(new Date(t), new Date(t))` is always false. Naive
 *     diff flagged every UPDATE as having changed `createdAt` and
 *     `updatedAt` — turning the audit jsonb into noise. We compare
 *     Date instances by their numeric time.
 *   - `updatedAt` always changes by design (every mutation bumps it
 *     to `new Date()`); recording it as a diff entry is pure noise.
 *     Excluded.
 *   - JSON.stringify chokes on `bigint` and silently drops
 *     `undefined`. The driver never returns bigints from these
 *     tables (numerics come back as strings), so the practical risk
 *     is low; still, we coerce-stringify defensively at the JSON
 *     boundary so a future column doesn&rsquo;t crash the writer.
 */
const NOISE_FIELDS = new Set(['updatedAt', 'createdAt']);

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return false;
}

function computeChangedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
) {
  if (!before) {
    return after ?? null; // insert — log full row
  }
  if (!after) {
    return { _deleted: true };
  }
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    if (NOISE_FIELDS.has(k)) continue;
    if (!valuesEqual(before[k], after[k])) {
      out[k] = { from: before[k], to: after[k] };
    }
  }
  return Object.keys(out).length ? out : null;
}

// ─── Donors ─────────────────────────────────────────────────────

export interface UpsertDonorInput {
  email: string;
  name?: string | null;
  organizationName?: string | null;
  phoneNumber?: string | null;
  mailingAddress?: string | null;
  stripeCustomerId?: string | null;
  donorStatus?: string | null;
  communicationOptIn?: boolean | null;
  howTheyHeard?: string | null;
  notes?: string | null;
}

/**
 * Insert or update by lowercased email. Existing fields are preserved
 * unless the input explicitly overrides — every webhook call shouldn&rsquo;t
 * wipe data the admin entered manually. Returns the post-write row.
 */
export async function upsertDonorByEmail(input: UpsertDonorInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(donors)
    .where(sql`lower(${donors.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existing[0]) {
    const before = existing[0];
    const updated = await db
      .update(donors)
      .set({
        name: input.name ?? before.name,
        organizationName: input.organizationName ?? before.organizationName,
        phoneNumber: input.phoneNumber ?? before.phoneNumber,
        mailingAddress: input.mailingAddress ?? before.mailingAddress,
        stripeCustomerId: input.stripeCustomerId ?? before.stripeCustomerId,
        donorStatus: input.donorStatus ?? before.donorStatus,
        communicationOptIn:
          input.communicationOptIn ?? before.communicationOptIn,
        howTheyHeard: input.howTheyHeard ?? before.howTheyHeard,
        notes: input.notes ?? before.notes,
        updatedAt: new Date(),
      })
      .where(eq(donors.id, before.id))
      .returning();
    await audit({
      table: 'donors',
      recordId: before.id,
      action: 'UPDATE',
      actorType: 'webhook',
      before: before as Record<string, unknown>,
      after: updated[0] as Record<string, unknown>,
    });
    return updated[0];
  }

  const inserted = await db
    .insert(donors)
    .values({
      email: input.email,
      name: input.name ?? null,
      organizationName: input.organizationName ?? null,
      phoneNumber: input.phoneNumber ?? null,
      mailingAddress: input.mailingAddress ?? null,
      stripeCustomerId: input.stripeCustomerId ?? null,
      donorStatus: input.donorStatus ?? 'New',
      communicationOptIn: input.communicationOptIn ?? false,
      howTheyHeard: input.howTheyHeard ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  await audit({
    table: 'donors',
    recordId: inserted[0].id,
    action: 'INSERT',
    actorType: 'webhook',
    after: inserted[0] as Record<string, unknown>,
  });
  return inserted[0];
}

// ─── Donations ──────────────────────────────────────────────────

export interface RecordDonationInput {
  donorId: string;
  donationAmount: number;
  currency?: string;
  donationSource?: string | null;
  paymentStatus?: string | null;
  recurringDonation?: boolean;
  stripePaymentIntentId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripeCustomerId?: string | null;
  donorEmailAtDonation?: string | null;
  donationNote?: string | null;
  designatedToChildIds?: string[];
  donationDate?: string | null; // YYYY-MM-DD
}

/**
 * Records a donation row and, if designations were passed, the
 * junction rows that tie it to specific kids. Idempotent on
 * stripe_payment_intent_id (or checkout_session_id) — a webhook
 * retry will not produce a duplicate.
 */
export async function recordDonation(input: RecordDonationInput) {
  // Idempotency check
  if (input.stripePaymentIntentId) {
    const existing = await db
      .select()
      .from(donations)
      .where(eq(donations.stripePaymentIntentId, input.stripePaymentIntentId))
      .limit(1);
    if (existing[0]) return existing[0];
  } else if (input.stripeCheckoutSessionId) {
    const existing = await db
      .select()
      .from(donations)
      .where(
        eq(donations.stripeCheckoutSessionId, input.stripeCheckoutSessionId)
      )
      .limit(1);
    if (existing[0]) return existing[0];
  }

  const inserted = await db
    .insert(donations)
    .values({
      donorId: input.donorId,
      donationAmount: String(input.donationAmount),
      currency: input.currency ?? 'usd',
      donationSource: input.donationSource ?? 'Website',
      paymentStatus: input.paymentStatus ?? 'Succeeded',
      recurringDonation: input.recurringDonation ?? false,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
      stripeCustomerId: input.stripeCustomerId ?? null,
      donorEmailAtDonation: input.donorEmailAtDonation ?? null,
      donationNote: input.donationNote ?? null,
      donationDate:
        input.donationDate ?? new Date().toISOString().slice(0, 10),
    })
    .returning();

  const donation = inserted[0];

  if (input.designatedToChildIds?.length) {
    await db.insert(donationChildren).values(
      input.designatedToChildIds.map(childId => ({
        donationId: donation.id,
        childId,
      }))
    );
  }

  await audit({
    table: 'donations',
    recordId: donation.id,
    action: 'INSERT',
    actorType: 'webhook',
    after: donation as Record<string, unknown>,
  });

  return donation;
}

/**
 * Best-effort tag of an existing Donation with a child link via the
 * `donation_children` junction table. Used by the claim-match flow to
 * backfill reporting when a Shirt + Stay buyer pairs to their kid.
 * Idempotent: the junction table&rsquo;s composite unique index makes
 * duplicate inserts a no-op (we swallow the duplicate-key error).
 */
export async function linkDonationToChild(
  donationId: string,
  childId: string
) {
  if (!donationId || !childId) return;
  try {
    await db
      .insert(donationChildren)
      .values({ donationId, childId })
      .onConflictDoNothing();
  } catch (err) {
    console.warn('[linkDonationToChild] non-fatal:', err);
  }
}

// ─── Subscriptions ──────────────────────────────────────────────

export interface UpsertSubscriptionInput {
  stripeSubscriptionId: string;
  donorId: string;
  status: string;
  amount: number;
  frequency?: 'monthly' | 'yearly';
  startDate?: string | null; // YYYY-MM-DD
  currentPeriodEnd?: string | null; // YYYY-MM-DD
}

export async function upsertSubscription(input: UpsertSubscriptionInput) {
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, input.stripeSubscriptionId))
    .limit(1);

  if (existing[0]) {
    const before = existing[0];
    const updated = await db
      .update(subscriptions)
      .set({
        donorId: input.donorId,
        status: input.status,
        amount: String(input.amount),
        frequency: input.frequency ?? before.frequency ?? 'monthly',
        startDate: input.startDate ?? before.startDate,
        currentPeriodEnd: input.currentPeriodEnd ?? before.currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, before.id))
      .returning();
    await audit({
      table: 'subscriptions',
      recordId: before.id,
      action: 'UPDATE',
      actorType: 'webhook',
      before: before as Record<string, unknown>,
      after: updated[0] as Record<string, unknown>,
    });
    return updated[0];
  }

  const inserted = await db
    .insert(subscriptions)
    .values({
      stripeSubscriptionId: input.stripeSubscriptionId,
      donorId: input.donorId,
      status: input.status,
      amount: String(input.amount),
      frequency: input.frequency ?? 'monthly',
      startDate: input.startDate ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
    })
    .returning();
  await audit({
    table: 'subscriptions',
    recordId: inserted[0].id,
    action: 'INSERT',
    actorType: 'webhook',
    after: inserted[0] as Record<string, unknown>,
  });
  return inserted[0];
}

/**
 * Refund handler — flips payment status and appends a note. Original
 * donation amount stays intact so revenue history is preserved.
 * Idempotent on stripe_payment_intent_id; safe to retry.
 */
export async function markDonationRefunded(args: {
  stripePaymentIntentId: string;
  partial: boolean;
  refundedAmount?: number;
  refundedAt: Date;
}) {
  const existing = await db
    .select()
    .from(donations)
    .where(eq(donations.stripePaymentIntentId, args.stripePaymentIntentId))
    .limit(1);
  if (!existing[0]) return null;
  const before = existing[0];

  const dateStr = args.refundedAt.toISOString().slice(0, 10);
  const note = args.partial
    ? `[Partially refunded ${args.refundedAmount ? `$${args.refundedAmount.toFixed(2)} ` : ''}on ${dateStr}]`
    : `[Refunded in full on ${dateStr}]`;
  // Idempotency: Stripe can fire `charge.refunded` multiple times
  // for the same refund event (retries, partial → full progression).
  // If we already appended this exact note line OR the donation is
  // already marked Refunded in full, skip the append and return the
  // existing row. Otherwise we&rsquo;d grow donationNote unboundedly
  // across retries.
  const existingNote = before.donationNote ?? '';
  if (existingNote.includes(note)) {
    return before;
  }
  if (!args.partial && before.paymentStatus === 'Refunded') {
    // A full-refund event arriving after we already marked the row
    // Refunded — even if the exact date string differs slightly,
    // don&rsquo;t double-log. Partial-then-full IS a real progression so
    // we still want to append the &ldquo;Refunded in full&rdquo; line on the
    // first encounter; that case is handled by the includes() check
    // above on the prior line content.
    return before;
  }
  const newNote = existingNote ? `${existingNote}\n${note}` : note;

  const updated = await db
    .update(donations)
    .set({
      paymentStatus: 'Refunded',
      donationNote: newNote,
      updatedAt: new Date(),
    })
    .where(eq(donations.id, before.id))
    .returning();
  await audit({
    table: 'donations',
    recordId: before.id,
    action: 'UPDATE',
    actorType: 'webhook',
    before: before as Record<string, unknown>,
    after: updated[0] as Record<string, unknown>,
  });
  return updated[0];
}

// ─── Sponsorships ───────────────────────────────────────────────

export interface CreateSponsorshipInput {
  sponsorCode: string;
  sponsorEmail: string;
  sponsorName?: string | null;
  childId: string;
  childIdLegacy?: string | null;
  childDisplayName?: string | null;
  monthlyAmount: number;
  status: 'Active' | 'Holder' | 'Awaiting Sponsor' | 'Cancelled' | 'Lapsed' | 'New';
  stripeSubscriptionId?: string | null;
  sponsorshipStartDate?: string | null; // YYYY-MM-DD
  childRevealedAt?: Date | null;
  visibleToSponsor?: boolean;
}

export async function createSponsorship(input: CreateSponsorshipInput) {
  const inserted = await db
    .insert(sponsorships)
    .values({
      sponsorCode: input.sponsorCode,
      sponsorEmail: input.sponsorEmail,
      sponsorName: input.sponsorName ?? null,
      childId: input.childId,
      childIdLegacy: input.childIdLegacy ?? null,
      childDisplayName: input.childDisplayName ?? null,
      monthlyAmount: String(input.monthlyAmount),
      status: input.status,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      sponsorshipStartDate: input.sponsorshipStartDate ?? null,
      childRevealedAt: input.childRevealedAt ?? null,
      visibleToSponsor: input.visibleToSponsor ?? true,
    })
    .returning();
  await audit({
    table: 'sponsorships',
    recordId: inserted[0].id,
    action: 'INSERT',
    actorType: 'webhook',
    after: inserted[0] as Record<string, unknown>,
  });
  return inserted[0];
}

export interface UpdateSponsorshipStatusInput {
  sponsorshipId: string;
  status: 'Active' | 'Holder' | 'Awaiting Sponsor' | 'Cancelled' | 'Lapsed' | 'New';
  monthlyAmount?: number | null;
  actorType?: AuditActorType;
}

export async function updateSponsorshipStatus(
  input: UpdateSponsorshipStatusInput
) {
  const existing = await db
    .select()
    .from(sponsorships)
    .where(eq(sponsorships.id, input.sponsorshipId))
    .limit(1);
  if (!existing[0]) return null;
  const before = existing[0];

  const patch: Record<string, unknown> = {
    status: input.status,
    updatedAt: new Date(),
  };
  if (input.monthlyAmount !== undefined && input.monthlyAmount !== null) {
    patch.monthlyAmount = String(input.monthlyAmount);
  }

  const updated = await db
    .update(sponsorships)
    .set(patch)
    .where(eq(sponsorships.id, input.sponsorshipId))
    .returning();

  await audit({
    table: 'sponsorships',
    recordId: before.id,
    action: 'UPDATE',
    actorType: input.actorType ?? 'system',
    before: before as Record<string, unknown>,
    after: updated[0] as Record<string, unknown>,
  });

  return updated[0];
}

/**
 * Bulk-cancel every sponsorship pointing at a given Stripe
 * subscription. Used when Stripe emits `customer.subscription.deleted`.
 * Idempotent — re-running on an already-canceled sponsorship is a
 * no-op. Returns the number of rows updated.
 */
export async function cancelSponsorshipsBySubscription(
  stripeSubscriptionId: string
) {
  const matches = await db
    .select()
    .from(sponsorships)
    .where(eq(sponsorships.stripeSubscriptionId, stripeSubscriptionId));
  let n = 0;
  for (const before of matches) {
    if (before.status === 'Cancelled') continue;
    const updated = await db
      .update(sponsorships)
      .set({
        status: 'Cancelled',
        authStatus: 'Inactive',
        visibleToSponsor: false,
        updatedAt: new Date(),
      })
      .where(eq(sponsorships.id, before.id))
      .returning();
    await audit({
      table: 'sponsorships',
      recordId: before.id,
      action: 'UPDATE',
      actorType: 'webhook',
      before: before as Record<string, unknown>,
      after: updated[0] as Record<string, unknown>,
    });
    n++;
  }
  return n;
}

/**
 * Auto-reveal — set childRevealedAt once the buyer has opened the
 * page (or the shirt-arrival job fires). Idempotent: a second call
 * is a no-op if the field is already set.
 */
export async function revealChildToSponsor(sponsorshipId: string) {
  const existing = await db
    .select()
    .from(sponsorships)
    .where(eq(sponsorships.id, sponsorshipId))
    .limit(1);
  if (!existing[0]) return null;
  if (existing[0].childRevealedAt) return existing[0];

  const updated = await db
    .update(sponsorships)
    .set({ childRevealedAt: new Date(), updatedAt: new Date() })
    .where(eq(sponsorships.id, sponsorshipId))
    .returning();
  await audit({
    table: 'sponsorships',
    recordId: sponsorshipId,
    action: 'UPDATE',
    actorType: 'system',
    before: existing[0] as Record<string, unknown>,
    after: updated[0] as Record<string, unknown>,
  });
  return updated[0];
}

/**
 * Re-stage a donor&rsquo;s drip pipeline at sign-in. When a sponsor
 * clicks a magic link, they&rsquo;ve obviously received their shirt and
 * gone through the claim ritual &mdash; whatever drip stage they
 * were on, the "did it arrive?" and "have you met your kid yet?"
 * touches are now obsolete.
 *
 * Rules (mirror the old Airtable-side advanceDripOnClaim):
 *   - No pipeline set → enroll in `shirt_nurture` at stage 2.
 *   - On `shirt_nurture` or `shirt_sponsor` and stage &lt; 2 → bump to 2.
 *   - Otherwise → no-op (they&rsquo;re already past the pre-claim touches,
 *     or in a pipeline whose touches stay relevant).
 *
 * When a change applies, push the next-send date 5 days out so we
 * don&rsquo;t hit them with the pitch immediately after they engaged.
 *
 * Returns the updated donor row when a change was made, the original
 * row when no change was applied, or null when the donor isn&rsquo;t found.
 * Errors are swallowed (logged) so a drip failure never blocks sign-in.
 */
export async function advanceDripOnClaim(email: string) {
  if (!email) return null;
  try {
    const emailLower = email.toLowerCase();
    const existing = await db
      .select()
      .from(donors)
      .where(sql`lower(${donors.email}) = ${emailLower}`)
      .limit(1);
    if (!existing[0]) return null;
    const before = existing[0];

    const pipeline = (before.dripPipeline ?? '').toString();
    const stage = before.dripStage ?? 0;

    const patch: Record<string, unknown> = {};
    if (!pipeline) {
      patch.dripPipeline = 'shirt_nurture';
      patch.dripStage = 2;
    } else if (
      (pipeline === 'shirt_nurture' || pipeline === 'shirt_sponsor') &&
      stage < 2
    ) {
      patch.dripStage = 2;
    } else {
      // Already past the pre-claim touches, or in a pipeline whose
      // touches are still relevant. No change.
      return before;
    }

    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 5);
    patch.dripNextSend = next.toISOString().slice(0, 10);
    patch.updatedAt = new Date();

    const updated = await db
      .update(donors)
      .set(patch)
      .where(eq(donors.id, before.id))
      .returning();
    await audit({
      table: 'donors',
      recordId: before.id,
      action: 'UPDATE',
      actorType: 'sponsor',
      before: before as Record<string, unknown>,
      after: updated[0] as Record<string, unknown>,
    });
    return updated[0];
  } catch (err) {
    console.warn('[advanceDripOnClaim] failed (non-fatal):', err);
    return null;
  }
}

// ─── Children ───────────────────────────────────────────────────

/**
 * Marks a kid as departed. Status flips, departed_at timestamp set.
 * The previous sponsor relationships remain intact on the sponsorship
 * rows for audit history; reassignment is a separate operation.
 */
export async function markChildDeparted(
  childId: string,
  args: { note?: string; departedAt?: Date } = {}
) {
  const existing = await db
    .select()
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);
  if (!existing[0]) return null;
  const before = existing[0];

  const updated = await db
    .update(children)
    .set({
      status: 'Departed',
      departedAt: args.departedAt ?? new Date(),
      departureNote: args.note ?? before.departureNote,
      // Archive the shirt number so it can be reused in the next cycle
      // without losing the historical association.
      archivedShirtNumber: before.shirtNumber ?? before.archivedShirtNumber,
      shirtNumber: null,
      updatedAt: new Date(),
    })
    .where(eq(children.id, childId))
    .returning();
  await audit({
    table: 'children',
    recordId: childId,
    action: 'UPDATE',
    actorType: 'admin',
    before: before as Record<string, unknown>,
    after: updated[0] as Record<string, unknown>,
  });
  return updated[0];
}
