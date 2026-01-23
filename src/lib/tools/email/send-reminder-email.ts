/**
 * Tool: sendReminderEmail
 *
 * Sends role-based reminder emails for overdue child updates.
 * Only allows sending to approved role emails.
 *
 * WAT-compliant tool:
 * - Single responsibility
 * - Structured output { success, data?, error? }
 * - Logging via logger.ts
 */

import { logger } from '../../logger';
import { sendEmail } from '../../email';
import { ROLE_EMAILS, SOURCE_TYPE } from '../../constants';
import type { ToolResult, RoleActorEmail, SourceType } from '../../types/child-update';

// ============================================================================
// TYPES
// ============================================================================

export interface SendReminderEmailInput {
  toRoleEmail: RoleActorEmail;
  periodOrTerm: string;
  sourceType: SourceType;
  missingChildIds: string[];
  formUrl: string;
  reminderType: 'initial' | 'follow_up' | 'final';
}

export interface SendReminderEmailOutput {
  messageId?: string;
  recipientEmail: string;
  childCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REMINDER_SUBJECTS = {
  initial: (sourceType: SourceType, period: string) =>
    `Action Required: Submit ${sourceType === 'field' ? 'Field' : 'Academic'} Updates for ${period}`,
  follow_up: (sourceType: SourceType, period: string) =>
    `Reminder: ${sourceType === 'field' ? 'Field' : 'Academic'} Updates Due Soon - ${period}`,
  final: (sourceType: SourceType, period: string) =>
    `FINAL REMINDER: ${sourceType === 'field' ? 'Field' : 'Academic'} Updates Due Today - ${period}`,
};

// ============================================================================
// EMAIL TEMPLATE
// ============================================================================

function generateReminderHtml(input: SendReminderEmailInput): string {
  const { periodOrTerm, sourceType, missingChildIds, formUrl, reminderType } = input;

  const updateTypeName = sourceType === SOURCE_TYPE.FIELD ? 'Field' : 'Academic';
  const urgencyClass = reminderType === 'final' ? 'color: #dc2626; font-weight: bold;' : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1e3a5f; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .child-list { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #1e3a5f; }
    .child-id { font-family: monospace; background-color: #f0f0f0; padding: 2px 6px; margin: 2px; display: inline-block; }
    .cta-button { display: inline-block; background-color: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .footer { padding: 20px; font-size: 12px; color: #666; text-align: center; }
    .warning { ${urgencyClass} }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Be A Number</h1>
      <h2>${updateTypeName} Update Reminder</h2>
    </div>
    <div class="content">
      <p class="warning">
        ${reminderType === 'final'
          ? '<strong>⚠️ FINAL REMINDER - Updates Due Today</strong>'
          : reminderType === 'follow_up'
          ? 'This is a follow-up reminder.'
          : 'A new update period has begun.'}
      </p>

      <p>
        <strong>Update Period:</strong> ${periodOrTerm}<br>
        <strong>Update Type:</strong> ${updateTypeName}
      </p>

      <p>The following children are missing updates for this period:</p>

      <div class="child-list">
        <strong>${missingChildIds.length} children need updates:</strong><br><br>
        ${missingChildIds.slice(0, 20).map(id => `<span class="child-id">${id}</span>`).join(' ')}
        ${missingChildIds.length > 20 ? `<br><br><em>... and ${missingChildIds.length - 20} more</em>` : ''}
      </div>

      <p>Please submit updates using the approved intake form:</p>

      <a href="${formUrl}" class="cta-button">Submit Updates →</a>

      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        <strong>Important:</strong> Do not reply to this email. Updates must be submitted through the official form only.
      </p>
    </div>
    <div class="footer">
      <p>Be A Number, International</p>
      <p>This is an automated reminder from the Child Update System.</p>
    </div>
  </div>
</body>
</html>
`;
}

function generateReminderText(input: SendReminderEmailInput): string {
  const { periodOrTerm, sourceType, missingChildIds, formUrl, reminderType } = input;

  const updateTypeName = sourceType === SOURCE_TYPE.FIELD ? 'Field' : 'Academic';

  return `
BE A NUMBER - ${updateTypeName.toUpperCase()} UPDATE REMINDER
${reminderType === 'final' ? '⚠️ FINAL REMINDER - UPDATES DUE TODAY' : ''}

Update Period: ${periodOrTerm}
Update Type: ${updateTypeName}

The following ${missingChildIds.length} children are missing updates:

${missingChildIds.slice(0, 30).join(', ')}${missingChildIds.length > 30 ? `\n... and ${missingChildIds.length - 30} more` : ''}

Please submit updates using the approved intake form:
${formUrl}

IMPORTANT: Do not reply to this email. Updates must be submitted through the official form only.

--
Be A Number, International
This is an automated reminder from the Child Update System.
`.trim();
}

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

/**
 * Send a role-based reminder email
 *
 * Only sends to approved role emails (field-updates@, academics@, admin@).
 *
 * @param input - Contains recipient, period, missing children, and form URL
 * @returns Message ID and recipient info
 */
export async function sendReminderEmailTool(
  input: SendReminderEmailInput
): Promise<ToolResult<SendReminderEmailOutput>> {
  const { toRoleEmail, periodOrTerm, sourceType, missingChildIds, formUrl, reminderType } = input;

  logger.info('sendReminderEmail: Starting', {
    toRoleEmail,
    periodOrTerm,
    sourceType,
    childCount: missingChildIds.length,
    reminderType,
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================

  // Validate recipient is a valid role email
  if (!Object.values(ROLE_EMAILS).includes(toRoleEmail)) {
    logger.warn('sendReminderEmail: Invalid recipient', {
      toRoleEmail,
      validEmails: Object.values(ROLE_EMAILS),
    });

    return {
      success: false,
      error: {
        code: 'forbidden_recipient',
        message: `Recipient must be a valid role email: ${Object.values(ROLE_EMAILS).join(', ')}`,
      },
    };
  }

  // Validate source type matches recipient
  if (sourceType === SOURCE_TYPE.FIELD && toRoleEmail !== ROLE_EMAILS.FIELD_UPDATES) {
    return {
      success: false,
      error: {
        code: 'forbidden_recipient',
        message: `Field update reminders must be sent to ${ROLE_EMAILS.FIELD_UPDATES}`,
      },
    };
  }

  if (sourceType === SOURCE_TYPE.ACADEMIC && toRoleEmail !== ROLE_EMAILS.ACADEMICS) {
    return {
      success: false,
      error: {
        code: 'forbidden_recipient',
        message: `Academic update reminders must be sent to ${ROLE_EMAILS.ACADEMICS}`,
      },
    };
  }

  if (!periodOrTerm) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'periodOrTerm is required',
      },
    };
  }

  if (!missingChildIds || missingChildIds.length === 0) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'missingChildIds must contain at least one child ID',
      },
    };
  }

  if (!formUrl) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'formUrl is required',
      },
    };
  }

  // =========================================================================
  // SEND EMAIL
  // =========================================================================

  try {
    const subject = REMINDER_SUBJECTS[reminderType](sourceType, periodOrTerm);
    const html = generateReminderHtml(input);
    const text = generateReminderText(input);

    const result = await sendEmail({
      to: { email: toRoleEmail, name: 'Be A Number' },
      subject,
      html,
      text,
    });

    if (!result.success) {
      return {
        success: false,
        error: {
          code: 'gmail_error',
          message: result.error || 'Failed to send email',
        },
      };
    }

    logger.info('sendReminderEmail: Sent', {
      toRoleEmail,
      periodOrTerm,
      childCount: missingChildIds.length,
      messageId: result.data?.messageId,
    });

    return {
      success: true,
      data: {
        messageId: result.data?.messageId,
        recipientEmail: toRoleEmail,
        childCount: missingChildIds.length,
      },
    };
  } catch (error: unknown) {
    const err = error as { message?: string };

    logger.error('sendReminderEmail: Failed', error, {
      toRoleEmail,
      periodOrTerm,
    });

    return {
      success: false,
      error: {
        code: 'gmail_error',
        message: err.message || 'Failed to send reminder email',
      },
    };
  }
}
