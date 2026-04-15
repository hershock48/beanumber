/**
 * Post to Instagram Tool
 *
 * Posts content (images, reels, carousels) to Instagram via Meta Graph API.
 *
 * Workflow: social/post-to-instagram.md
 *
 * Requirements:
 * - Instagram Business Account (not Personal/Creator)
 * - Facebook Page linked to Instagram
 * - Meta App with instagram_content_publish permission
 * - Valid long-lived access token
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import {
  isMetaConfigured,
  postToInstagram,
  InstagramMediaType,
  InstagramPublishResult,
} from '../../meta';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

export interface PostToInstagramInput {
  /** Type of content: IMAGE, VIDEO, REELS, STORIES, CAROUSEL_ALBUM */
  contentType: InstagramMediaType;
  /** Public URL to the media file (must be accessible by Meta servers) */
  mediaUrl: string;
  /** Caption text (max 2200 characters for Instagram) */
  caption?: string;
  /** Cover image URL for reels */
  coverUrl?: string;
  /** For reels: also show in feed (default: true) */
  shareToFeed?: boolean;
  /** For carousels: child media items */
  carouselItems?: Array<{
    mediaUrl: string;
    type: 'IMAGE' | 'VIDEO';
  }>;
}

export interface PostToInstagramOutput {
  success: boolean;
  data?: {
    postId: string;
    permalink?: string;
  };
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

const MAX_CAPTION_LENGTH = 2200;
const MAX_HASHTAGS = 30;

function validateInput(input: unknown): ValidationResult<PostToInstagramInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate contentType
  const validTypes: InstagramMediaType[] = ['IMAGE', 'VIDEO', 'REELS', 'STORIES', 'CAROUSEL_ALBUM'];
  if (!obj.contentType || !validTypes.includes(obj.contentType as InstagramMediaType)) {
    return failure(`Invalid contentType: must be one of ${validTypes.join(', ')}`);
  }

  // Validate mediaUrl
  if (typeof obj.mediaUrl !== 'string' || !obj.mediaUrl.startsWith('http')) {
    return failure('Invalid mediaUrl: must be a valid HTTP/HTTPS URL');
  }

  // Validate caption length
  if (obj.caption && typeof obj.caption === 'string') {
    if (obj.caption.length > MAX_CAPTION_LENGTH) {
      return failure(`Caption exceeds maximum length of ${MAX_CAPTION_LENGTH} characters`);
    }

    // Count hashtags
    const hashtagCount = (obj.caption.match(/#\w+/g) || []).length;
    if (hashtagCount > MAX_HASHTAGS) {
      return failure(`Too many hashtags: ${hashtagCount}. Maximum is ${MAX_HASHTAGS}`);
    }
  }

  // Validate carousel items
  if (obj.contentType === 'CAROUSEL_ALBUM') {
    if (!Array.isArray(obj.carouselItems) || obj.carouselItems.length < 2) {
      return failure('Carousel requires at least 2 items in carouselItems array');
    }
    if (obj.carouselItems.length > 10) {
      return failure('Carousel cannot have more than 10 items');
    }
  }

  return success({
    contentType: obj.contentType as InstagramMediaType,
    mediaUrl: obj.mediaUrl as string,
    caption: obj.caption as string | undefined,
    coverUrl: obj.coverUrl as string | undefined,
    shareToFeed: obj.shareToFeed as boolean | undefined,
    carouselItems: obj.carouselItems as Array<{ mediaUrl: string; type: 'IMAGE' | 'VIDEO' }> | undefined,
  });
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Post content to Instagram
 *
 * @param input - Content to post (type, URL, caption)
 * @returns Post ID and permalink on success
 *
 * @example
 * const result = await postToInstagramTool({
 *   contentType: 'REELS',
 *   mediaUrl: 'https://example.com/video.mp4',
 *   caption: 'Check out our latest impact! #nonprofit #impact',
 *   shareToFeed: true,
 * });
 */
export async function postToInstagramTool(
  input: unknown
): Promise<PostToInstagramOutput> {
  // Check if Meta is configured
  if (!isMetaConfigured()) {
    logger.warn('Post to Instagram attempted but Meta API is not configured');
    return {
      success: false,
      error: 'Meta API is not configured. Please set META_* environment variables.',
    };
  }

  // Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('Post to Instagram validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { contentType, mediaUrl, caption, coverUrl, shareToFeed, carouselItems } = validated.data!;

  try {
    logger.info('Posting to Instagram', {
      contentType,
      hasCaption: !!caption,
      captionLength: caption?.length,
    });

    // Post to Instagram
    const result = await postToInstagram({
      type: contentType,
      mediaUrl,
      caption,
      coverUrl,
      shareToFeed: shareToFeed ?? true, // Default to sharing reels in feed
      children: carouselItems,
    });

    if (!result.success || !result.data) {
      logger.error('Failed to post to Instagram', { error: result.error });
      return {
        success: false,
        error: result.error || 'Failed to post to Instagram',
      };
    }

    logger.info('Successfully posted to Instagram', {
      postId: result.data.id,
      permalink: result.data.permalink,
    });

    return {
      success: true,
      data: {
        postId: result.data.id,
        permalink: result.data.permalink,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Post to Instagram tool error', error, { contentType });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
