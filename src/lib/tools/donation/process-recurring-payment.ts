/**
 * Process Recurring Payment Tool
 *
 * WAT-compliant tool for processing recurring subscription payments.
 * Records the renewal as a donations row in Postgres and sends a
 * follow-up thank-you email.
 *
 * Until 2026-09-14 the renewal was recorded only in Airtable. Airtable
 * was retired in August 2026, so every monthly renewal since then had
 * no record in the source of truth. This is the Postgres version.
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { sendRecurringDonationThankYouEmail, EmailSendResult } from '../../email';
import { recordDonation, upsertDonorByEmail } from '../../db/mutations';
import {
  getChildByRecordId,
  getDonorByStripeCustomerId,
  getSponsorshipByStripeSubscriptionId,
} from '../../db/queries';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for processing recurring payment
 */
export interface ProcessRecurringPaymentInput {
  /** Stripe invoice ID */
  invoiceId: string;
  /**
   * Stripe payment intent ID for the invoice, when Stripe provides one.
   * Preferred as the donations natural key so a later charge.refunded
   * (which carries the payment intent, not the invoice) finds the row.
   */
  paymentIntentId?: string;
  /** Stripe subscription ID */
  subscriptionId: string;
  /** Stripe customer ID */
  customerId: string;
  /** Customer email */
  email: string;
  /** Customer name */
  name: string;
  /** Payment amount in cents */
  amountCents: number;
  /** Currency (e.g., 'usd') */
  currency: string;
  /** Payment date ISO string */
  paymentDate: string;
  /** Billing reason from Stripe */
  billingReason: string;
}

/**
 * Output schema
 */
export interface ProcessRecurringPaymentOutput {
  success: boolean;
  data?: {
    invoiceId: string;
    donationId?: string;
    emailSent: boolean;
    emailProvider?: string;
    skipped?: boolean;
    skipReason?: string;
  };
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate tool input
 */
function validateInput(input: unknown): ValidationResult<ProcessRecurringPaymentInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.invoiceId !== 'string' || !obj.invoiceId) {
    return failure('Invalid input: invoiceId is required');
  }
  if (typeof obj.subscriptionId !== 'string' || !obj.subscriptionId) {
    return failure('Invalid input: subscriptionId is required');
  }
  if (typeof obj.customerId !== 'string' || !obj.customerId) {
    return failure('Invalid input: customerId is required');
  }
  if (typeof obj.email !== 'string' || !obj.email) {
    return failure('Invalid input: email is required');
  }
  if (typeof obj.name !== 'string') {
    return failure('Invalid input: name is required');
  }
  if (typeof obj.amountCents !== 'number' || obj.amountCents < 0) {
    return failure('Invalid input: amountCents must be a positive number');
  }
  if (typeof obj.currency !== 'string' || !obj.currency) {
    return failure('Invalid input: currency is required');
  }
  if (typeof obj.paymentDate !== 'string' || !obj.paymentDate) {
    return failure('Invalid input: paymentDate is required');
  }
  if (typeof obj.billingReason !== 'string' || !obj.billingReason) {
    return failure('Invalid input: billingReason is required');
  }

  return success({
    invoiceId: obj.invoiceId,
    paymentIntentId:
      typeof obj.paymentIntentId === 'string' && obj.paymentIntentId
        ? obj.paymentIntentId
        : undefined,
    subscriptionId: obj.subscriptionId,
    customerId: obj.customerId,
    email: obj.email,
    name: obj.name || 'Supporter',
    amountCents: obj.amountCents,
    currency: obj.currency,
    paymentDate: obj.paymentDate,
    billingReason: obj.billingReason,
  });
}

// ============================================================================
// POSTGRES HELPERS
// ============================================================================

/**
 * Resolve the sponsor's child context (display name + shirt number) from
 * a Stripe subscription ID. Returns null when the subscription isn't tied
 * to a sponsorship (a plain recurring donation). Best-effort: any failure
 * returns null so the renewal email still goes out, in donor flavor.
 */
async function resolveSponsorChildContext(
  subscriptionId: string
): Promise<{ childName: string | null; shirtNumber: number | null } | null> {
  try {
    const sponsorship = await getSponsorshipByStripeSubscriptionId(subscriptionId);
    if (!sponsorship) return null;

    const childName: string | null = sponsorship.childDisplayName || null;

    // The number the sponsor holds beats the kid's roster number: a
    // cycle-number claim (#70) is what is on their shirt.
    let shirtNumber: number | null = sponsorship.claimedShirtNumber ?? null;
    if (shirtNumber == null && sponsorship.childId) {
      const child = await getChildByRecordId(sponsorship.childId);
      if (child && typeof child.shirtNumber === 'number') shirtNumber = child.shirtNumber;
    }

    return { childName, shirtNumber };
  } catch {
    return null;
  }
}

