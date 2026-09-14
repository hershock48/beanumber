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
  sendSponsorWelcomeTool,
  type SendSponsorWelcomeInput,
  type SendSponsorWelcomeOutput,
} from './send-sponsor-welcome';

// Campus newsletter (monthly blast to all active sponsors)
export {
  sendCampusNewsletterTool,
  type SendCampusNewsletterInput,
  type SendCampusNewsletterOutput,
} from './send-campus-newsletter';
