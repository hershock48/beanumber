/**
 * Health Check Links API
 * Checks all site links for broken routes
 *
 * Can be called:
 * - Manually for debugging
 * - As part of CI/CD pipeline
 * - Via cron for monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
} from '@/lib/errors';
import { checkLinksTool } from '@/lib/tools';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/health/links';

  logger.apiRequest(method, path);

  // Get optional parameters from query string
  const { searchParams } = new URL(request.url);
  const baseUrl = searchParams.get('baseUrl') || undefined;
  const includeApi = searchParams.get('includeApi') === 'true';
  const timeoutParam = searchParams.get('timeout');
  const timeout = timeoutParam ? parseInt(timeoutParam, 10) : undefined;

  // Use the WAT tool to check links
  const result = await checkLinksTool({
    baseUrl,
    includeApi,
    timeout,
  });

  if (!result.success) {
    logger.error('Link health check failed', { error: result.error });
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }

  logger.info('Link health check completed', {
    total: result.data?.summary.total,
    healthy: result.data?.summary.healthy,
    broken: result.data?.summary.broken,
  });

  logger.apiResponse(method, path, 200);

  // Return different status based on results
  const status = result.data?.summary.broken === 0 ? 200 : 207; // 207 = Multi-Status

  return NextResponse.json(
    {
      success: true,
      data: result.data,
      healthy: result.data?.summary.broken === 0,
    },
    { status }
  );
}

export const GET = withErrorHandling(handler, 'GET', '/api/health/links');
