/**
 * Email Tools
 *
 * WAT-compliant tools for email operations.
 */

export {
  sendUpdateNotificationTool,
  type SendUpdateNotificationInput,
  type SendUpdateNotificationOutput,
} from './send-update-notification';

export {
  sendAdminDigestTool,
  type SendAdminDigestInput,
  type SendAdminDigestOutput,
} from './send-admin-digest';

export {
  sendSponsorWelcomeTool,
  type SendSponsorWelcomeInput,
  type SendSponsorWelcomeOutput,
} from './send-sponsor-welcome';

// Compliance reminder tools
export {
  sendReminderEmailTool,
  type SendReminderEmailInput,
  type SendReminderEmailOutput,
} from './send-reminder-email';

export {
  sendEscalationNoticeTool,
  type SendEscalationNoticeInput,
  type SendEscalationNoticeOutput,
} from './send-escalation-notice';
