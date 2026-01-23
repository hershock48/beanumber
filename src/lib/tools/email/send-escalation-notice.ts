/**
 * Tool: sendEscalationNotice
 *
 * Sends escalation notice to admin when updates remain missing after deadline.
 * This tool is called by the compliance automation when overdue items are detected.
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

export interface SendEscalationNoticeInput {
  periodOrTerm: string;
  sourceType: SourceType;
  responsibleRole: RoleActorEmail;
  missingCount: number;
  missingChildIds: string[];
  daysOverdue: number;
}

export interface SendEscalationNoticeOutput {
  messageId?: string;
  escalatedTo: string;
  missingCount: number;
  daysOverdue: number;
}

// ============================================================================
// EMAIL TEMPLATE
// ============================================================================

function generateEscalationHtml(input: SendEscalationNoticeInput): string {
  const { periodOrTerm, sourceType, responsibleRole, missingCount, missingChildIds, daysOverdue } = input;

  const updateTypeName = sourceType === SOURCE_TYPE.FIELD ? 'Field' : 'Academic';
  const urgencyColor = daysOverdue > 7 ? '#dc2626' : daysOverdue > 3 ? '#f59e0b' : '#1e3a5f';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${urgencyColor}; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .stats-box { background-color: white; padding: 15px; margin: 15px 0; border: 2px solid ${urgencyColor}; }
    .stat { display: inline-block; text-align: center; padding: 10px 20px; }
    .stat-value { font-size: 32px; font-weight: bold; color: ${urgencyColor}; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .child-list { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid ${urgencyColor}; max-height: 200px; overflow-y: auto; }
    .child-id { font-family: monospace; background-color: #f0f0f0; padding: 2px 6px; margin: 2px; display: inline-block; font-size: 12px; }
    .footer { padding: 20px; font-size: 12px; color: #666; text-align: center; }
    .action-item { background-color: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ ESCALATION NOTICE</h1>
      <h2>Overdue ${updateTypeName} Updates</h2>
    </div>
    <div class="content">
      <div class="stats-box">
        <div class="stat">
          <div class="stat-value">${missingCount}</div>
          <div class="stat-label">Missing Updates</div>
        </div>
        <div class="stat">
          <div class="stat-value">${daysOverdue}</div>
          <div class="stat-label">Days Overdue</div>
        </div>
      </div>

      <p>
        <strong>Update Period:</strong> ${periodOrTerm}<br>
        <strong>Update Type:</strong> ${updateTypeName}<br>
        <strong>Responsible Role:</strong> ${responsibleRole}
      </p>

      <div class="action-item">
        <strong>Action Required:</strong> Follow up with ${responsibleRole} to ensure these updates are submitted as soon as possible.
      </div>

      <p>The following children are ${daysOverdue} days past their update deadline:</p>

      <div class="child-list">
        ${missingChildIds.map(id => `<span class="child-id">${id}</span>`).join(' ')}
      </div>

      <p style="font-size: 14px; color: #666;">
        This escalation was triggered automatically because updates were not received by the deadline.
        The responsible role (${responsibleRole}) has already received multiple reminders.
      </p>
    </div>
    <div class="footer">
      <p>Be A Number, International</p>
      <p>Child Update System - Compliance Escalation</p>
      <p>Generated: ${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>
`;
}

function generateEscalationText(input: SendEscalationNoticeInput): string {
  const { periodOrTerm, sourceType, responsibleRole, missingCount, missingChildIds, daysOverdue } = input;

  const updateTypeName = sourceType === SOURCE_TYPE.FIELD ? 'Field' : 'Academic';

  return `
⚠️ ESCALATION NOTICE - OVERDUE ${updateTypeName.toUpperCase()} UPDATES
${'='.repeat(60)}

MISSING UPDATES: ${missingCount}
DAYS OVERDUE: ${daysOverdue}

Update Period: ${periodOrTerm}
Update Type: ${updateTypeName}
Responsible Role: ${responsibleRole}

ACTION REQUIRED:
Follow up with ${responsibleRole} to ensure these updates are submitted as soon as possible.

MISSING CHILDREN (${missingChildIds.length}):
${missingChildIds.join(', ')}

This escalation was triggered automatically because updates were not received by the deadline.
The responsible role (${responsibleRole}) has already received multiple reminders.

--
Be A Number, International
Child Update System - Compliance Escalation
Generated: ${new Date().toISOString()}
`.trim();
}

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

/**
 * Send an escalation notice to admin
 *
 * Called when updates remain missing after the deadline.
 * Always sends to admin@beanumber.org.
 *
 * @param input - Contains period, responsible role, missing count, and details
 * @returns Message ID and escalation details
 */
export async function sendEscalationNoticeTool(
  input: SendEscalationNoticeInput
): Promise<ToolResult<SendEscalationNoticeOutput>> {
  const { periodOrTerm, sourceType, responsibleRole, missingCount, missingChildIds, daysOverdue } = input;

  logger.info('sendEscalationNotice: Starting', {
    periodOrTerm,
    sourceType,
    responsibleRole,
    missingCount,
    daysOverdue,
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================

  if (!periodOrTerm) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'periodOrTerm is required',
      },
    };
  }

  if (!sourceType || !Object.values(SOURCE_TYPE).includes(sourceType)) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'sourceType must be "field" or "academic"',
      },
    };
  }

  if (!Object.values(ROLE_EMAILS).includes(responsibleRole)) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: `responsibleRole must be a valid role email: ${Object.values(ROLE_EMAILS).join(', ')}`,
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

  if (daysOverdue < 1) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'daysOverdue must be at least 1',
      },
    };
  }

  // =========================================================================
  // SEND EMAIL
  // =========================================================================

  try {
    const updateTypeName = sourceType === SOURCE_TYPE.FIELD ? 'Field' : 'Academic';
    const subject = `🚨 ESCALATION: ${missingCount} Overdue ${updateTypeName} Updates (${daysOverdue} days) - ${periodOrTerm}`;
    const html = generateEscalationHtml(input);
    const text = generateEscalationText(input);

    // Always send to admin
    const result = await sendEmail({
      to: { email: ROLE_EMAILS.ADMIN, name: 'Be A Number Admin' },
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

    logger.info('sendEscalationNotice: Sent', {
      escalatedTo: ROLE_EMAILS.ADMIN,
      periodOrTerm,
      missingCount,
      daysOverdue,
      messageId: result.data?.messageId,
    });

    return {
      success: true,
      data: {
        messageId: result.data?.messageId,
        escalatedTo: ROLE_EMAILS.ADMIN,
        missingCount,
        daysOverdue,
      },
    };
  } catch (error: unknown) {
    const err = error as { message?: string };

    logger.error('sendEscalationNotice: Failed', error, {
      periodOrTerm,
      missingCount,
    });

    return {
      success: false,
      error: {
        code: 'gmail_error',
        message: err.message || 'Failed to send escalation notice',
      },
    };
  }
}
