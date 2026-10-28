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

// Email tools
export {
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
  ensurePeriodFolderTool,
  type EnsurePeriodFolderInput,
  type EnsurePeriodFolderOutput,
} from './media';
