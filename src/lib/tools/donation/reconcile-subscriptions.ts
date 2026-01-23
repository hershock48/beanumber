/**
 * Reconcile Subscriptions Tool
 *
 * WAT-compliant tool for reconciling Stripe subscriptions with Airtable records.
 * Identifies mismatches between payment status and sponsorship records.
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';

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
  | 'missing_in_airtable'   // Stripe sub exists but no Airtable record
  | 'missing_in_stripe'     // Airtable record exists but no Stripe sub
  | 'status_mismatch'       // Payment status doesn't match
  | 'amount_mismatch'       // Subscription amount differs
  | 'canceled_subscription' // Subscription was canceled but record still active;

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
  airtableStatus?: string;
  stripeAmount?: number;
  airtableAmount?: number;
  details?: string;
}

/**
 * Output schema
 */
export interface ReconcileSubscriptionsOutput {
  success: boolean;
  data?: {
    totalStripeSubscriptions: number;
    totalAirtableSponsorships: number;
    mismatches: SubscriptionMismatch[];
    mismatchSummary: {
      missing_in_airtable: number;
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

/**
 * Fetch active subscriptions from Stripe
 */
async function fetchStripeSubscriptions(sinceDate?: string): Promise<Array<{
  id: string;
  customerId: string;
  customerEmail: string;
  status: string;
  amount: number;
  currency: string;
  created: Date;
}>> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  const StripeModule = (await import('stripe')).default;
  const stripe = new StripeModule(stripeSecretKey, {
    apiVersion: '2025-12-15.clover',
  });

  const subscriptions: Array<{
    id: string;
    customerId: string;
    customerEmail: string;
    status: string;
    amount: number;
    currency: string;
    created: Date;
  }> = [];

  // Fetch all subscriptions with pagination
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Record<string, unknown> = {
      limit: 100,
      expand: ['data.customer'],
    };

    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    if (sinceDate) {
      params.created = { gte: Math.floor(new Date(sinceDate).getTime() / 1000) };
    }

    const response = await stripe.subscriptions.list(params as any);

    for (const sub of response.data) {
      const customer = sub.customer as any;
      subscriptions.push({
        id: sub.id,
        customerId: typeof customer === 'string' ? customer : customer?.id || '',
        customerEmail: typeof customer === 'object' ? customer?.email || '' : '',
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
// AIRTABLE HELPERS
// ============================================================================

/**
 * Fetch active sponsorships from Airtable that have subscription IDs
 */
async function fetchAirtableSponsorships(): Promise<Array<{
  id: string;
  sponsorCode: string;
  sponsorEmail: string;
  subscriptionId?: string;
  status: string;
}>> {
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }

  // Fetch recurring donations with subscription IDs
  const formula = `AND({Recurring Donation}=TRUE(),{Subscription ID}!='')`;
  const response = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
    {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${error}`);
  }

  const data = await response.json();

  return data.records.map((record: any) => ({
    id: record.id,
    sponsorCode: record.fields['SponsorCode'] || '',
    sponsorEmail: record.fields['Donor Email at Donation'] || '',
    subscriptionId: record.fields['Subscription ID'],
    status: record.fields['Payment Status'] || 'Unknown',
  }));
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Reconcile Stripe subscriptions with Airtable records
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
    const [stripeSubscriptions, airtableRecords] = await Promise.all([
      fetchStripeSubscriptions(sinceDate),
      fetchAirtableSponsorships(),
    ]);

    // Build lookup maps
    const stripeBySubId = new Map(stripeSubscriptions.map(s => [s.id, s]));
    const airtableBySubId = new Map(airtableRecords.map(r => [r.subscriptionId, r]));

    const mismatches: SubscriptionMismatch[] = [];

    // Check for Stripe subscriptions not in Airtable
    for (const stripeSub of stripeSubscriptions) {
      const airtableRecord = airtableBySubId.get(stripeSub.id);

      if (!airtableRecord) {
        // Only flag active subscriptions that are missing
        if (['active', 'trialing'].includes(stripeSub.status)) {
          mismatches.push({
            type: 'missing_in_airtable',
            subscriptionId: stripeSub.id,
            customerId: stripeSub.customerId,
            customerEmail: stripeSub.customerEmail,
            stripeStatus: stripeSub.status,
            stripeAmount: stripeSub.amount / 100,
            details: `Active Stripe subscription not found in Airtable`,
          });
        }
      } else {
        // Check for canceled subscriptions
        if (stripeSub.status === 'canceled' && airtableRecord.status === 'Succeeded') {
          mismatches.push({
            type: 'canceled_subscription',
            subscriptionId: stripeSub.id,
            customerEmail: stripeSub.customerEmail,
            sponsorCode: airtableRecord.sponsorCode,
            stripeStatus: stripeSub.status,
            airtableStatus: airtableRecord.status,
            details: `Subscription canceled in Stripe but Airtable record still shows active`,
          });
        }
      }
    }

    // Check for Airtable records with subscription IDs not in Stripe
    for (const airtableRecord of airtableRecords) {
      if (airtableRecord.subscriptionId && !stripeBySubId.has(airtableRecord.subscriptionId)) {
        mismatches.push({
          type: 'missing_in_stripe',
          subscriptionId: airtableRecord.subscriptionId,
          sponsorCode: airtableRecord.sponsorCode,
          customerEmail: airtableRecord.sponsorEmail,
          airtableStatus: airtableRecord.status,
          details: `Airtable record references subscription not found in Stripe`,
        });
      }
    }

    // Build summary
    const mismatchSummary = {
      missing_in_airtable: mismatches.filter(m => m.type === 'missing_in_airtable').length,
      missing_in_stripe: mismatches.filter(m => m.type === 'missing_in_stripe').length,
      status_mismatch: mismatches.filter(m => m.type === 'status_mismatch').length,
      canceled_subscription: mismatches.filter(m => m.type === 'canceled_subscription').length,
    };

    // 3. Log result
    logger.info('Subscription reconciliation complete', {
      stripeCount: stripeSubscriptions.length,
      airtableCount: airtableRecords.length,
      mismatchCount: mismatches.length,
      summary: mismatchSummary,
    });

    // 4. Return structured output
    return {
      success: true,
      data: {
        totalStripeSubscriptions: stripeSubscriptions.length,
        totalAirtableSponsorships: airtableRecords.length,
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
