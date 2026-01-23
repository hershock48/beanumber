/**
 * Process Recurring Payment Tool
 *
 * WAT-compliant tool for processing recurring subscription payments.
 * Records the payment in Airtable and sends a follow-up thank-you email.
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { sendRecurringDonationThankYouEmail, EmailSendResult } from '../../email';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for processing recurring payment
 */
export interface ProcessRecurringPaymentInput {
  /** Stripe invoice ID */
  invoiceId: string;
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
// AIRTABLE HELPERS
// ============================================================================

/**
 * Record recurring donation in Airtable
 */
async function recordRecurringDonation(data: ProcessRecurringPaymentInput): Promise<string | null> {
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    logger.warn('Airtable not configured, skipping donation record');
    return null;
  }

  // Check if donation already exists (idempotency via invoice ID)
  const formula = `{Stripe Payment Intent ID} = "${data.invoiceId}"`;
  const searchResponse = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
    {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.records && searchData.records.length > 0) {
      logger.info('Recurring donation already recorded', { invoiceId: data.invoiceId });
      return searchData.records[0].id;
    }
  }

  // Find donor by Stripe customer ID
  const AIRTABLE_DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
  const donorFormula = `{Stripe Customer ID} = "${data.customerId}"`;
  const donorResponse = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(donorFormula)}`,
    {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  let donorId: string | null = null;
  if (donorResponse.ok) {
    const donorData = await donorResponse.json();
    if (donorData.records && donorData.records.length > 0) {
      donorId = donorData.records[0].id;
    }
  }

  // Create donation record
  const donationFields: Record<string, unknown> = {
    'Stripe Payment Intent ID': data.invoiceId, // Use invoice ID for recurring
    'Stripe Customer ID': data.customerId,
    'Donation Amount': data.amountCents / 100,
    'Currency': data.currency.toUpperCase(),
    'Donation Date': data.paymentDate,
    'Payment Status': 'Succeeded',
    'Recurring Donation': true,
    'Subscription ID': data.subscriptionId,
    'Donor Email at Donation': data.email,
    'Donation Source': 'Website - Recurring',
  };

  if (donorId) {
    donationFields['Donor'] = [donorId];
  }

  const createResponse = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: donationFields }),
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create donation record: ${error}`);
  }

  const createData = await createResponse.json();
  return createData.id;
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Process a recurring subscription payment
 *
 * This tool:
 * 1. Validates the payment is a subscription renewal (not initial payment)
 * 2. Records the donation in Airtable
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

    // Record in Airtable
    let donationId: string | null = null;
    try {
      donationId = await recordRecurringDonation(data);
    } catch (error) {
      logger.error('Failed to record recurring donation', error, {
        invoiceId: data.invoiceId,
      });
      // Continue with email even if Airtable fails
    }

    // Send follow-up thank-you email
    let emailSent = false;
    let emailProvider: string | undefined;

    try {
      const emailResult: EmailSendResult = await sendRecurringDonationThankYouEmail(
        data.email,
        data.name,
        data.amountCents / 100,
        data.currency
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
