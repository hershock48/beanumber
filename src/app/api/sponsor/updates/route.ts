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
import { createSuccessResponse, withErrorHandling, NotFoundError, AuthenticationError } from '@/lib/errors';
import { verifySessionForCode } from '@/lib/auth';
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
