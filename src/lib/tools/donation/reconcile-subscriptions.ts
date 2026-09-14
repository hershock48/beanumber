/**
 * Reconcile Subscriptions Tool
 *
 * WAT-compliant tool for reconciling Stripe subscriptions with the
 * Postgres sponsorships table. Identifies mismatches between what
 * Stripe is billing and what the site believes is an active sponsorship.
 *
 * Compared against Airtable until 2026-09-14; Airtable is retired and
 * the sponsorships table is the source of truth.
 */

import type Stripe from 'stripe';
import { isNotNull } from 'drizzle-orm';
import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { db } from '../../db/client';
import { sponsorships } from '../../db/schema';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for reconciliation
 */
export interface ReconcileSubscriptionsInput {
  /** Only include subscriptions created after this date (ISO string) */
  sinceDate?: string;
  /** Include detailed subscription data in output */
  includeDetails?: boolean;
}

/**
 * Subscription mismatch types
 */
export type MismatchType =
  | 'missing_in_postgres'   // Stripe sub exists but no sponsorship row
  | 'missing_in_stripe'     // Sponsorship row exists but no Stripe sub
  | 'status_mismatch'       // Payment status doesn't match
  | 'amount_mismatch'       // Subscription amount differs
  | 'canceled_subscription' // Subscription was canceled but row still active

/**
 * Subscription mismatch record
 */
export interface SubscriptionMismatch {
  type: MismatchType;
  subscriptionId?: string;
  customerId?: string;
  customerEmail?: string;
  sponsorCode?: string;
  stripeStatus?: string;
  postgresStatus?: string;
  stripeAmount?: number;
  postgresAmount?: number;
  details?: string;
}

/**
 * Output schema
 */
export interface ReconcileSubscriptionsOutput {
  success: boolean;
  data?: {
    totalStripeSubscriptions: number;
    totalPostgresSponsorships: number;
    mismatches: SubscriptionMismatch[];
    mismatchSummary: {
      missing_in_postgres: number;
      missing_in_stripe: number;
      status_mismatch: number;
      canceled_subscription: number;
    };
    reconciliationDate: string;
  };
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate tool input
 */
function validateInput(input: unknown): ValidationResult<ReconcileSubscriptionsInput> {
  if (input === undefined || input === null) {
    return success({});
  }

  if (typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate optional sinceDate
  if (obj.sinceDate !== undefined) {
    if (typeof obj.sinceDate !== 'string') {
      return failure('Invalid input: sinceDate must be a string');
    }
    // Validate it's a valid date
    const date = new Date(obj.sinceDate);
    if (isNaN(date.getTime())) {
      return failure('Invalid input: sinceDate must be a valid ISO date string');
    }
  }

  return success({
    sinceDate: obj.sinceDate as string | undefined,
    includeDetails: obj.includeDetails === true,
  });
}

// ============================================================================
// STRIPE HELPERS
// ============================================================================

interface StripeSubSummary {
  id: string;
  customerId: string;
  customerEmail: string;
  status: string;
  amount: number;
  currency: string;
  created: Date;
}

/**
 * Fetch subscriptions from Stripe (all statuses)
 */
async function fetchStripeSubscriptions(sinceDate?: string): Promise<StripeSubSummary[]> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  const StripeModule = (await import('stripe')).default;
  const stripe = new StripeModule(stripeSecretKey, {
    apiVersion: '2025-12-15.clover',
  });

  const subscriptions: StripeSubSummary[] = [];

  // Fetch all subscriptions with pagination
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Stripe.SubscriptionListParams = {
      limit: 100,
      status: 'all',
      expand: ['data.customer'],
    };

    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    if (sinceDate) {
      params.created = { gte: Math.floor(new Date(sinceDate).getTime() / 1000) };
    }

    const response = await stripe.subscriptions.list(params);

    for (const sub of response.data) {
      const customer = sub.customer;
      subscriptions.push({
        id: sub.id,
        customerId: typeof customer === 'string' ? customer : customer.id,
        customerEmail:
          typeof customer === 'object' && 'email' in customer ? customer.email || '' : '',
        status: sub.status,
        amount: sub.items.data[0]?.price?.unit_amount || 0,
        currency: sub.currency,
        created: new Date(sub.created * 1000),
      });
    }

    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }

  return subscriptions;
}

// ============================================================================
// POSTGRES HELPERS
// ============================================================================

interface SponsorshipSummary {
  id: string;
  sponsorCode: string;
  sponsorEmail: string;
  subscriptionId: string;
  status: string;
  monthlyAmount: number;
}

/**
 * Every sponsorship row that carries a Stripe subscription id.
 */
async function fetchPostgresSponsorships(): Promise<SponsorshipSummary[]> {
  const rows = await db
    .select({
      id: sponsorships.id,
      sponsorCode: sponsorships.sponsorCode,
      sponsorEmail: sponsorships.sponsorEmail,
      subscriptionId: sponsorships.stripeSubscriptionId,
      status: sponsorships.status,
      monthlyAmount: sponsorships.monthlyAmount,
    })
    .from(sponsorships)
    .where(isNotNull(sponsorships.stripeSubscriptionId));

  return rows
    .filter(r => !!r.subscriptionId)
    .map(r => ({
      id: r.id,
      sponsorCode: r.sponsorCode,
      sponsorEmail: r.sponsorEmail,
      subscriptionId: r.subscriptionId as string,
      status: r.status || 'Unknown',
      monthlyAmount: Number(r.monthlyAmount ?? 0),
    }));
}

