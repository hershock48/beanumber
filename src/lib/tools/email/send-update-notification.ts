/**
 * Send Update Notification Tool
 *
 * WAT-compliant tool for sending update notifications to sponsors.
 * Notifies sponsors when a new update about their child has been published.
 *
 * Usage in workflows:
 * - Agent publishes an update via publish-update tool
 * - Agent calls this tool with sponsor and update info
 * - Tool executes deterministically and returns structured result
 * - Agent logs the communication
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure, validateEmail, validateRequiredString } from '../../validation';
import { sendUpdateNotificationEmail, EmailSendResult } from '../../email';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for send-update-notification tool
 */
export interface SendUpdateNotificationInput {
  /** Sponsor's email address */
  sponsorEmail: string;
  /** Sponsor's name */
  sponsorName: string;
  /** Child's display name */
  childName: string;
  /** Title of the update */
  updateTitle: string;
  /** Preview/excerpt of the update content */
  updatePreview: string;
}

/**
 * Output schema for send-update-notification tool
 */
export interface SendUpdateNotificationOutput {
  success: boolean;
  data?: {
    messageId?: string;
    provider: 'gmail' | 'sendgrid' | 'disabled';
    recipientEmail: string;
  };
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate tool input
 * @param input - Raw input to validate
 * @returns Validated input or error
 */
function validateInput(input: unknown): ValidationResult<SendUpdateNotificationInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate 'sponsorEmail' field
  const emailResult = validateEmail(obj.sponsorEmail);
  if (!emailResult.success) {
    return failure(`Invalid sponsor email: ${emailResult.error}`);
  }

  // Validate 'sponsorName' field
  const nameResult = validateRequiredString(obj.sponsorName, 'sponsorName', 1, 200);
  if (!nameResult.success) {
    return failure(nameResult.error!);
  }

  // Validate 'childName' field
  const childNameResult = validateRequiredString(obj.childName, 'childName', 1, 200);
  if (!childNameResult.success) {
    return failure(childNameResult.error!);
  }

  // Validate 'updateTitle' field
  const titleResult = validateRequiredString(obj.updateTitle, 'updateTitle', 1, 500);
  if (!titleResult.success) {
    return failure(titleResult.error!);
  }

  // Validate 'updatePreview' field
  const previewResult = validateRequiredString(obj.updatePreview, 'updatePreview', 1, 1000);
  if (!previewResult.success) {
    return failure(previewResult.error!);
  }

  return success({
    sponsorEmail: emailResult.data!,
    sponsorName: nameResult.data!,
    childName: childNameResult.data!,
    updateTitle: titleResult.data!,
    updatePreview: previewResult.data!,
  });
}

/**
 * Truncate content for preview (first 200 chars)
 */
function createPreview(content: string, maxLength: number = 200): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trim() + '...';
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Send update notification email to sponsor
 *
 * This tool validates inputs, sends the notification email,
 * and returns a structured result.
 *
 * @param input - The notification parameters
 * @returns Structured result with success/failure and data/error
 *
 * @example
 * const result = await sendUpdateNotificationTool({
 *   sponsorEmail: 'sponsor@example.com',
 *   sponsorName: 'John Doe',
 *   childName: 'Grace',
 *   updateTitle: 'Monthly Progress Report',
 *   updatePreview: 'Grace has been doing well in school...'
 * });
 * if (result.success) {
 *   console.log('Notification sent via:', result.data?.provider);
 * } else {
 *   console.error('Failed:', result.error);
 * }
 */
export async function sendUpdateNotificationTool(input: unknown): Promise<SendUpdateNotificationOutput> {
  // 1. Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('send-update-notification-tool validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { sponsorEmail, sponsorName, childName, updateTitle, updatePreview } = validated.data!;

  // 2. Execute action
  try {
    logger.debug('send-update-notification-tool executing', {
      to: logger.maskEmail(sponsorEmail),
      sponsorName,
      childName,
      updateTitle,
    });

    // Truncate preview to reasonable length
    const preview = createPreview(updatePreview);

    // Send the notification email
    const result: EmailSendResult = await sendUpdateNotificationEmail(
      sponsorEmail,
      sponsorName,
      childName,
      updateTitle,
      preview
    );

    if (!result.success) {
      logger.error('send-update-notification-tool failed', {
        to: logger.maskEmail(sponsorEmail),
        error: result.error,
      });

      return {
        success: false,
        error: result.error,
      };
    }

    // 3. Log success
    logger.info('send-update-notification-tool completed successfully', {
      to: logger.maskEmail(sponsorEmail),
      childName,
      provider: result.data?.provider,
    });

    // 4. Return structured output
    return {
      success: true,
      data: {
        messageId: result.data?.messageId,
        provider: result.data?.provider || 'disabled',
        recipientEmail: sponsorEmail,
      },
    };
  } catch (error) {
    // 5. Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('send-update-notification-tool unexpected error', error, {
      to: logger.maskEmail(sponsorEmail),
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Default export for convenience
export default sendUpdateNotificationTool;
