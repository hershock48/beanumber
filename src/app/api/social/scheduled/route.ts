/**
 * List/Manage Scheduled Posts API
 *
 * GET /api/social/scheduled - List scheduled posts
 * DELETE /api/social/scheduled - Cancel a scheduled post
 */

import { NextRequest, NextResponse } from 'next/server';
import { listScheduledPostsTool } from '@/lib/tools/social/list-scheduled-posts';
import { cancelScheduledPostTool } from '@/lib/tools/social/cancel-scheduled-post';
import { logger } from '@/lib/logger';
import { isAdminAuthConfigured, getAdminToken } from '@/lib/env';
import { ScheduledPostStatus } from '@/lib/types/airtable';

// ============================================================================
// AUTH
// ============================================================================

function validateAuth(request: NextRequest): boolean {
  if (!isAdminAuthConfigured()) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  return token === getAdminToken();
}

// ============================================================================
// GET HANDLER - List Scheduled Posts
// ============================================================================

export async function GET(request: NextRequest) {
  // Validate auth
  if (!validateAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const status = searchParams.get('status') as ScheduledPostStatus | null;
    const maxRecords = searchParams.get('maxRecords');
    const scheduledBefore = searchParams.get('scheduledBefore');
    const scheduledAfter = searchParams.get('scheduledAfter');

    const result = await listScheduledPostsTool({
      status: status || undefined,
      maxRecords: maxRecords ? parseInt(maxRecords, 10) : undefined,
      scheduledBefore: scheduledBefore || undefined,
      scheduledAfter: scheduledAfter || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      posts: result.data?.posts,
      count: result.data?.count,
    });
  } catch (error) {
    logger.error('List scheduled posts API error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE HANDLER - Cancel Scheduled Post
// ============================================================================

export async function DELETE(request: NextRequest) {
  // Validate auth
  if (!validateAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { recordId, reason, cancelledBy } = body;

    if (!recordId) {
      return NextResponse.json(
        { error: 'recordId is required' },
        { status: 400 }
      );
    }

    if (!cancelledBy) {
      return NextResponse.json(
        { error: 'cancelledBy is required (email address)' },
        { status: 400 }
      );
    }

    const result = await cancelScheduledPostTool({
      recordId,
      reason,
      cancelledBy,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    logger.info('Scheduled post cancelled via API', {
      recordId: result.data?.recordId,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    logger.error('Cancel scheduled post API error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
