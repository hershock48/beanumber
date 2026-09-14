/**
 * Tools Library
 *
 * This directory contains TypeScript modules that perform deterministic actions.
 * Each tool follows the WAT framework pattern:
 * - Clear input/output interfaces
 * - Single responsibility
 * - Structured error handling (returns { success, data?, error? })
 * - Logging via src/lib/logger.ts
 * - Input validation via src/lib/validation.ts
 *
 * 2026-09-14: the children, compliance, updates and sponsors tool
 * families were deleted with the Airtable retirement. They read and
 * wrote the Airtable base directly and backed the per-child quarterly
 * review workflow that was retired with it. Child updates now flow
 * through /api/admin/child-updates/intake and /api/admin/updates/*,
 * which read Postgres.
 */

// Export all tools from this directory
export { sendEmailTool, type SendEmailInput, type SendEmailOutput } from './send-email';

// Email notification tools
export {
  sendUpdateNotificationTool,
  type SendUpdateNotificationInput,
  type SendUpdateNotificationOutput,
  sendSponsorWelcomeTool,
  type SendSponsorWelcomeInput,
  type SendSponsorWelcomeOutput,
  sendCampusNewsletterTool,
  type SendCampusNewsletterInput,
  type SendCampusNewsletterOutput,
} from './email';

// Health tools
export {
  checkLinksTool,
  type CheckLinksInput,
  type CheckLinksOutput,
  type LinkCheckResult,
} from './health';

// Donation tools
export {
  processRecurringPaymentTool,
  type ProcessRecurringPaymentInput,
  type ProcessRecurringPaymentOutput,
  reconcileSubscriptionsTool,
  type ReconcileSubscriptionsInput,
  type ReconcileSubscriptionsOutput,
  type SubscriptionMismatch,
  type MismatchType,
} from './donation';

// Media tools
export {
  uploadToDriveTool,
  type UploadToDriveInput,
  type UploadToDriveOutput,
  ensureChildDriveFolderTool,
  type EnsureChildFolderInput,
  type EnsureChildFolderOutput,
  ensurePeriodFolderTool,
  type EnsurePeriodFolderInput,
  type EnsurePeriodFolderOutput,
} from './media';

// Social media tools (direct posting only; the Airtable-backed
// scheduling queue was retired 2026-09-14)
export {
  postToInstagramTool,
  type PostToInstagramInput,
  type PostToInstagramOutput,
  postToFacebookTool,
  type PostToFacebookInput,
  type PostToFacebookOutput,
} from './social';
