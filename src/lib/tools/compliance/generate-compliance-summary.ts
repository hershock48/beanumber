/**
 * Tool: generateComplianceSummary
 *
 * Generates a read-only compliance summary for admin visibility.
 * Shows compliance rates, missing updates, and overdue details.
 *
 * WAT-compliant tool:
 * - Single responsibility
 * - Structured output { success, data?, error? }
 * - Logging via logger.ts
 * - Read-only (no data modification)
 */

import { logger } from '../../logger';
import { detectMissingUpdatesTool } from './detect-missing-updates';
import { SOURCE_TYPE } from '../../constants';
import type {
  ToolResult,
  SourceType,
  ComplianceSummary,
} from '../../types/child-update';

// ============================================================================
// TYPES
// ============================================================================

export interface GenerateComplianceSummaryInput {
  periodOrTerm: string;
  sourceType?: SourceType; // If not provided, generates for both
}

export interface GenerateComplianceSummaryOutput {
  summaries: ComplianceSummary[];
  overallComplianceRate: number;
  totalExpected: number;
  totalPresent: number;
  totalMissing: number;
  generatedAt: string;
}

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

/**
 * Generate compliance summary for a period
 *
 * Creates a read-only summary showing:
 * - Compliance rates by source type
 * - Missing child IDs
 * - Overall statistics
 *
 * @param input - Contains periodOrTerm and optional sourceType
 * @returns Compliance summary with statistics
 */
export async function generateComplianceSummaryTool(
  input: GenerateComplianceSummaryInput
): Promise<ToolResult<GenerateComplianceSummaryOutput>> {
  const { periodOrTerm, sourceType } = input;

  logger.info('generateComplianceSummary: Starting', {
    periodOrTerm,
    sourceType,
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================

  if (!periodOrTerm || typeof periodOrTerm !== 'string') {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'periodOrTerm is required',
      },
    };
  }

  if (sourceType && !Object.values(SOURCE_TYPE).includes(sourceType)) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'sourceType must be "field" or "academic"',
      },
    };
  }

  // =========================================================================
  // GENERATE SUMMARIES
  // =========================================================================

  try {
    const summaries: ComplianceSummary[] = [];
    const generatedAt = new Date().toISOString();

    // Determine which source types to check
    const sourceTypes: SourceType[] = sourceType
      ? [sourceType]
      : [SOURCE_TYPE.FIELD as SourceType, SOURCE_TYPE.ACADEMIC as SourceType];

    for (const st of sourceTypes) {
      const result = await detectMissingUpdatesTool({
        periodOrTerm,
        sourceType: st,
      });

      if (!result.success) {
        logger.warn('generateComplianceSummary: Failed to detect missing for source type', {
          sourceType: st,
          error: result.error,
        });
        continue;
      }

      summaries.push({
        periodOrTerm,
        sourceType: st,
        expected: result.data.counts.expected,
        present: result.data.counts.present,
        missing: result.data.counts.missing,
        missingChildIds: result.data.missingChildIds,
        complianceRate: result.data.complianceRate,
        generatedAt,
      });
    }

    // Calculate overall statistics
    const totalExpected = summaries.reduce((sum, s) => sum + s.expected, 0);
    const totalPresent = summaries.reduce((sum, s) => sum + s.present, 0);
    const totalMissing = summaries.reduce((sum, s) => sum + s.missing, 0);
    const overallComplianceRate =
      totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 100;

    logger.info('generateComplianceSummary: Completed', {
      periodOrTerm,
      summaryCount: summaries.length,
      overallComplianceRate,
      totalExpected,
      totalPresent,
      totalMissing,
    });

    return {
      success: true,
      data: {
        summaries,
        overallComplianceRate,
        totalExpected,
        totalPresent,
        totalMissing,
        generatedAt,
      },
    };
  } catch (error: unknown) {
    const err = error as { message?: string };

    logger.error('generateComplianceSummary: Failed', error, {
      periodOrTerm,
    });

    return {
      success: false,
      error: {
        code: 'airtable_error',
        message: err.message || 'Failed to generate compliance summary',
      },
    };
  }
}
