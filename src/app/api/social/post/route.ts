/**
 * Social Media Post API
 *
 * POST /api/social/post
 *
 * Immediately posts content to Facebook and/or Instagram.
 * For scheduled posting, use /api/social/schedule instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { postToInstagramTool } from '@/lib/tools/social/post-to-instagram';
import { postToFacebookTool } from '@/lib/tools/social/post-to-facebook';
import { logger } from '@/lib/logger';
import { isMetaConfigured } from '@/lib/meta';
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

  // Check if Meta is configured
  if (!isMetaConfigured()) {
    return NextResponse.json(
      { error: 'Meta API is not configured. Please set META_* environment variables.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { platform, contentType, mediaUrl, caption, hashtags, link } = body;

    if (!platform) {
      return NextResponse.json(
        { error: 'platform is required (Instagram, Facebook, or Both)' },
        { status: 400 }
      );
    }

    // Build full caption with hashtags
    let fullCaption = caption || '';
    if (hashtags) {
      const tags = Array.isArray(hashtags) ? hashtags : hashtags.split(',');
      const formattedTags = tags.map((t: string) => t.trim().startsWith('#') ? t.trim() : `#${t.trim()}`).join(' ');
      fullCaption = fullCaption ? `${fullCaption}\n\n${formattedTags}` : formattedTags;
    }

    const results: {
      instagram?: { success: boolean; postId?: string; error?: string };
      facebook?: { success: boolean; postId?: string; error?: string };
    } = {};

    // Post to Instagram
    if (platform === 'Instagram' || platform === 'Both') {
      const igResult = await postToInstagramTool({
        contentType: contentType || 'IMAGE',
        mediaUrl,
        caption: fullCaption,
      });

      results.instagram = {
        success: igResult.success,
        postId: igResult.data?.postId,
        error: igResult.error,
      };
    }

    // Post to Facebook
    if (platform === 'Facebook' || platform === 'Both') {
      const fbResult = await postToFacebookTool({
        message: fullCaption,
        link,
        photoUrl: contentType === 'Image' ? mediaUrl : undefined,
        videoUrl: contentType === 'Video' || contentType === 'Reel' ? mediaUrl : undefined,
      });

      results.facebook = {
        success: fbResult.success,
        postId: fbResult.data?.postId,
        error: fbResult.error,
      };
    }

    // Determine overall success
    const anySuccess = (results.instagram?.success || results.facebook?.success);
    const allSuccess = (
      (!results.instagram || results.instagram.success) &&
      (!results.facebook || results.facebook.success)
    );

    logger.info('Social post API completed', {
      platform,
      anySuccess,
      allSuccess,
    });

    return NextResponse.json({
      success: allSuccess,
      partialSuccess: anySuccess && !allSuccess,
      results,
    });
  } catch (error) {
    logger.error('Social post API error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
