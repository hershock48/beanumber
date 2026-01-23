# Implementation Guide for Remaining Improvements

This guide shows you exactly how to refactor each remaining API route using the new infrastructure.

## Table of Contents
1. [Sponsor Updates API](#1-sponsor-updates-api)
2. [Sponsor Request Update API](#2-sponsor-request-update-api)
3. [Sponsor Logout API](#3-sponsor-logout-api)
4. [Admin Updates Submit API](#4-admin-updates-submit-api-critical)
5. [Create Checkout API](#5-create-checkout-api)
6. [Stripe Webhook API](#6-stripe-webhook-api)

---

## 1. Sponsor Updates API

**File:** `src/app/api/sponsor/updates/route.ts`

### Current Issues
- No caching
- Direct Airtable calls
- Inconsistent error handling
- No logging

### Refactored Version

```typescript
/**
 * Sponsor Updates API
 * Retrieves child profile and published updates for authenticated sponsor
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedSponsorshipByCode,
  getCachedUpdatesForChild,
  sponsorshipToChildProfile,
  updateRecordToSponsorUpdate,
} from '@/lib/airtable';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling, NotFoundError } from '@/lib/errors';
import { requireAuth, verifySessionForCode } from '@/lib/auth';
import { validateRequiredString } from '@/lib/validation';
import { canRequestUpdate } from '@/lib/rate-limit';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/sponsor/updates';

  logger.apiRequest(method, path);

  // Get sponsor code from query params
  const sponsorCode = request.nextUrl.searchParams.get('sponsorCode');

  const validation = validateRequiredString(sponsorCode, 'Sponsor code', 1, 50);
  if (!validation.success) {
    throw new NotFoundError('Sponsor code required');
  }

  // Verify session matches sponsor code
  if (!(await verifySessionForCode(validation.data!))) {
    throw new AuthenticationError('Unauthorized');
  }

  // Get sponsorship data (cached)
  const sponsorship = await getCachedSponsorshipByCode(validation.data!);

  if (!sponsorship) {
    throw new NotFoundError('Sponsorship not found');
  }

  const fields = sponsorship.fields;
  const childId = fields.ChildID;

  // Get child profile
  const childInfo = sponsorshipToChildProfile(sponsorship);

  // Get updates for child (cached)
  const updateRecords = await getCachedUpdatesForChild(childId);
  const updates = updateRecords.map(updateRecordToSponsorUpdate);

  // Check if can request new update
  const requestEligibility = canRequestUpdate(
    fields.LastRequestAt,
    fields.NextRequestEligibleAt
  );

  logger.info('Sponsor updates retrieved', {
    sponsorCode: logger.maskSponsorCode(validation.data!),
    updateCount: updates.length,
    canRequestUpdate: requestEligibility.canRequest,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse({
    updates,
    childInfo,
    lastRequestDate: fields.LastRequestAt || null,
    nextRequestEligibleAt: fields.NextRequestEligibleAt || null,
    canRequestUpdate: requestEligibility.canRequest,
    daysUntilEligible: requestEligibility.daysRemaining,
  });
}

export const GET = withErrorHandling(handler, 'GET', '/api/sponsor/updates');
```

---

## 2. Sponsor Request Update API

**File:** `src/app/api/sponsor/request-update/route.ts`

### Current Issues
- No rate limiting
- Inconsistent throttling logic
- No input validation

### Refactored Version

```typescript
/**
 * Sponsor Request Update API
 * Allows sponsors to request new updates (90-day throttle)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createUpdateRequest,
  findSponsorshipByCode,
  updateSponsorshipRequestTracking,
} from '@/lib/airtable';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  ValidationError,
  RateLimitError,
} from '@/lib/errors';
import { verifySessionForCode } from '@/lib/auth';
import { parseRequestBody, validateRequiredString, validateEmail } from '@/lib/validation';
import { checkUpdateRequestRateLimit, canRequestUpdate, calculateNextEligibleDate } from '@/lib/rate-limit';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '@/lib/constants';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/sponsor/request-update';

  logger.apiRequest(method, path);

  // Rate limiting (IP-based)
  const rateLimitError = checkUpdateRequestRateLimit(request);
  if (rateLimitError) {
    throw rateLimitError;
  }

  // Parse request body
  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new ValidationError(bodyResult.error!);
  }

  const body = bodyResult.data as any;

  // Validate inputs
  const codeValidation = validateRequiredString(body.sponsorCode, 'Sponsor code');
  const emailValidation = validateEmail(body.email);

  if (!codeValidation.success) throw new ValidationError(codeValidation.error!);
  if (!emailValidation.success) throw new ValidationError(emailValidation.error!);

  const sponsorCode = codeValidation.data!;
  const email = emailValidation.data!;

  // Verify session
  if (!(await verifySessionForCode(sponsorCode))) {
    throw new AuthenticationError('Unauthorized');
  }

  // Get sponsorship
  const sponsorship = await findSponsorshipByCode(sponsorCode);
  if (!sponsorship) {
    throw new NotFoundError('Sponsorship not found');
  }

  const fields = sponsorship.fields;

  // Check 90-day throttle
  const eligibility = canRequestUpdate(
    fields.LastRequestAt,
    fields.NextRequestEligibleAt
  );

  if (!eligibility.canRequest) {
    throw new RateLimitError(
      ERROR_MESSAGES.UPDATE_REQUEST_THROTTLED(eligibility.daysRemaining || 0)
    );
  }

  // Create update request
  await createUpdateRequest(fields.ChildID, sponsorCode);

  // Update sponsorship tracking
  const now = new Date();
  const nextEligible = calculateNextEligibleDate(now);

  await updateSponsorshipRequestTracking(
    sponsorship.id,
    now.toISOString(),
    nextEligible.toISOString()
  );

  logger.info('Update requested by sponsor', {
    sponsorCode: logger.maskSponsorCode(sponsorCode),
    email: logger.maskEmail(email),
    nextEligible: nextEligible.toISOString(),
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse(
    { nextEligibleAt: nextEligible.toISOString() },
    SUCCESS_MESSAGES.UPDATE_REQUESTED
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/sponsor/request-update');
```

---

## 3. Sponsor Logout API

**File:** `src/app/api/sponsor/logout/route.ts`

### Current Issues
- Hardcoded redirect URL
- No logging

### Refactored Version

```typescript
/**
 * Sponsor Logout API
 * Clears sponsor session and redirects to login
 */

import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { ROUTES } from '@/lib/constants';

export async function POST() {
  logger.info('Sponsor logout requested');

  await clearSession();

  logger.info('Sponsor logout successful');

  return NextResponse.redirect(
    new URL(
      ROUTES.SPONSOR_LOGIN,
      process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'
    )
  );
}
```

---

## 4. Admin Updates Submit API (CRITICAL!)

**File:** `src/app/api/admin/updates/submit/route.ts`

### Current Issues
- **NO AUTHENTICATION** - Anyone can submit updates!
- No rate limiting
- No validation
- Direct Airtable calls

### Refactored Version

```typescript
/**
 * Admin Updates Submit API
 * Allows field team to submit updates (REQUIRES ADMIN AUTH)
 */

import { NextRequest, NextResponse } from 'next/server';
import { submitUpdate } from '@/lib/airtable';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  createdResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { validateUpdateSubmission, parseRequestBody } from '@/lib/validation';
import { checkUpdateSubmissionRateLimit } from '@/lib/rate-limit';
import { SUCCESS_MESSAGES } from '@/lib/constants';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/updates/submit';

  logger.apiRequest(method, path);

  // CRITICAL: Require admin authentication
  requireAdminAuth(request);

  // Rate limiting
  const rateLimitError = checkUpdateSubmissionRateLimit(request);
  if (rateLimitError) {
    throw rateLimitError;
  }

  // Parse request body (handle both JSON and FormData)
  let data: any;

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const bodyResult = await parseRequestBody(request);
    if (!bodyResult.success) {
      throw new ValidationError(bodyResult.error!);
    }
    data = bodyResult.data;
  } else if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    data = {
      sponsorCode: formData.get('sponsorCode'),
      updateType: formData.get('updateType'),
      title: formData.get('title'),
      content: formData.get('content'),
      submittedBy: formData.get('submittedBy'),
      // Note: Photo upload handling would go here
    };
  } else {
    throw new ValidationError('Invalid content type');
  }

  // Validate input
  const validation = validateUpdateSubmission(data);
  if (!validation.success) {
    throw new ValidationError(validation.error!);
  }

  const updateData = validation.data!;

  // Submit update to Airtable
  const record = await submitUpdate(updateData);

  logger.info('Update submitted by admin', {
    updateId: record.id,
    childId: updateData.childId,
    type: updateData.updateType,
    submittedBy: updateData.submittedBy,
  });

  logger.apiResponse(method, path, 201);

  return createdResponse(
    { updateId: record.id },
    SUCCESS_MESSAGES.UPDATE_SUBMITTED
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/updates/submit');
```

### Environment Setup for Admin Auth

Add to `.env.local` and Vercel:
```bash
# Generate a secure random token:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_API_TOKEN=your_secure_random_token_here
```

### Usage
Field team must include header:
```bash
curl -X POST https://www.beanumber.org/api/admin/updates/submit \
  -H "X-Admin-Token: your_secure_random_token_here" \
  -H "Content-Type: application/json" \
  -d '{"childId":"...","title":"...","content":"...","submittedBy":"...","updateType":"..."}'
```

---

## 5. Create Checkout API

**File:** `src/app/api/create-checkout/route.ts`

### Current Issues
- No rate limiting
- Minimal validation
- No logging

### Refactored Version

```typescript
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
                ? `Thank you for changing lives. Your monthly gift of $${(amount / 100).toFixed(2)} supports sustainable community systems in Northern Uganda.`
                : `Thank you for changing lives. Your contribution of $${(amount / 100).toFixed(2)} supports sustainable community systems in Northern Uganda.`,
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
    };

    if (recurring) {
      sessionConfig.subscription_data = {
        metadata: {
          donation_type: 'monthly',
          amount: (amount / 100).toString(),
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
```

---

## 6. Stripe Webhook API

**File:** `src/app/api/webhooks/stripe/route.ts`

### Current Issues
- No retry logic
- Inconsistent error handling
- No logging

### Refactored Implementation (Outline)

```typescript
/**
 * Stripe Webhook Handler
 * Processes Stripe events and updates Airtable
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { getStripeConfig } from '@/lib/env';
import { STRIPE } from '@/lib/constants';

// Key improvements needed:
// 1. Wrap Airtable updates in try-catch with retry logic
// 2. Log all events comprehensively
// 3. Handle all webhook events properly
// 4. Send email notifications (when implemented)
// 5. Return 200 even if non-critical operations fail

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    logger.error('Missing Stripe signature');
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  const config = getStripeConfig();
  const stripe = new Stripe(config.secretKey, { apiVersion: STRIPE.API_VERSION });

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      config.webhookSecret
    );

    logger.payment('webhook_received', {
      type: event.type,
      id: event.id,
    });

    // Handle each event type
    switch (event.type) {
      case STRIPE.WEBHOOK_EVENTS.CHECKOUT_COMPLETED:
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case STRIPE.WEBHOOK_EVENTS.SUBSCRIPTION_CREATED:
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case STRIPE.WEBHOOK_EVENTS.SUBSCRIPTION_UPDATED:
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case STRIPE.WEBHOOK_EVENTS.INVOICE_PAYMENT_SUCCEEDED:
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      default:
        logger.info(`Unhandled webhook event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing failed', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }
}

// Implement handlers with retry logic and email notifications
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Update Airtable with retry logic
  // Send donation receipt email
  // Log success/failure
}

// ... other handlers
```

---

## Implementation Checklist

### Priority 1: Security (Do ASAP)
- [ ] Implement admin authentication
- [ ] Add rate limiting to all routes
- [ ] Deploy security updates

### Priority 2: Core Features
- [ ] Refactor sponsor updates API
- [ ] Refactor sponsor request-update API
- [ ] Refactor sponsor logout API
- [ ] Test all sponsor flows end-to-end

### Priority 3: Payments
- [ ] Refactor create-checkout API
- [ ] Refactor Stripe webhook with retry logic
- [ ] Test donation flow

### Priority 4: User Experience
- [ ] Add SendGrid email service
- [ ] Add Error Boundaries
- [ ] Add loading states
- [ ] Test on mobile

### Priority 5: Monitoring
- [ ] Add analytics integration
- [ ] Set up error tracking (Sentry)
- [ ] Monitor logs in production

---

## Testing After Implementation

### Manual Testing
1. **Login Flow**
   - Try valid credentials → Should succeed
   - Try invalid credentials → Should fail with error
   - Try 6 failed attempts → Should rate limit

2. **Sponsor Dashboard**
   - View updates → Should load cached data
   - Request update (before 90 days) → Should fail
   - Request update (after eligible) → Should succeed

3. **Admin Updates**
   - Submit without token → Should fail (401)
   - Submit with token → Should succeed

4. **Donations**
   - Create checkout → Should redirect to Stripe
   - Complete payment → Webhook should update Airtable

### Automated Testing (Future)
Consider adding Jest tests for:
- Validation functions
- Rate limiting logic
- Session management
- Error handling

---

## Deployment Steps

1. **Update Environment Variables in Vercel**
```bash
ADMIN_API_TOKEN=<generate-secure-token>
SENDGRID_API_KEY=<your-key>
NEXT_PUBLIC_GA_MEASUREMENT_ID=<your-id>
```

2. **Deploy to Vercel**
```bash
git add .
git commit -m "Implement security and reliability improvements"
git push origin main
```

3. **Verify in Production**
- Check logs in Vercel dashboard
- Test login flow
- Test donation flow
- Monitor for errors

4. **Share Admin Token with Field Team**
- Send token securely (not via email!)
- Update their scripts/tools
- Document usage

---

## Need Help?

If you encounter issues:
1. Check Vercel logs for errors
2. Verify environment variables are set
3. Test locally first with `npm run dev`
4. Check Airtable API quotas
5. Review this guide's examples

All the infrastructure is ready - just follow these patterns for each route!
