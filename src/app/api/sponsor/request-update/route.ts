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
  NotFoundError,
  AuthenticationError,
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
