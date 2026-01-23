/**
 * Send Email Tool
 *
 * WAT-compliant tool for sending emails via Gmail or SendGrid.
 * This tool wraps the email service with proper validation and structured results.
 *
 * Usage in workflows:
 * - Agent reads workflow instructions
 * - Agent calls this tool with required inputs
 * - Tool executes deterministically and returns structured result
 * - Agent uses result to continue workflow
 */

import { logger } from '../logger';
import { ValidationResult, success, failure, validateEmail, validateRequiredString } from '../validation';
import { sendEmail, EmailSendResult } from '../email';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for send-email tool
 */
export interface SendEmailInput {
  /** Recipient email address(es) */
  to: string | string[];
  /** Email subject line */
  subject: string;
  /** HTML content of the email */
  html: string;
  /** Optional plain text content (auto-generated from HTML if not provided) */
  text?: string;
  /** Optional sender email address (uses default if not provided) */
  from?: string;
  /** Optional reply-to email address */
  replyTo?: string;
}

/**
 * Output schema for send-email tool
 */
export interface SendEmailOutput {
  success: boolean;
  data?: {
    messageId?: string;
    provider: 'gmail' | 'sendgrid' | 'disabled';
    recipientCount: number;
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
function validateInput(input: unknown): ValidationResult<SendEmailInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate 'to' field
  if (!obj.to) {
    return failure('Invalid input: to (recipient) is required');
  }

  // Handle single email or array of emails
  const recipients: string[] = [];
  if (typeof obj.to === 'string') {
    const emailResult = validateEmail(obj.to);
    if (!emailResult.success) {
      return failure(`Invalid recipient email: ${emailResult.error}`);
    }
    recipients.push(emailResult.data!);
  } else if (Array.isArray(obj.to)) {
    if (obj.to.length === 0) {
      return failure('Invalid input: to array cannot be empty');
    }
    for (const email of obj.to) {
      const emailResult = validateEmail(email);
      if (!emailResult.success) {
        return failure(`Invalid recipient email "${email}": ${emailResult.error}`);
      }
      recipients.push(emailResult.data!);
    }
  } else {
    return failure('Invalid input: to must be a string or array of strings');
  }

  // Validate 'subject' field
  const subjectResult = validateRequiredString(obj.subject, 'subject', 1, 500);
  if (!subjectResult.success) {
    return failure(subjectResult.error!);
  }

  // Validate 'html' field
  const htmlResult = validateRequiredString(obj.html, 'html', 1, 100000);
  if (!htmlResult.success) {
    return failure(htmlResult.error!);
  }

  // Validate optional 'text' field
  let text: string | undefined;
  if (obj.text !== undefined && obj.text !== null && obj.text !== '') {
    if (typeof obj.text !== 'string') {
      return failure('Invalid input: text must be a string');
    }
    text = obj.text;
  }

  // Validate optional 'from' field
  let from: string | undefined;
  if (obj.from !== undefined && obj.from !== null && obj.from !== '') {
    const fromResult = validateEmail(obj.from);
    if (!fromResult.success) {
      return failure(`Invalid from email: ${fromResult.error}`);
    }
    from = fromResult.data;
  }

  // Validate optional 'replyTo' field
  let replyTo: string | undefined;
  if (obj.replyTo !== undefined && obj.replyTo !== null && obj.replyTo !== '') {
    const replyToResult = validateEmail(obj.replyTo);
    if (!replyToResult.success) {
      return failure(`Invalid replyTo email: ${replyToResult.error}`);
    }
    replyTo = replyToResult.data;
  }

  return success({
    to: recipients.length === 1 ? recipients[0] : recipients,
    subject: subjectResult.data!,
    html: htmlResult.data!,
    text,
    from,
    replyTo,
  });
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Send an email via Gmail or SendGrid
 *
 * This tool validates inputs, sends the email via the configured provider,
 * and returns a structured result.
 *
 * @param input - The email parameters
 * @returns Structured result with success/failure and data/error
 *
 * @example
 * const result = await sendEmailTool({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World</p>'
 * });
 * if (result.success) {
 *   console.log('Email sent via:', result.data?.provider);
 * } else {
 *   console.error('Failed:', result.error);
 * }
 */
export async function sendEmailTool(input: unknown): Promise<SendEmailOutput> {
  // 1. Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('send-email-tool validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { to, subject, html, text, from, replyTo } = validated.data!;
  const recipients = Array.isArray(to) ? to : [to];

  // 2. Execute action
  try {
    logger.debug('send-email-tool executing', {
      to: recipients.map(r => logger.maskEmail(r)),
      subject,
      from: from ? logger.maskEmail(from) : undefined,
    });

    // Build email options
    const emailOptions = {
      to: recipients.map(email => ({ email })),
      subject,
      html,
      text,
      from: from ? { email: from } : undefined,
      replyTo: replyTo ? { email: replyTo } : undefined,
    };

    // Send the email
    const result: EmailSendResult = await sendEmail(emailOptions);

    if (!result.success) {
      logger.error('send-email-tool failed', {
        to: recipients.map(r => logger.maskEmail(r)),
        subject,
        error: result.error,
      });

      return {
        success: false,
        error: result.error,
      };
    }

    // 3. Log success
    logger.info('send-email-tool completed successfully', {
      to: recipients.map(r => logger.maskEmail(r)),
      subject,
      provider: result.data?.provider,
    });

    // 4. Return structured output
    return {
      success: true,
      data: {
        messageId: result.data?.messageId,
        provider: result.data?.provider || 'disabled',
        recipientCount: recipients.length,
      },
    };
  } catch (error) {
    // 5. Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('send-email-tool unexpected error', error, {
      to: recipients.map(r => logger.maskEmail(r)),
      subject,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Default export for convenience
export default sendEmailTool;