/**
 * Record the renewal in Postgres. Idempotent on the payment intent (or
 * invoice id when Stripe gave us no intent), so a webhook retry is a
 * no-op. Returns the donations row id.
 */
async function recordRecurringDonation(data: ProcessRecurringPaymentInput): Promise<string | null> {
  // Donor: prefer the Stripe customer link, fall back to email (creating
  // the row if this is the first time we have seen them).
  const byCustomer = await getDonorByStripeCustomerId(data.customerId);
  const donor =
    byCustomer ??
    (await upsertDonorByEmail({
      email: data.email,
      name: data.name || null,
      stripeCustomerId: data.customerId,
    }));

  // If this subscription is a sponsorship, tag the donation to the kid.
  let sponsorship: Awaited<ReturnType<typeof getSponsorshipByStripeSubscriptionId>> = null;
  try {
    sponsorship = await getSponsorshipByStripeSubscriptionId(data.subscriptionId);
  } catch (error) {
    logger.warn('Could not resolve sponsorship for subscription (continuing)', {
      subscriptionId: data.subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const note = sponsorship?.childDisplayName
    ? `Sponsorship renewal for ${sponsorship.childDisplayName} (${data.subscriptionId}, invoice ${data.invoiceId})`
    : `Monthly renewal (${data.subscriptionId}, invoice ${data.invoiceId})`;

  const donation = await recordDonation({
    donorId: donor.id,
    donationAmount: data.amountCents / 100,
    currency: data.currency.toLowerCase(),
    donationSource: sponsorship ? 'Sponsorship' : 'Website - Recurring',
    paymentStatus: 'Succeeded',
    recurringDonation: true,
    stripePaymentIntentId: data.paymentIntentId || data.invoiceId,
    stripeCustomerId: data.customerId,
    donorEmailAtDonation: data.email,
    donationNote: note,
    designatedToChildIds: sponsorship?.childId ? [sponsorship.childId] : [],
    donationDate: data.paymentDate.slice(0, 10),
  });

  return donation.id;
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Process a recurring subscription payment
 *
 * This tool:
 * 1. Validates the payment is a subscription renewal (not initial payment)
 * 2. Records the donation in Postgres
 * 3. Sends a follow-up thank-you email
 *
 * @param input - Payment details from Stripe invoice
 * @returns Processing result
 */
export async function processRecurringPaymentTool(
  input: unknown
): Promise<ProcessRecurringPaymentOutput> {
  // 1. Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('process-recurring-payment validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const data = validated.data!;

  // 2. Skip if not a subscription renewal
  // billing_reason can be: 'subscription_cycle', 'subscription_create', 'subscription_update', etc.
  // The first invoice is recorded by checkout.session.completed.
  if (data.billingReason !== 'subscription_cycle') {
    logger.info('Skipping non-renewal invoice', {
      invoiceId: data.invoiceId,
      billingReason: data.billingReason,
    });
    return {
      success: true,
      data: {
        invoiceId: data.invoiceId,
        emailSent: false,
        skipped: true,
        skipReason: `Not a subscription renewal (billing_reason: ${data.billingReason})`,
      },
    };
  }

  // 3. Execute action
  try {
    logger.debug('Processing recurring payment', {
      invoiceId: data.invoiceId,
      subscriptionId: data.subscriptionId,
      amount: data.amountCents / 100,
      email: logger.maskEmail(data.email),
    });

    // Record in Postgres
    let donationId: string | null = null;
    try {
      donationId = await recordRecurringDonation(data);
    } catch (error) {
      logger.error('Failed to record recurring donation', error, {
        invoiceId: data.invoiceId,
      });
      // Continue with the email even if the write fails; the money moved.
    }

    // Send follow-up thank-you email
    let emailSent = false;
    let emailProvider: string | undefined;

    try {
      // If this subscription is a sponsorship, the renewal email gets the
      // kid's-page flavor; otherwise it stays a plain donation thank-you.
      const sponsorContext = await resolveSponsorChildContext(data.subscriptionId);

      const emailResult: EmailSendResult = await sendRecurringDonationThankYouEmail(
        data.email,
        data.name,
        data.amountCents / 100,
        data.currency,
        sponsorContext ?? undefined
      );

      if (emailResult.success) {
        emailSent = true;
        emailProvider = emailResult.data?.provider;
      } else {
        logger.warn('Failed to send recurring donation email', {
          error: emailResult.error,
        });
      }
    } catch (error) {
      logger.error('Email send threw exception', error);
    }

    // 4. Log success
    logger.info('Processed recurring payment', {
      invoiceId: data.invoiceId,
      donationId,
      emailSent,
      emailProvider,
    });

    // 5. Return structured output
    return {
      success: true,
      data: {
        invoiceId: data.invoiceId,
        donationId: donationId || undefined,
        emailSent,
        emailProvider,
      },
    };
  } catch (error) {
    // 6. Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('process-recurring-payment failed', error, {
      invoiceId: data.invoiceId,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
