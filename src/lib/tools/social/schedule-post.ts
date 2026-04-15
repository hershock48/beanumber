/**
 * Schedule Post Tool
 *
 * Creates a scheduled post record in Airtable for later publishing.
 * The cron job (publish-due-posts) will pick up and publish scheduled posts.
 *
 * Workflow: social/schedule-content.md
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { getEnv } from '../../env';
import {
  SocialPlatform,
  SocialContentType,
  AirtableScheduledPostRecord,
} from '../../types/airtable';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

export interface SchedulePostInput {
  /** Platform to post to: Instagram, Facebook, or Both */
  platform: SocialPlatform;
  /** Type of content */
  contentType: SocialContentType;
  /** Google Drive file ID for the media */
  mediaDriveId?: string;
  /** Public media URL (if not using Drive) */
  mediaUrl?: string;
  /** Caption/message text */
  caption: string;
  /** Hashtags (comma-separated or array) */
  hashtags?: string | string[];
  /** When to publish (ISO datetime or Date) */
  scheduledAt: string | Date;
  /** Who is scheduling this post */
  createdBy: string;
}

export interface SchedulePostOutput {
  success: boolean;
  data?: {
    recordId: string;
    scheduledAt: string;
    platform: SocialPlatform;
  };
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AIRTABLE_SCHEDULED_POSTS_TABLE = process.env.AIRTABLE_SCHEDULED_POSTS_TABLE || 'Scheduled Posts';

// ============================================================================
// VALIDATION
// ============================================================================

const MAX_CAPTION_LENGTH = 2200;
const MAX_HASHTAGS = 30;

function validateInput(input: unknown): ValidationResult<SchedulePostInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate platform
  const validPlatforms: SocialPlatform[] = ['Instagram', 'Facebook', 'Both'];
  if (!obj.platform || !validPlatforms.includes(obj.platform as SocialPlatform)) {
    return failure(`Invalid platform: must be one of ${validPlatforms.join(', ')}`);
  }

  // Validate contentType
  const validTypes: SocialContentType[] = ['Reel', 'Image', 'Carousel', 'Story', 'Video', 'Link'];
  if (!obj.contentType || !validTypes.includes(obj.contentType as SocialContentType)) {
    return failure(`Invalid contentType: must be one of ${validTypes.join(', ')}`);
  }

  // Validate media source
  if (!obj.mediaDriveId && !obj.mediaUrl) {
    // Only require media for non-link posts
    if (obj.contentType !== 'Link') {
      return failure('Either mediaDriveId or mediaUrl is required for media posts');
    }
  }

  // Validate caption
  if (typeof obj.caption !== 'string' || !obj.caption.trim()) {
    return failure('Caption is required');
  }
  if (obj.caption.length > MAX_CAPTION_LENGTH) {
    return failure(`Caption exceeds maximum length of ${MAX_CAPTION_LENGTH} characters`);
  }

  // Validate hashtags
  let hashtags: string | undefined;
  if (obj.hashtags) {
    if (Array.isArray(obj.hashtags)) {
      hashtags = obj.hashtags.join(',');
    } else if (typeof obj.hashtags === 'string') {
      hashtags = obj.hashtags;
    }
    const count = hashtags?.split(',').filter(h => h.trim()).length || 0;
    if (count > MAX_HASHTAGS) {
      return failure(`Too many hashtags: ${count}. Maximum is ${MAX_HASHTAGS}`);
    }
  }

  // Validate scheduledAt
  let scheduledAt: Date;
  if (obj.scheduledAt instanceof Date) {
    scheduledAt = obj.scheduledAt;
  } else if (typeof obj.scheduledAt === 'string') {
    scheduledAt = new Date(obj.scheduledAt);
  } else {
    return failure('Invalid scheduledAt: must be a Date or ISO date string');
  }

  if (isNaN(scheduledAt.getTime())) {
    return failure('Invalid scheduledAt: could not parse date');
  }

  // Must be in the future (at least 5 minutes from now)
  const minScheduleTime = new Date(Date.now() + 5 * 60 * 1000);
  if (scheduledAt < minScheduleTime) {
    return failure('scheduledAt must be at least 5 minutes in the future');
  }

  // Validate createdBy
  if (typeof obj.createdBy !== 'string' || !obj.createdBy.includes('@')) {
    return failure('Invalid createdBy: must be a valid email address');
  }

  return success({
    platform: obj.platform as SocialPlatform,
    contentType: obj.contentType as SocialContentType,
    mediaDriveId: obj.mediaDriveId as string | undefined,
    mediaUrl: obj.mediaUrl as string | undefined,
    caption: obj.caption.trim(),
    hashtags,
    scheduledAt: scheduledAt.toISOString(),
    createdBy: obj.createdBy as string,
  });
}

// ============================================================================
// AIRTABLE OPERATIONS
// ============================================================================

async function createScheduledPostRecord(
  input: SchedulePostInput
): Promise<{ id: string } | null> {
  const env = getEnv();

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_SCHEDULED_POSTS_TABLE)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            Platform: input.platform,
            ContentType: input.contentType,
            MediaDriveId: input.mediaDriveId || '',
            MediaUrl: input.mediaUrl || '',
            Caption: input.caption,
            Hashtags: input.hashtags || '',
            ScheduledAt: input.scheduledAt,
            Status: 'Pending',
            CreatedBy: input.createdBy,
            CreatedAt: new Date().toISOString(),
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Airtable create scheduled post failed', { error: errorData });
      return null;
    }

    const record = await response.json() as AirtableScheduledPostRecord;
    return { id: record.id };
  } catch (error) {
    logger.error('Failed to create scheduled post record', error);
    return null;
  }
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Schedule a post for later publishing
 *
 * @param input - Post details and scheduled time
 * @returns Record ID on success
 *
 * @example
 * const result = await schedulePostTool({
 *   platform: 'Both',
 *   contentType: 'Reel',
 *   mediaDriveId: '1abc123...',
 *   caption: 'Check out our impact! #nonprofit',
 *   scheduledAt: '2026-01-25T09:00:00Z',
 *   createdBy: 'kevin@beanumber.org',
 * });
 */
export async function schedulePostTool(
  input: unknown
): Promise<SchedulePostOutput> {
  // Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('Schedule post validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const data = validated.data!;

  try {
    logger.info('Scheduling post', {
      platform: data.platform,
      contentType: data.contentType,
      scheduledAt: data.scheduledAt,
      createdBy: data.createdBy,
    });

    // Create record in Airtable
    const record = await createScheduledPostRecord(data);
    if (!record) {
      return {
        success: false,
        error: 'Failed to create scheduled post record in Airtable',
      };
    }

    logger.info('Post scheduled successfully', {
      recordId: record.id,
      scheduledAt: data.scheduledAt,
    });

    // validateInput always normalizes scheduledAt to an ISO string, but the
    // declared input type is `string | Date`, so narrow it here explicitly.
    const scheduledAtIso =
      data.scheduledAt instanceof Date
        ? data.scheduledAt.toISOString()
        : data.scheduledAt;

    return {
      success: true,
      data: {
        recordId: record.id,
        scheduledAt: scheduledAtIso,
        platform: data.platform,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Schedule post tool error', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