const ACTIVE_ROW_STATUSES = new Set(['Active', 'Holder', 'Awaiting Sponsor', 'New']);

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Reconcile Stripe subscriptions with Postgres sponsorship rows
 *
 * @param input - Optional filter parameters
 * @returns Reconciliation report with mismatches
 */
export async function reconcileSubscriptionsTool(
  input?: unknown
): Promise<ReconcileSubscriptionsOutput> {
  // 1. Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('reconcile-subscriptions validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { sinceDate, includeDetails } = validated.data!;

  // 2. Execute action
  try {
    logger.debug('Starting subscription reconciliation', { sinceDate });

    // Fetch data from both sources
    const [stripeSubscriptions, sponsorshipRows] = await Promise.all([
      fetchStripeSubscriptions(sinceDate),
      fetchPostgresSponsorships(),
    ]);

    // Build lookup maps
    const stripeBySubId = new Map(stripeSubscriptions.map(s => [s.id, s]));
    const rowsBySubId = new Map(sponsorshipRows.map(r => [r.subscriptionId, r]));

    const mismatches: SubscriptionMismatch[] = [];

    // Stripe subscriptions with no sponsorship row
    for (const stripeSub of stripeSubscriptions) {
      const row = rowsBySubId.get(stripeSub.id);

      if (!row) {
        // Only flag active subscriptions that are missing
        if (['active', 'trialing'].includes(stripeSub.status)) {
          mismatches.push({
            type: 'missing_in_postgres',
            subscriptionId: stripeSub.id,
            customerId: stripeSub.customerId,
            customerEmail: stripeSub.customerEmail,
            stripeStatus: stripeSub.status,
            stripeAmount: stripeSub.amount / 100,
            details: 'Active Stripe subscription has no sponsorship row',
          });
        }
        continue;
      }

      // Canceled in Stripe, still active here
      if (stripeSub.status === 'canceled' && ACTIVE_ROW_STATUSES.has(row.status)) {
        mismatches.push({
          type: 'canceled_subscription',
          subscriptionId: stripeSub.id,
          customerEmail: stripeSub.customerEmail,
          sponsorCode: row.sponsorCode,
          stripeStatus: stripeSub.status,
          postgresStatus: row.status,
          details: 'Subscription canceled in Stripe but the sponsorship row still shows active',
        });
      }

      // Amount drift (compare in dollars, tolerate cents rounding)
      const stripeDollars = stripeSub.amount / 100;
      if (
        ['active', 'trialing'].includes(stripeSub.status) &&
        row.monthlyAmount > 0 &&
        Math.abs(stripeDollars - row.monthlyAmount) >= 0.01
      ) {
        mismatches.push({
          type: 'amount_mismatch',
          subscriptionId: stripeSub.id,
          customerEmail: stripeSub.customerEmail,
          sponsorCode: row.sponsorCode,
          stripeAmount: stripeDollars,
          postgresAmount: row.monthlyAmount,
          details: 'Monthly amount on the sponsorship row differs from what Stripe bills',
        });
      }
    }

    // Sponsorship rows whose subscription is unknown to Stripe (only
    // meaningful without a sinceDate filter, which narrows the Stripe side)
    if (!sinceDate) {
      for (const row of sponsorshipRows) {
        if (!stripeBySubId.has(row.subscriptionId)) {
          mismatches.push({
            type: 'missing_in_stripe',
            subscriptionId: row.subscriptionId,
            sponsorCode: row.sponsorCode,
            customerEmail: row.sponsorEmail,
            postgresStatus: row.status,
            details: 'Sponsorship row references a subscription not found in Stripe',
          });
        }
      }
    }

    // Build summary
    const mismatchSummary = {
      missing_in_postgres: mismatches.filter(m => m.type === 'missing_in_postgres').length,
      missing_in_stripe: mismatches.filter(m => m.type === 'missing_in_stripe').length,
      status_mismatch: mismatches.filter(m => m.type === 'status_mismatch' || m.type === 'amount_mismatch').length,
      canceled_subscription: mismatches.filter(m => m.type === 'canceled_subscription').length,
    };

    // 3. Log result
    logger.info('Subscription reconciliation complete', {
      stripeCount: stripeSubscriptions.length,
      postgresCount: sponsorshipRows.length,
      mismatchCount: mismatches.length,
      summary: mismatchSummary,
    });

    // 4. Return structured output
    return {
      success: true,
      data: {
        totalStripeSubscriptions: stripeSubscriptions.length,
        totalPostgresSponsorships: sponsorshipRows.length,
        mismatches: includeDetails ? mismatches : mismatches.slice(0, 50), // Limit if not detailed
        mismatchSummary,
        reconciliationDate: new Date().toISOString(),
      },
    };
  } catch (error) {
    // 5. Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('reconcile-subscriptions failed', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
