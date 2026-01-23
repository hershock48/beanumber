/**
 * Admin Overdue Updates API
 * Lists children who need updates (REQUIRES ADMIN AUTH)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { listOverdueTool } from '@/lib/tools';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/admin/updates/overdue';

  logger.apiRequest(method, path);

  // CRITICAL: Require admin authentication
  requireAdminAuth(request);

  // Get threshold from query params (default 90 days)
  const { searchParams } = new URL(request.url);
  const thresholdParam = searchParams.get('threshold');
  const thresholdDays = thresholdParam ? parseInt(thresholdParam, 10) : 90;

  if (isNaN(thresholdDays) || thresholdDays < 1) {
    throw new ValidationError('threshold must be a positive number');
  }

  // Use the WAT tool to get overdue updates
  const result = await listOverdueTool({ thresholdDays });

  if (!result.success) {
    throw new ValidationError(result.error!);
  }

  logger.info('Listed overdue updates for admin', {
    overdueCount: result.data?.overdueCount,
    totalActive: result.data?.totalActive,
    thresholdDays,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse(result.data);
}

export const GET = withErrorHandling(handler, 'GET', '/api/admin/updates/overdue');
