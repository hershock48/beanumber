/**
 * Send Sponsor Welcome Tool
 *
 * WAT-compliant tool for sending welcome emails to new sponsors.
 * Wraps the sendSponsorWelcomeEmail function with validation and logging.
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure, validateEmail, validateRequiredString } from '../../validation';
import { sendSponsorWelcomeEmail, EmailSendResult } from '../../email';
import { SPONSOR_CODE_PATTERN } from '../../constants';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for send-sponsor-welcome tool
 */
export interface SendSponsorWelcomeInput {
  /** Sponsor's email address */
  sponsorEmail: string;
  /** Sponsor's name */
  sponsorName: string;
  /** Child's display name */
  childName: string;
  /** Generated sponsor code (BAN-YYYY-XXX format) */
  sponsorCode: string;
}

/**
 * Output schema for send-sponsor-welcome tool
 */
export interface SendSponsorWelcomeOutput {
  success: boolean;
  data?: {
    messageId?: string;
    provider: 'gmail' | 'sendgrid' | 'disabled';
    recipientEmail: string;
    sponsorCode: string;
  };
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate tool input
 */
function validateInput(input: unknown): ValidationResult<SendSponsorWelcomeInput> {
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

  // Validate 'sponsorCode' field
  const codeResult = validateRequiredString(obj.sponsorCode, 'sponsorCode', 1, 20);
  if (!codeResult.success) {
    return failure(codeResult.error!);
  }

  // Validate sponsor code format
  if (!SPONSOR_CODE_PATTERN.test(codeResult.data!)) {
    return failure('Invalid sponsor code format. Expected BAN-YYYY-XXX.');
  }

  return success({
    sponsorEmail: emailResult.data!,
    sponsorName: nameResult.data!,
    childName: childNameResult.data!,
    sponsorCode: codeResult.data!,
  });
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Send welcome email to new sponsor
 *
 * This tool validates inputs, sends the welcome email with credentials,
 * and returns a structured result.
 *
 * @param input - The sponsor and child information
 * @returns Structured result with success/failure and data/error
 *
 * @example
 * const result = await sendSponsorWelcomeTool({
 *   sponsorEmail: 'sponsor@example.com',
 *   sponsorName: 'John Doe',
 *   childName: 'Grace',
 *   sponsorCode: 'BAN-2026-123'
 * });
 * if (result.success) {
 *   console.log('Welcome email sent via:', result.data?.provider);
 * }
 */
export async function sendSponsorWelcomeTool(input: unknown): Promise<SendSponsorWelcomeOutput> {
  // 1. Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('send-sponsor-welcome-tool validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { sponsorEmail, sponsorName, childName, sponsorCode } = validated.data!;

  // 2. Execute action
  try {
    logger.debug('send-sponsor-welcome-tool executing', {
      to: logger.maskEmail(sponsorEmail),
      sponsorName,
      childName,
      sponsorCode: logger.maskSponsorCode(sponsorCode),
    });

    // Send the welcome email
    const result: EmailSendResult = await sendSponsorWelcomeEmail(
      sponsorEmail,
      sponsorName,
      childName,
      sponsorCode
    );

    if (!result.success) {
      logger.error('send-sponsor-welcome-tool failed', {
        to: logger.maskEmail(sponsorEmail),
        error: result.error,
      });

      return {
        success: false,
        error: result.error,
      };
    }

    // 3. Log success
    logger.info('send-sponsor-welcome-tool completed successfully', {
      to: logger.maskEmail(sponsorEmail),
      sponsorCode: logger.maskSponsorCode(sponsorCode),
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
        sponsorCode,
      },
    };
  } catch (error) {
    // 5. Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('send-sponsor-welcome-tool unexpected error', error, {
      to: logger.maskEmail(sponsorEmail),
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Default export for convenience
export default sendSponsorWelcomeTool;
