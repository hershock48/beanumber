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
 */

// Export all tools from this directory
export { sendEmailTool, type SendEmailInput, type SendEmailOutput } from './send-email';

// Updates tools
export {
  publishUpdateTool,
  type PublishUpdateInput,
  type PublishUpdateOutput,
  listOverdueTool,
  type ListOverdueInput,
  type ListOverdueOutput,
  type OverdueChild,
} from './updates';

// Email notification tools
export {
  sendUpdateNotificationTool,
  type SendUpdateNotificationInput,
  type SendUpdateNotificationOutput,
  sendAdminDigestTool,
  type SendAdminDigestInput,
  type SendAdminDigestOutput,
  sendSponsorWelcomeTool,
  type SendSponsorWelcomeInput,
  type SendSponsorWelcomeOutput,
  sendReminderEmailTool,
  type SendReminderEmailInput,
  type SendReminderEmailOutput,
  sendEscalationNoticeTool,
  type SendEscalationNoticeInput,
  type SendEscalationNoticeOutput,
} from './email';

// Health tools
export {
  checkLinksTool,
  type CheckLinksInput,
  type CheckLinksOutput,
  type LinkCheckResult,
} from './health';

// Sponsor tools
export {
  listAvailableChildrenTool,
  type ListAvailableChildrenInput,
  type ListAvailableChildrenOutput,
  type AvailableChild,
  createSponsorshipTool,
  type CreateSponsorshipInput,
  type CreateSponsorshipOutput,
} from './sponsors';

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

// Children / Child Update System tools
export {
  getActiveChildrenTool,
  type GetActiveChildrenOutput,
  getChildByChildIdTool,
  type GetChildByIdInput,
  type GetChildByIdOutput,
  findChildUpdateTool,
  type FindChildUpdateInput,
  type FindChildUpdateOutput,
  createChildUpdateRecordTool,
  type CreateChildUpdateOutput,
  listPendingUpdatesTool,
  type ListPendingUpdatesOutput,
  updateChildUpdateStatusTool,
  type UpdateStatusInput,
  type UpdateStatusOutput,
} from './children';

// Compliance tools
export {
  detectMissingUpdatesTool,
  type DetectMissingUpdatesInput,
  type DetectMissingUpdatesOutput,
  generateComplianceSummaryTool,
  type GenerateComplianceSummaryInput,
  type GenerateComplianceSummaryOutput,
} from './compliance';

// Future tools:
// export { queryAirtable } from './query-airtable';
