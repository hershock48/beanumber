/**
 * Publish Due Posts Tool
 *
 * Finds and publishes all scheduled posts that are due.
 * This is called by the Vercel cron job every 15 minutes.
 *
 * Workflow: social/schedule-content.md
 */

import { logger } from '../../logger';
import { getEnv } from '../../env';
import {
  AirtableScheduledPostRecord,
  AirtableListResponse,
  SocialPlatform,
} from '../../types/airtable';
import {
  isMetaConfigured,
  postToInstagram,
  postToFacebook,
  tokenNeedsRefresh,
  refreshAccessToken,
  InstagramMediaType,
} from '../../meta';
import { getShareableLink } from '../../googledrive';

// ============================================================================
// OUTPUT INTERFACES
// ============================================================================

export interface PublishDuePostsOutput {
  success: boolean;
  data?: {
    processed: number;
    published: number;
    failed: number;
    results: Array<{
      recordId: string;
      status: 'published' | 'failed';
      instagramPostId?: string;
      facebookPostId?: string;
      error?: string;
    }>;
    tokenRefreshed?: boolean;
  };
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AIRTABLE_SCHEDULED_POSTS_TABLE = process.env.AIRTABLE_SCHEDULED_POSTS_TABLE || 'Scheduled Posts';

// Map our content types to Instagram media types
const CONTENT_TYPE_MAP: Record<string, InstagramMediaType> = {
  'Reel': 'REELS',
  'Image': 'IMAGE',
  'Video': 'VIDEO',
  'Carousel': 'CAROUSEL_ALBUM',
  'Story': 'STORIES',
};

// ============================================================================
// AIRTABLE OPERATIONS
// ============================================================================

async function fetchDuePosts(): Promise<AirtableScheduledPostRecord[]> {
  const env = getEnv();

  // Get posts that are:
  // 1. Status = Pending
  // 2. ScheduledAt <= now
  const now = new Date().toISOString();
  const filterFormula = `AND({Status}='Pending',IS_BEFORE({ScheduledAt},'${now}'))`;

  const params = new URLSearchParams({
    filterByFormula: filterFormula,
    maxRecords: '10', // Process in batches
    sort: JSON.stringify([{ field: 'ScheduledAt', direction: 'asc' }]),
  });

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_SCHEDULED_POSTS_TABLE)}?${params}`,
      {
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Airtable fetch due posts failed', { error: errorData });
      return [];
    }

    const data = await response.json() as AirtableListResponse<AirtableScheduledPostRecord>;
    return data.records;
  } catch (error) {
    logger.error('Failed to fetch due posts', error);
    return [];
  }
}

async function updatePostStatus(
  recordId: string,
  updates: {
    status: string;
    publishedAt?: string;
    instagramPostId?: string;
    facebookPostId?: string;
    error?: string;
  }
): Promise<boolean> {
  const env = getEnv();

  const fields: Record<string, unknown> = {
    Status: updates.status,
  };

  if (updates.publishedAt) fields.PublishedAt = updates.publishedAt;
  if (updates.instagramPostId) fields.InstagramPostId = updates.instagramPostId;
  if (updates.facebookPostId) fields.FacebookPostId = updates.facebookPostId;
  if (updates.error) fields.Error = updates.error;

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_SCHEDULED_POSTS_TABLE)}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    return response.ok;
  } catch (error) {
    logger.error('Failed to update post status', error, { recordId });
    return false;
  }
}

// ============================================================================
// MEDIA URL RESOLUTION
// ============================================================================

async function resolveMediaUrl(record: AirtableScheduledPostRecord): Promise<string | null> {
  // If we have a direct URL, use it
  if (record.fields.MediaUrl) {
    return record.fields.MediaUrl;
  }

  // If we have a Drive ID, get a shareable link
  if (record.fields.MediaDriveId) {
    const result = await getShareableLink(record.fields.MediaDriveId);
    if (result.success && result.link) {
      // Convert Google Drive view link to direct download link
      // Format: https://drive.google.com/uc?export=download&id=FILE_ID
      const fileId = record.fields.MediaDriveId;
      return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
    logger.error('Failed to get shareable link for Drive file', { fileId: record.fields.MediaDriveId });
  }

  return null;
}

// ============================================================================
// PUBLISHING
// ============================================================================

async function publishPost(
  record: AirtableScheduledPostRecord
): Promise<{
  success: boolean;
  instagramPostId?: string;
  facebookPostId?: string;
  error?: string;
}> {
  const { Platform, ContentType, Caption, Hashtags } = record.fields;

  // Build caption with hashtags
  let fullCaption = Caption;
  if (Hashtags) {
    const tags = Hashtags.split(',').map(h => h.trim()).filter(Boolean);
    const formattedTags = tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
    fullCaption = `${Caption}\n\n${formattedTags}`;
  }

  // Get media URL
  const mediaUrl = await resolveMediaUrl(record);
  if (!mediaUrl && ContentType !== 'Link') {
    return {
      success: false,
      error: 'Could not resolve media URL',
    };
  }

  let instagramPostId: string | undefined;
  let facebookPostId: string | undefined;
  const errors: string[] = [];

  // Post to Instagram
  if (Platform === 'Instagram' || Platform === 'Both') {
    if (!mediaUrl) {
      errors.push('Instagram requires media URL');
    } else {
      const instagramType = CONTENT_TYPE_MAP[ContentType] || 'IMAGE';
      const result = await postToInstagram({
        type: instagramType,
        mediaUrl,
        caption: fullCaption,
        shareToFeed: true,
      });

      if (result.success && result.data) {
        instagramPostId = result.data.id;
        logger.info('Posted to Instagram', { postId: instagramPostId });
      } else {
        errors.push(`Instagram: ${result.error || 'Unknown error'}`);
      }
    }
  }

  // Post to Facebook
  if (Platform === 'Facebook' || Platform === 'Both') {
    const result = await postToFacebook({
      message: fullCaption,
      ...(ContentType === 'Link' ? {} : {
        ...(ContentType === 'Video' || ContentType === 'Reel' ? { videoUrl: mediaUrl! } : { photoUrl: mediaUrl! })
      }),
    });

    if (result.success && result.data) {
      facebookPostId = result.data.id || result.data.post_id;
      logger.info('Posted to Facebook', { postId: facebookPostId });
    } else {
      errors.push(`Facebook: ${result.error || 'Unknown error'}`);
    }
  }

  // Determine overall success. "Both" platforms counts as success if at least
  // one succeeded, so we coerce the short-circuited string|undefined to bool.
  const success: boolean =
    errors.length === 0 ||
    (Platform === 'Both' && Boolean(instagramPostId || facebookPostId));

  return {
    success,
    instagramPostId,
    facebookPostId,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Publish all scheduled posts that are due
 *
 * This tool is designed to be called by a cron job.
 * It processes posts in batches and handles errors gracefully.
 *
 * @returns Summary of processed posts
 *
 * @example
 * // Called by cron job
 * const result = await publishDuePostsTool();
 * console.log(`Published ${result.data.published} posts`);
 */
export async function publishDuePostsTool(): Promise<PublishDuePostsOutput> {
  // Check if Meta is configured
  if (!isMetaConfigured()) {
    logger.warn('Publish due posts skipped: Meta API not configured');
    return {
      success: true,
      data: {
        processed: 0,
        published: 0,
        failed: 0,
        results: [],
      },
    };
  }

  try {
    // Check if token needs refresh
    let tokenRefreshed = false;
    if (tokenNeedsRefresh()) {
      logger.info('Access token expiring soon, attempting refresh');
      const refreshResult = await refreshAccessToken();
      if (refreshResult.success) {
        tokenRefreshed = true;
        logger.info('Token refreshed successfully', {
          expiresAt: refreshResult.data?.expiresAt,
        });
        // Note: The new token needs to be saved to environment variables
        // This would typically be done by updating Vercel env vars
      } else {
        logger.error('Token refresh failed', { error: refreshResult.error });
        // Continue anyway - token might still be valid
      }
    }

    // Fetch due posts
    const duePosts = await fetchDuePosts();
    if (duePosts.length === 0) {
      logger.debug('No posts due for publishing');
      return {
        success: true,
        data: {
          processed: 0,
          published: 0,
          failed: 0,
          results: [],
          tokenRefreshed,
        },
      };
    }

    logger.info('Found posts due for publishing', { count: duePosts.length });

    // Process each post
    const results: NonNullable<PublishDuePostsOutput['data']>['results'] = [];
    let published = 0;
    let failed = 0;

    for (const post of duePosts) {
      // Mark as processing
      await updatePostStatus(post.id, { status: 'Processing' });

      // Attempt to publish
      const publishResult = await publishPost(post);

      if (publishResult.success) {
        // Mark as published
        await updatePostStatus(post.id, {
          status: 'Published',
          publishedAt: new Date().toISOString(),
          instagramPostId: publishResult.instagramPostId,
          facebookPostId: publishResult.facebookPostId,
          error: publishResult.error, // Partial errors if any
        });
        published++;
        results.push({
          recordId: post.id,
          status: 'published',
          instagramPostId: publishResult.instagramPostId,
          facebookPostId: publishResult.facebookPostId,
          error: publishResult.error,
        });
      } else {
        // Mark as failed
        await updatePostStatus(post.id, {
          status: 'Failed',
          error: publishResult.error,
        });
        failed++;
        results.push({
          recordId: post.id,
          status: 'failed',
          error: publishResult.error,
        });
      }
    }

    logger.info('Finished publishing due posts', {
      processed: duePosts.length,
      published,
      failed,
    });

    return {
      success: true,
      data: {
        processed: duePosts.length,
        published,
        failed,
        results,
        tokenRefreshed,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Publish due posts tool error', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
