/**
 * List Scheduled Posts Tool
 *
 * Retrieves scheduled posts from Airtable, optionally filtered by status.
 *
 * Workflow: social/schedule-content.md
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { getEnv } from '../../env';
import {
  ScheduledPostStatus,
  AirtableScheduledPostRecord,
  ScheduledPost,
  AirtableListResponse,
} from '../../types/airtable';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

export interface ListScheduledPostsInput {
  /** Filter by status (optional) */
  status?: ScheduledPostStatus | ScheduledPostStatus[];
  /** Maximum number of records to return (default: 100) */
  maxRecords?: number;
  /** Only show posts scheduled before this date */
  scheduledBefore?: string | Date;
  /** Only show posts scheduled after this date */
  scheduledAfter?: string | Date;
}

export interface ListScheduledPostsOutput {
  success: boolean;
  data?: {
    posts: ScheduledPost[];
    count: number;
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

function validateInput(input: unknown): ValidationResult<ListScheduledPostsInput> {
  // Input is optional, so empty is valid
  if (!input) {
    return success({});
  }

  if (typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate status if provided
  const validStatuses: ScheduledPostStatus[] = ['Pending', 'Processing', 'Published', 'Failed', 'Cancelled'];
  if (obj.status) {
    if (Array.isArray(obj.status)) {
      for (const s of obj.status) {
        if (!validStatuses.includes(s as ScheduledPostStatus)) {
          return failure(`Invalid status: ${s}. Must be one of ${validStatuses.join(', ')}`);
        }
      }
    } else if (!validStatuses.includes(obj.status as ScheduledPostStatus)) {
      return failure(`Invalid status: must be one of ${validStatuses.join(', ')}`);
    }
  }

  // Validate maxRecords
  if (obj.maxRecords !== undefined) {
    if (typeof obj.maxRecords !== 'number' || obj.maxRecords < 1 || obj.maxRecords > 1000) {
      return failure('Invalid maxRecords: must be a number between 1 and 1000');
    }
  }

  return success({
    status: obj.status as ScheduledPostStatus | ScheduledPostStatus[] | undefined,
    maxRecords: obj.maxRecords as number | undefined,
    scheduledBefore: obj.scheduledBefore as string | Date | undefined,
    scheduledAfter: obj.scheduledAfter as string | Date | undefined,
  });
}

// ============================================================================
// AIRTABLE OPERATIONS
// ============================================================================

async function fetchScheduledPosts(
  input: ListScheduledPostsInput
): Promise<AirtableScheduledPostRecord[]> {
  const env = getEnv();

  // Build filter formula
  const filters: string[] = [];

  if (input.status) {
    if (Array.isArray(input.status)) {
      const statusFilters = input.status.map(s => `{Status}='${s}'`);
      filters.push(`OR(${statusFilters.join(',')})`);
    } else {
      filters.push(`{Status}='${input.status}'`);
    }
  }

  if (input.scheduledBefore) {
    const date = input.scheduledBefore instanceof Date
      ? input.scheduledBefore.toISOString()
      : input.scheduledBefore;
    filters.push(`IS_BEFORE({ScheduledAt},'${date}')`);
  }

  if (input.scheduledAfter) {
    const date = input.scheduledAfter instanceof Date
      ? input.scheduledAfter.toISOString()
      : input.scheduledAfter;
    filters.push(`IS_AFTER({ScheduledAt},'${date}')`);
  }

  const filterFormula = filters.length > 0
    ? `AND(${filters.join(',')})`
    : '';

  const params = new URLSearchParams({
    maxRecords: String(input.maxRecords || 100),
    sort: JSON.stringify([{ field: 'ScheduledAt', direction: 'asc' }]),
  });

  if (filterFormula) {
    params.set('filterByFormula', filterFormula);
  }

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
      logger.error('Airtable fetch scheduled posts failed', { error: errorData });
      return [];
    }

    const data = await response.json() as AirtableListResponse<AirtableScheduledPostRecord>;
    return data.records;
  } catch (error) {
    logger.error('Failed to fetch scheduled posts', error);
    return [];
  }
}

// ============================================================================
// TRANSFORM
// ============================================================================

function transformRecord(record: AirtableScheduledPostRecord): ScheduledPost {
  return {
    id: record.id,
    platform: record.fields.Platform,
    contentType: record.fields.ContentType,
    caption: record.fields.Caption,
    hashtags: record.fields.Hashtags
      ? record.fields.Hashtags.split(',').map(h => h.trim()).filter(Boolean)
      : undefined,
    scheduledAt: new Date(record.fields.ScheduledAt),
    status: record.fields.Status,
    publishedAt: record.fields.PublishedAt ? new Date(record.fields.PublishedAt) : undefined,
    error: record.fields.Error,
    instagramPostId: record.fields.InstagramPostId,
    facebookPostId: record.fields.FacebookPostId,
  };
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * List scheduled posts from Airtable
 *
 * @param input - Optional filters (status, date range, limit)
 * @returns List of scheduled posts
 *
 * @example
 * // Get all pending posts
 * const result = await listScheduledPostsTool({ status: 'Pending' });
 *
 * // Get posts due in the next hour
 * const result = await listScheduledPostsTool({
 *   status: 'Pending',
 *   scheduledBefore: new Date(Date.now() + 60 * 60 * 1000),
 * });
 */
export async function listScheduledPostsTool(
  input: unknown = {}
): Promise<ListScheduledPostsOutput> {
  // Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('List scheduled posts validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const filters = validated.data!;

  try {
    logger.debug('Listing scheduled posts', { filters });

    const records = await fetchScheduledPosts(filters);
    const posts = records.map(transformRecord);

    logger.info('Listed scheduled posts', { count: posts.length });

    return {
      success: true,
      data: {
        posts,
        count: posts.length,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('List scheduled posts tool error', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
