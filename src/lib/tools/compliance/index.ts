/**
 * Compliance Tools
 *
 * WAT-compliant tools for compliance tracking and enforcement.
 * These tools are read-only and do not modify data.
 */

export {
  detectMissingUpdatesTool,
  type DetectMissingUpdatesInput,
  type DetectMissingUpdatesOutput,
} from './detect-missing-updates';

export {
  generateComplianceSummaryTool,
  type GenerateComplianceSummaryInput,
  type GenerateComplianceSummaryOutput,
} from './generate-compliance-summary';
