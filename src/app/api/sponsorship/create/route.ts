/**
 * Create Sponsorship API
 * Creates a new sponsorship (REQUIRES ADMIN AUTH)
 *
 * This endpoint assigns a sponsor to an available child.
 * Typically called after Stripe payment confirmation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { parseRequestBody } from '@/lib/validation';
import { createSponsorshipTool } from '@/lib/tools';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/sponsorship/create';

  logger.apiRequest(method, path);

  // CRITICAL: Require admin authentication
  requireAdminAuth(request);

  // Parse request body
  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new ValidationError(bodyResult.error!);
  }

  const { recordId, sponsorEmail, sponsorName } = bodyResult.data as {
    recordId: string;
    sponsorEmail: string;
    sponsorName?: string;
  };

  // Use the WAT tool to create sponsorship
  const result = await createSponsorshipTool({
    recordId,
    sponsorEmail,
    sponsorName,
  });

  if (!result.success) {
    throw new ValidationError(result.error!);
  }

  logger.info('Sponsorship created via API', {
    sponsorCode: result.data?.sponsorCode,
    childId: result.data?.childId,
    email: logger.maskEmail(sponsorEmail),
  });

  logger.apiResponse(method, path, 201);

  return createSuccessResponse(result.data, 'Sponsorship created successfully');
}

export const POST = withErrorHandling(handler, 'POST', '/api/sponsorship/create');
