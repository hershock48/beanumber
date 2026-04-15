/**
 * Schedule Social Media Post API
 *
 * POST /api/social/schedule
 *
 * Creates a scheduled post record for later publishing by the cron job.
 */

import { NextRequest, NextResponse } from 'next/server';
import { schedulePostTool } from '@/lib/tools/social/schedule-post';
import { logger } from '@/lib/logger';
import { isAdminAuthConfigured, getAdminToken } from '@/lib/env';

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
// POST HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  // Validate auth
  if (!validateAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    // Validate required fields
    const { platform, contentType, caption, scheduledAt, createdBy } = body;

    if (!platform) {
      return NextResponse.json(
        { error: 'platform is required (Instagram, Facebook, or Both)' },
        { status: 400 }
      );
    }

    if (!contentType) {
      return NextResponse.json(
        { error: 'contentType is required (Reel, Image, Carousel, Story, Video, Link)' },
        { status: 400 }
      );
    }

    if (!caption) {
      return NextResponse.json(
        { error: 'caption is required' },
        { status: 400 }
      );
    }

    if (!scheduledAt) {
      return NextResponse.json(
        { error: 'scheduledAt is required (ISO datetime string)' },
        { status: 400 }
      );
    }

    if (!createdBy) {
      return NextResponse.json(
        { error: 'createdBy is required (email address)' },
        { status: 400 }
      );
    }

    // Schedule the post
    const result = await schedulePostTool({
      platform,
      contentType,
      mediaDriveId: body.mediaDriveId,
      mediaUrl: body.mediaUrl,
      caption,
      hashtags: body.hashtags,
      scheduledAt,
      createdBy,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    logger.info('Post scheduled via API', {
      recordId: result.data?.recordId,
      scheduledAt: result.data?.scheduledAt,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    logger.error('Schedule post API error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
