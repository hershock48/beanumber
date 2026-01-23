/**
 * Admin Publish Update API
 * Publishes a pending update (REQUIRES ADMIN AUTH)
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
import { publishUpdateTool } from '@/lib/tools';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/updates/publish';

  logger.apiRequest(method, path);

  // CRITICAL: Require admin authentication
  requireAdminAuth(request);

  // Parse request body
  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new ValidationError(bodyResult.error!);
  }

  const { updateId } = bodyResult.data as { updateId: string };

  if (!updateId) {
    throw new ValidationError('updateId is required');
  }

  // Use the WAT tool to publish the update
  const result = await publishUpdateTool({ updateId });

  if (!result.success) {
    throw new ValidationError(result.error!);
  }

  logger.info('Update published by admin', {
    updateId: result.data?.updateId,
    childId: result.data?.childId,
    title: result.data?.title,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse({
    updateId: result.data?.updateId,
    childId: result.data?.childId,
    title: result.data?.title,
    publishedAt: result.data?.publishedAt,
    sponsorNotificationReady: !!result.data?.sponsorEmail,
    sponsor: result.data?.sponsorEmail ? {
      email: result.data.sponsorEmail,
      name: result.data.sponsorName,
      code: result.data.sponsorCode,
    } : null,
  }, 'Update published successfully');
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/updates/publish');
