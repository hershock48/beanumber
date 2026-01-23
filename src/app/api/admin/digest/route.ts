/**
 * Admin Digest API
 * Sends admin digest email (REQUIRES ADMIN AUTH)
 *
 * Can be called manually or via cron job
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
import { sendAdminDigestTool } from '@/lib/tools';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/digest';

  logger.apiRequest(method, path);

  // CRITICAL: Require admin authentication
  requireAdminAuth(request);

  // Parse request body
  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new ValidationError(bodyResult.error!);
  }

  const { adminEmail, includeOverdue, overdueThresholdDays } = bodyResult.data as {
    adminEmail?: string;
    includeOverdue?: boolean;
    overdueThresholdDays?: number;
  };

  // Default admin email from env if not provided
  const email = adminEmail || process.env.ADMIN_EMAIL || 'Kevin@beanumber.org';

  // Use the WAT tool to send digest
  const result = await sendAdminDigestTool({
    adminEmail: email,
    includeOverdue,
    overdueThresholdDays,
  });

  if (!result.success) {
    throw new ValidationError(result.error!);
  }

  logger.info('Admin digest sent', {
    adminEmail: logger.maskEmail(email),
    summary: result.data?.summary,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse(result.data, 'Admin digest sent successfully');
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/digest');
