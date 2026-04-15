/**
 * Cancel Scheduled Post Tool
 *
 * Cancels a pending scheduled post by updating its status in Airtable.
 *
 * Workflow: social/schedule-content.md
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { getEnv } from '../../env';
import { AirtableScheduledPostRecord } from '../../types/airtable';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

export interface CancelScheduledPostInput {
  /** Airtable record ID of the scheduled post */
  recordId: string;
  /** Reason for cancellation (optional) */
  reason?: string;
  /** Who is cancelling this post */
  cancelledBy: string;
}

export interface CancelScheduledPostOutput {
  success: boolean;
  data?: {
    recordId: string;
    previousStatus: string;
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

function validateInput(input: unknown): ValidationResult<CancelScheduledPostInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate recordId
  if (typeof obj.recordId !== 'string' || !obj.recordId.startsWith('rec')) {
    return failure('Invalid recordId: must be a valid Airtable record ID');
  }

  // Validate cancelledBy
  if (typeof obj.cancelledBy !== 'string' || !obj.cancelledBy.includes('@')) {
    return failure('Invalid cancelledBy: must be a valid email address');
  }

  return success({
    recordId: obj.recordId as string,
    reason: obj.reason as string | undefined,
    cancelledBy: obj.cancelledBy as string,
  });
}

// ============================================================================
// AIRTABLE OPERATIONS
// ============================================================================

async function getScheduledPost(recordId: string): Promise<AirtableScheduledPostRecord | null> {
  const env = getEnv();

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_SCHEDULED_POSTS_TABLE)}/${recordId}`,
      {
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json() as AirtableScheduledPostRecord;
  } catch (error) {
    logger.error('Failed to get scheduled post', error, { recordId });
    return null;
  }
}

async function updateScheduledPostStatus(
  recordId: string,
  status: string,
  error?: string
): Promise<boolean> {
  const env = getEnv();

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_SCHEDULED_POSTS_TABLE)}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            Status: status,
            ...(error ? { Error: error } : {}),
          },
        }),
      }
    );

    return response.ok;
  } catch (error) {
    logger.error('Failed to update scheduled post status', error, { recordId });
    return false;
  }
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Cancel a scheduled post
 *
 * @param input - Record ID and cancellation details
 * @returns Success/failure result
 *
 * @example
 * const result = await cancelScheduledPostTool({
 *   recordId: 'rec123abc',
 *   reason: 'Content needs revision',
 *   cancelledBy: 'kevin@beanumber.org',
 * });
 */
export async function cancelScheduledPostTool(
  input: unknown
): Promise<CancelScheduledPostOutput> {
  // Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('Cancel scheduled post validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { recordId, reason, cancelledBy } = validated.data!;

  try {
    // Get current post
    const post = await getScheduledPost(recordId);
    if (!post) {
      return {
        success: false,
        error: 'Scheduled post not found',
      };
    }

    const previousStatus = post.fields.Status;

    // Can only cancel Pending posts
    if (previousStatus !== 'Pending') {
      return {
        success: false,
        error: `Cannot cancel post with status '${previousStatus}'. Only 'Pending' posts can be cancelled.`,
      };
    }

    // Update status to Cancelled
    const errorMessage = reason
      ? `Cancelled by ${cancelledBy}: ${reason}`
      : `Cancelled by ${cancelledBy}`;

    const updated = await updateScheduledPostStatus(recordId, 'Cancelled', errorMessage);
    if (!updated) {
      return {
        success: false,
        error: 'Failed to update post status in Airtable',
      };
    }

    logger.info('Scheduled post cancelled', {
      recordId,
      cancelledBy,
      reason,
    });

    return {
      success: true,
      data: {
        recordId,
        previousStatus,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Cancel scheduled post tool error', error, { recordId });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
