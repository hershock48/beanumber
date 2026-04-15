/**
 * Publish Scheduled Posts Cron Job
 *
 * GET /api/cron/publish-scheduled
 *
 * Called by Vercel Cron every 15 minutes to publish due scheduled posts.
 * This endpoint is secured by the CRON_SECRET environment variable.
 *
 * Vercel sends the secret in the Authorization header as Bearer token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { publishDuePostsTool } from '@/lib/tools/social/publish-due-posts';
import { logger } from '@/lib/logger';

// ============================================================================
// CRON AUTH
// ============================================================================

function validateCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret configured, allow in development
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  // Vercel sends the secret as Bearer token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7) === cronSecret;
  }

  // Also check query param for manual testing
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === cronSecret;
}

// ============================================================================
// GET HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  // Validate cron authentication
  if (!validateCronAuth(request)) {
    logger.warn('Unauthorized cron request attempt');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    logger.info('Cron job started: publish-scheduled');

    const result = await publishDuePostsTool();

    if (!result.success) {
      logger.error('Cron job failed: publish-scheduled', { error: result.error });
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      );
    }

    logger.info('Cron job completed: publish-scheduled', {
      processed: result.data?.processed,
      published: result.data?.published,
      failed: result.data?.failed,
    });

    return NextResponse.json({
      success: true,
      message: 'Publish scheduled posts cron completed',
      data: {
        processed: result.data?.processed,
        published: result.data?.published,
        failed: result.data?.failed,
        tokenRefreshed: result.data?.tokenRefreshed,
      },
    });
  } catch (error) {
    logger.error('Cron job error: publish-scheduled', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// CONFIG
// ============================================================================

// Allow this route to run for up to 60 seconds (for video processing)
export const maxDuration = 60;

// Disable body parsing for GET requests
export const dynamic = 'force-dynamic';
