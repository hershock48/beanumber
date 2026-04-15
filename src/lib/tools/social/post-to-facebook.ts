/**
 * Post to Facebook Tool
 *
 * Posts content (text, images, videos, links) to Facebook Page via Meta Graph API.
 *
 * Workflow: social/post-to-facebook.md
 *
 * Requirements:
 * - Facebook Page with admin access
 * - Meta App with pages_manage_posts permission
 * - Valid long-lived access token
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { isMetaConfigured, postToFacebook, FacebookPostResult } from '../../meta';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

export interface PostToFacebookInput {
  /** Post message/text */
  message?: string;
  /** Link to share */
  link?: string;
  /** Public URL to photo (must be accessible by Meta servers) */
  photoUrl?: string;
  /** Public URL to video */
  videoUrl?: string;
}

export interface PostToFacebookOutput {
  success: boolean;
  data?: {
    postId: string;
  };
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

const MAX_MESSAGE_LENGTH = 63206; // Facebook's limit

function validateInput(input: unknown): ValidationResult<PostToFacebookInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // At least one of message, link, photoUrl, or videoUrl is required
  if (!obj.message && !obj.link && !obj.photoUrl && !obj.videoUrl) {
    return failure('At least one of message, link, photoUrl, or videoUrl is required');
  }

  // Validate message length
  if (obj.message && typeof obj.message === 'string') {
    if (obj.message.length > MAX_MESSAGE_LENGTH) {
      return failure(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
    }
  }

  // Validate URLs
  if (obj.link && (typeof obj.link !== 'string' || !obj.link.startsWith('http'))) {
    return failure('Invalid link: must be a valid HTTP/HTTPS URL');
  }

  if (obj.photoUrl && (typeof obj.photoUrl !== 'string' || !obj.photoUrl.startsWith('http'))) {
    return failure('Invalid photoUrl: must be a valid HTTP/HTTPS URL');
  }

  if (obj.videoUrl && (typeof obj.videoUrl !== 'string' || !obj.videoUrl.startsWith('http'))) {
    return failure('Invalid videoUrl: must be a valid HTTP/HTTPS URL');
  }

  // Can't have both photo and video
  if (obj.photoUrl && obj.videoUrl) {
    return failure('Cannot post both photo and video at the same time');
  }

  return success({
    message: obj.message as string | undefined,
    link: obj.link as string | undefined,
    photoUrl: obj.photoUrl as string | undefined,
    videoUrl: obj.videoUrl as string | undefined,
  });
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Post content to Facebook Page
 *
 * @param input - Content to post (message, link, photo, or video)
 * @returns Post ID on success
 *
 * @example
 * const result = await postToFacebookTool({
 *   message: 'Check out our latest impact update!',
 *   link: 'https://beanumber.org',
 * });
 */
export async function postToFacebookTool(
  input: unknown
): Promise<PostToFacebookOutput> {
  // Check if Meta is configured
  if (!isMetaConfigured()) {
    logger.warn('Post to Facebook attempted but Meta API is not configured');
    return {
      success: false,
      error: 'Meta API is not configured. Please set META_* environment variables.',
    };
  }

  // Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('Post to Facebook validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { message, link, photoUrl, videoUrl } = validated.data!;

  try {
    logger.info('Posting to Facebook', {
      hasMessage: !!message,
      hasLink: !!link,
      hasPhoto: !!photoUrl,
      hasVideo: !!videoUrl,
    });

    // Post to Facebook
    const result = await postToFacebook({
      message,
      link,
      photoUrl,
      videoUrl,
    });

    if (!result.success || !result.data) {
      logger.error('Failed to post to Facebook', { error: result.error });
      return {
        success: false,
        error: result.error || 'Failed to post to Facebook',
      };
    }

    logger.info('Successfully posted to Facebook', {
      postId: result.data.id || result.data.post_id,
    });

    return {
      success: true,
      data: {
        postId: result.data.id || result.data.post_id || '',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Post to Facebook tool error', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
