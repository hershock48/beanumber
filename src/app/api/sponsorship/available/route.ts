/**
 * Available Children API
 * Lists children awaiting sponsors (PUBLIC - no auth required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
} from '@/lib/errors';
import { listAvailableChildrenTool } from '@/lib/tools';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/sponsorship/available';

  logger.apiRequest(method, path);

  // Parse query params
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  // Use the WAT tool to list available children
  const result = await listAvailableChildrenTool({ limit });

  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch available children');
  }

  logger.info('Listed available children', {
    total: result.data?.total,
    returned: result.data?.children.length,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse(result.data);
}

export const GET = withErrorHandling(handler, 'GET', '/api/sponsorship/available');
