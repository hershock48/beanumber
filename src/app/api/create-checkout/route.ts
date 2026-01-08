/**
 * Create Stripe Checkout Session API
 * Creates checkout session for donations
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  PaymentError,
} from '@/lib/errors';
import { validateDonationRequest, parseRequestBody } from '@/lib/validation';
import { checkCheckoutRateLimit } from '@/lib/rate-limit';
import { STRIPE } from '@/lib/constants';
import { getStripeConfig } from '@/lib/env';

// Initialize Stripe lazily
async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const config = getStripeConfig();
  return new StripeModule(config.secretKey, {
    apiVersion: STRIPE.API_VERSION,
  });
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/create-checkout';

  logger.apiRequest(method, path);

  // Rate limiting
  const rateLimitError = checkCheckoutRateLimit(request);
  if (rateLimitError) {
    throw rateLimitError;
  }

  // Parse and validate request
  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new PaymentError(bodyResult.error);
  }

  const validation = validateDonationRequest(bodyResult.data);
  if (!validation.success) {
    throw new PaymentError(validation.error);
  }

  const { amount, recurring, email } = validation.data!;

  // Get origin for redirect URLs
  const origin = request.headers.get('origin') || 'https://www.beanumber.org';

  // Create Stripe session
  const stripe = await getStripe();

  const mode = recurring ? 'subscription' : 'payment';
  const donationType = recurring ? 'monthly' : 'one-time';
  const displayAmount = (amount / 100).toFixed(2);

  try {
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: STRIPE.CURRENCY,
            product_data: {
              name: recurring
                ? 'Monthly Donation to Be A Number, International'
                : 'Donation to Be A Number, International',
              description: recurring
                ? `Thank you for changing lives. Your monthly gift of $${displayAmount} supports sustainable community systems in Northern Uganda — healthcare, education, workforce development, and economic empowerment that transform communities.`
                : `Thank you for changing lives. Your contribution of $${displayAmount} supports sustainable community systems in Northern Uganda — healthcare, education, workforce development, and economic empowerment that transform communities.`,
            },
            unit_amount: amount, // Already in cents
            recurring: recurring ? { interval: 'month' } : undefined,
          },
          quantity: 1,
        },
      ],
      mode: mode as 'payment' | 'subscription',
      success_url: `${origin}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/donate?canceled=1`,
      customer_email: email,
      metadata: {
        donation_type: donationType,
      },
      billing_address_collection: 'required',
      custom_fields: [
        {
          key: 'organization',
          label: {
            type: 'custom',
            custom: 'Organization Name (if applicable)',
          },
          type: 'text',
          optional: true,
        },
      ],
    };

    if (recurring) {
      sessionConfig.subscription_data = {
        metadata: {
          donation_type: 'monthly',
          amount: displayAmount,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logger.payment('checkout_created', {
      sessionId: session.id,
      amount,
      recurring,
      email: email ? logger.maskEmail(email) : undefined,
    });

    logger.apiResponse(method, path, 200);

    return createSuccessResponse({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error('Stripe checkout creation failed', error);
    throw new PaymentError('Failed to create checkout session');
  }
}

export const POST = withErrorHandling(handler, 'POST', '/api/create-checkout');
