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

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './client';
import { generateUniqueSponsorCode } from '../sponsor-codes';
import {
  auditLog,
  children,
  childUpdates,
  communications,
  donations,
  donationChildren,
  donors,
  fulfillments,
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
 *
 * Exported so admin API routes (e.g. /api/admin/roster/*) can stamp
 * an audit row for every UI-driven mutation. actorType='admin' +
 * actorId='simon' | 'admin' is the convention for admin-UI edits —
 * gives Kevin a real change log to spot-check Simon's roster work.
 */
export async function audit(args: AuditArgs) {
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
  // Nullable: an orphaned buyer whose shirt has not been reconciled
  // from the stockpile yet has no kid linked. The email-only sign-in
  // path materializes a childless Holder in that case so the buyer
  // can still sign in and land on /me.
  childId: string | null;
  childIdLegacy?: string | null;
  childDisplayName?: string | null;
  monthlyAmount: number;
  status: 'Active' | 'Holder' | 'Awaiting Sponsor' | 'Cancelled' | 'Lapsed' | 'New';
  stripeSubscriptionId?: string | null;
  sponsorshipStartDate?: string | null; // YYYY-MM-DD
  childRevealedAt?: Date | null;
  visibleToSponsor?: boolean;
  // Per-number ownership (migration 0017). Set by the claim paths;
  // omit for co-sponsor adds and childless checkout rows — those
  // hold no number.
  claimedShirtNumber?: number | null;
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
      claimedShirtNumber: input.claimedShirtNumber ?? null,
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

/**
 * Bind an existing CHILDLESS sponsorship to the kid the buyer just
 * claimed. This is the claim event for buyers whose sponsorship row
 * was created at checkout with a blank child link (cart+monthly,
 * Shirt + Stay). Instead of minting a duplicate Holder row, we point
 * their real row — status, monthly amount, and Stripe sub intact —
 * at the kid whose number is on their shirt.
 *
 * ChildRevealedAt is stamped now: the buyer is looking at the kid at
 * the moment they claim, same contract as the claim-match endpoint.
 *
 * Caller is responsible for verifying the number isn't already
 * claimed by another email (isChildClaimedByOtherEmail) BEFORE
 * calling this. This helper only refuses to clobber an existing
 * child link on the row itself.
 */
export async function bindSponsorshipToChild(input: {
  sponsorshipId: string;
  /** Children row UUID for canonical numbers; null for cycle numbers
   *  (no row exists — identity lives in childIdLegacy). */
  childId: string | null;
  childIdLegacy?: string | null;
  childDisplayName?: string | null;
  /** The shirt number this claim takes ownership of. */
  claimedShirtNumber?: number | null;
  actorType?: AuditActorType;
}) {
  const beforeRows = await db
    .select()
    .from(sponsorships)
    .where(eq(sponsorships.id, input.sponsorshipId))
    .limit(1);
  const before = beforeRows[0];
  if (!before) {
    throw new Error(`bindSponsorshipToChild: sponsorship ${input.sponsorshipId} not found`);
  }
  if (before.childId || (before.childIdLegacy && before.childIdLegacy !== '')) {
    throw new Error(
      `bindSponsorshipToChild: sponsorship ${input.sponsorshipId} already has a child link`
    );
  }
  const updated = await db
    .update(sponsorships)
    .set({
      childId: input.childId,
      childIdLegacy: input.childIdLegacy ?? null,
      childDisplayName: input.childDisplayName ?? null,
      claimedShirtNumber: input.claimedShirtNumber ?? null,
      childRevealedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sponsorships.id, input.sponsorshipId))
    .returning();
  await audit({
    table: 'sponsorships',
    recordId: input.sponsorshipId,
    action: 'UPDATE',
    actorType: input.actorType ?? 'sponsor',
    before: before as Record<string, unknown>,
    after: updated[0] as Record<string, unknown>,
  });
  return updated[0];
}

/**
 * Ensure a Holder sponsorship row exists for every fulfillment on the
 * given buyer email. Idempotent by design: skips any fulfillment whose
 * child (or, when the shirt is un-reconciled, whose email) already
 * has a matching sponsorship row.
 *
 * Runs in two contexts:
 *   1. Sign-in self-heal — the email-only recovery endpoint calls this
 *      before minting a magic link so a pre-cutover shirt buyer who
 *      never got a Postgres sponsorship row still gets a working link.
 *   2. Backfill — scripts/backfill-orphaned-buyers.ts calls this for
 *      every fulfillment-having email with no sponsorship at all,
 *      unblocking the cohort in one pass.
 *
 * Two shapes of Holder row can result:
 *   - Fulfillment has an order_number that maps to a children row →
 *     Holder row linked to that kid. Sign-in lands on /children/[N].
 *   - Fulfillment has no order_number yet (Kevin hasn't reconciled a
 *     shirt from the stockpile) → childless Holder row. Sign-in lands
 *     on /me. Kevin will link the kid later at reconciliation time.
 *
 * Returns a summary so callers can report what happened.
 */
export interface MaterializedHolderRow {
  sponsorshipId: string;
  sponsorCode: string;
  fulfillmentId: string;
  orderNumber: number | null;
  childId: string | null;
  childDisplayName: string | null;
}

export interface MaterializeHolderSponsorshipsResult {
  buyerEmail: string;
  fulfillmentsScanned: number;
  created: MaterializedHolderRow[];
  skippedExisting: number;
  skippedError: number;
}

export async function materializeHolderSponsorshipsForBuyer(
  buyerEmailRaw: string,
  opts: { actorType?: AuditActorType } = {}
): Promise<MaterializeHolderSponsorshipsResult> {
  const buyerEmail = (buyerEmailRaw || '').trim().toLowerCase();
  const result: MaterializeHolderSponsorshipsResult = {
    buyerEmail,
    fulfillmentsScanned: 0,
    created: [],
    skippedExisting: 0,
    skippedError: 0,
  };
  if (!buyerEmail) return result;

  // Pull every fulfillment for the email, joined to any kid whose
  // shirt_number matches order_number. The join is nullable — a
  // fulfillment queued in the stockpile with no assigned shirt number
  // yet comes back with childId=null; we still materialize a
  // childless Holder for it so sign-in works before shipping.
  const rows = await db
    .select({
      fulfillmentId: fulfillments.id,
      orderNumber: fulfillments.orderNumber,
      orderDate: fulfillments.orderDate,
      buyerName: fulfillments.buyerName,
      childId: children.id,
      childIdLegacy: children.childId,
      childDisplayName: children.displayName,
      childFirstName: children.firstName,
    })
    .from(fulfillments)
    .leftJoin(children, eq(children.shirtNumber, fulfillments.orderNumber))
    .where(sql`lower(${fulfillments.buyerEmail}) = ${buyerEmail}`)
    .orderBy(desc(fulfillments.orderDate), desc(fulfillments.createdAt));

  result.fulfillmentsScanned = rows.length;

  // Load every existing sponsorship for this email once so per-row
  // idempotency checks are in-memory (fast + no chatty queries).
  const existing = await db
    .select({
      id: sponsorships.id,
      childId: sponsorships.childId,
      sponsorCode: sponsorships.sponsorCode,
    })
    .from(sponsorships)
    .where(sql`lower(${sponsorships.sponsorEmail}) = ${buyerEmail}`);

  const existingChildIds = new Set(
    existing.map(e => e.childId).filter((v): v is string => !!v)
  );
  // Whether the email has ANY childless holder row already. We only
  // want one placeholder row per orphan buyer, even if they bought
  // multiple un-numbered shirts — the placeholder just gates sign-in
  // until Kevin reconciles their shirts and stamps numbers.
  let hasChildlessHolder = existing.some(e => !e.childId);

  const today = new Date().toISOString().slice(0, 10);

  for (const f of rows) {
    if (f.childId) {
      // Fulfillment resolves to a real kid. If a sponsorship for this
      // buyer email + child already exists, leave it alone.
      if (existingChildIds.has(f.childId)) {
        result.skippedExisting += 1;
        continue;
      }
      try {
        const inserted = await createSponsorship({
          sponsorCode: await generateUniqueSponsorCode(),
          sponsorEmail: buyerEmail,
          sponsorName: f.buyerName ?? null,
          childId: f.childId,
          childIdLegacy: f.childIdLegacy ?? null,
          childDisplayName:
            f.childDisplayName ||
            (f.childFirstName ? f.childFirstName : null) ||
            null,
          monthlyAmount: 0,
          status: 'Holder',
          sponsorshipStartDate: f.orderDate
            ? new Date(f.orderDate).toISOString().slice(0, 10)
            : today,
        });
        // Match the auth_status semantics that the legacy Airtable
        // sponsorships used, so verify-code-style paths still recognize
        // the row. Non-fatal on failure.
        try {
          await db
            .update(sponsorships)
            .set({ authStatus: 'Active', updatedAt: new Date() })
            .where(eq(sponsorships.id, inserted.id));
        } catch {
          /* non-fatal */
        }
        existingChildIds.add(f.childId);
        result.created.push({
          sponsorshipId: inserted.id,
          sponsorCode: inserted.sponsorCode,
          fulfillmentId: f.fulfillmentId,
          orderNumber: f.orderNumber ?? null,
          childId: f.childId,
          childDisplayName:
            f.childDisplayName || f.childFirstName || null,
        });
      } catch (err) {
        console.error(
          '[materializeHolders] failed to create sponsorship for',
          buyerEmail,
          'order #' + f.orderNumber,
          err
        );
        result.skippedError += 1;
      }
    } else {
      // No kid yet (order_number unset or points at a shirt number
      // with no matching kid row). One childless placeholder Holder
      // is enough per email — subsequent fulfillments will fold into
      // it when Kevin reconciles their number.
      if (hasChildlessHolder) {
        result.skippedExisting += 1;
        continue;
      }
      try {
        const inserted = await createSponsorship({
          sponsorCode: await generateUniqueSponsorCode(),
          sponsorEmail: buyerEmail,
          sponsorName: f.buyerName ?? null,
          childId: null,
          childIdLegacy: null,
          childDisplayName: null,
          monthlyAmount: 0,
          status: 'Holder',
          sponsorshipStartDate: f.orderDate
            ? new Date(f.orderDate).toISOString().slice(0, 10)
            : today,
        });
        try {
          await db
            .update(sponsorships)
            .set({ authStatus: 'Active', updatedAt: new Date() })
            .where(eq(sponsorships.id, inserted.id));
        } catch {
          /* non-fatal */
        }
        hasChildlessHolder = true;
        result.created.push({
          sponsorshipId: inserted.id,
          sponsorCode: inserted.sponsorCode,
          fulfillmentId: f.fulfillmentId,
          orderNumber: null,
          childId: null,
          childDisplayName: null,
        });
      } catch (err) {
        console.error(
          '[materializeHolders] failed to create childless holder for',
          buyerEmail,
          err
        );
        result.skippedError += 1;
      }
    }
  }
  // opts.actorType left in the signature for future hookups (audit
  // rows already carry actorType='webhook' via createSponsorship's
  // default). Keeping the arg lets callers thread through 'migration'
  // for backfills without breaking source stability.
  void opts.actorType;
  return result;
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

// ─── Child Updates (sponsor-initiated update requests) ───────────

export interface CreateUpdateRequestInput {
  sponsorCode: string;
  sponsorEmail: string;
  childId: string;
  childIdLegacy?: string | null;
}

/**
 * Records a sponsor-initiated request for a kid update. Writes a
 * child_updates row tagged `RequestedBySponsor=true`, `Status='Pending
 * Review'`, `VisibleToSponsor=false` — the YDO team publishes it
 * later by flipping the visibility/published fields.
 *
 * Idempotent against double-tap within the same UTC day: if a row
 * already exists for this sponsorCode+child today, returns it
 * unchanged. Callers that want their own dedup window can pre-check
 * with queries.getTodayPendingUpdateRequest.
 */
export async function createUpdateRequest(input: CreateUpdateRequestInput) {
  // Idempotency: dedup within the same UTC day.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const existing = await db
    .select()
    .from(childUpdates)
    .where(
      and(
        eq(childUpdates.sponsorCode, input.sponsorCode),
        eq(childUpdates.requestedBySponsor, true),
        sql`(${childUpdates.childId} = ${input.childId} OR ${childUpdates.childIdLegacy} = ${input.childIdLegacy ?? ''})`,
        sql`${childUpdates.requestedAt} >= ${startOfDay}`
      )
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const now = new Date();
  const inserted = await db
    .insert(childUpdates)
    .values({
      sponsorCode: input.sponsorCode,
      childId: input.childId,
      childIdLegacy: input.childIdLegacy ?? null,
      updateType: 'Requested Update',
      title: `Update Request from ${input.sponsorEmail}`,
      content: `Sponsor ${input.sponsorEmail} has requested an update about their sponsored child.`,
      status: 'Pending Review',
      visibleToSponsor: false,
      requestedBySponsor: true,
      requestedAt: now,
    })
    .returning();
  await audit({
    table: 'child_updates',
    recordId: inserted[0].id,
    action: 'INSERT',
    actorType: 'sponsor',
    after: inserted[0] as Record<string, unknown>,
  });
  return inserted[0];
}

/**
 * Bumps the Sponsorships throttle fields after an update request:
 * `LastRequestAt` to now, `NextRequestEligibleAt` to 90 days out.
 * Used in tandem with createUpdateRequest so the request-update
 * endpoint won&rsquo;t honor a second request until the quarter rolls.
 */
export async function markSponsorshipUpdateRequested(sponsorshipId: string) {
  const existing = await db
    .select()
    .from(sponsorships)
    .where(eq(sponsorships.id, sponsorshipId))
    .limit(1);
  if (!existing[0]) return null;
  const before = existing[0];

  const now = new Date();
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 90);

  const updated = await db
    .update(sponsorships)
    .set({
      lastRequestAt: now,
      nextRequestEligibleAt: next,
      requestedBySponsor: true,
      requestedAt: now,
      updatedAt: new Date(),
    })
    .where(eq(sponsorships.id, sponsorshipId))
    .returning();
  await audit({
    table: 'sponsorships',
    recordId: before.id,
    action: 'UPDATE',
    actorType: 'sponsor',
    before: before as Record<string, unknown>,
    after: updated[0] as Record<string, unknown>,
  });
  return updated[0];
}

// ─── Communications (sponsor-to-kid messages) ────────────────────

export interface RecordSponsorMessageInput {
  sponsorCode: string;
  sponsorEmail: string;
  childDisplayName?: string | null;
  message: string;
  relatedDonorId?: string | null;
}

/**
 * Logs a sponsor-to-kid message as a Communications row with
 * EmailType=&lsquo;Sponsor Message&rsquo;. Subject is prefixed with the
 * sponsorCode in square brackets so the queries.ts filter can find
 * every message a sponsor has sent without a dedicated column.
 *
 * Idempotent against double-tap: if a row already exists for this
 * sponsorCode + exact message text today, returns it unchanged.
 * The body is folded into the subject (truncated) since the
 * communications table has no body column post-redesign; the full
 * text is also stored in a follow-up email send to Kevin / YDO
 * downstream of this writer.
 */
export async function recordSponsorMessage(input: RecordSponsorMessageInput) {
  const subjectPrefix = `[${input.sponsorCode}]`;
  const preview = input.message.length > 120
    ? `${input.message.slice(0, 117)}...`
    : input.message;
  const subject = `${subjectPrefix} ${preview}`;

  // Idempotency: same sponsorCode + same body today is treated as a
  // double-tap.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startDateOnly = startOfDay.toISOString().slice(0, 10);
  const existing = await db
    .select()
    .from(communications)
    .where(
      and(
        eq(communications.emailType, 'Sponsor Message'),
        eq(communications.subject, subject),
        sql`${communications.sendDate} >= ${startDateOnly}`
      )
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(communications)
    .values({
      subject,
      emailType: 'Sponsor Message',
      status: 'Sent',
      sendDate: new Date().toISOString().slice(0, 10),
      recipientEmail: input.sponsorEmail,
      relatedDonorId: input.relatedDonorId ?? null,
    })
    .returning();
  await audit({
    table: 'communications',
    recordId: inserted[0].id,
    action: 'INSERT',
    actorType: 'sponsor',
    after: inserted[0] as Record<string, unknown>,
  });
  return inserted[0];
}
