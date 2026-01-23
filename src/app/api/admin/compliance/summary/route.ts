/**
 * API Route: Compliance Summary
 *
 * Returns compliance summary for admin visibility.
 *
 * GET /api/admin/compliance/summary?period=2026-01&sourceType=field
 *
 * Admin-protected route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getAdminToken, isAdminAuthConfigured } from '@/lib/env';
import { ADMIN, SOURCE_TYPE } from '@/lib/constants';
import {
  generateComplianceSummaryTool,
  detectMissingUpdatesTool,
} from '@/lib/tools';
import type { SourceType } from '@/lib/types/child-update';

// ============================================================================
// AUTHENTICATION
// ============================================================================

function validateAdminAuth(request: NextRequest): boolean {
  if (!isAdminAuthConfigured()) {
    logger.warn('Admin auth not configured');
    return false;
  }

  const token = request.headers.get(ADMIN.AUTH_HEADER);
  if (!token) {
    return false;
  }

  try {
    const adminToken = getAdminToken();
    return token === adminToken;
  } catch {
    return false;
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  logger.info('Compliance summary: Request received', {});

  // Authenticate
  if (!validateAdminAuth(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period');
    const sourceType = url.searchParams.get('sourceType') as SourceType | null;

    // Default to current period if not specified
    const targetPeriod = period || getCurrentPeriod();

    // Validate sourceType if provided
    if (sourceType && !Object.values(SOURCE_TYPE).includes(sourceType)) {
      return NextResponse.json(
        { success: false, error: 'sourceType must be "field" or "academic"' },
        { status: 400 }
      );
    }

    logger.info('Compliance summary: Generating', {
      period: targetPeriod,
      sourceType: sourceType || 'all',
    });

    // Generate summary
    const summaryResult = await generateComplianceSummaryTool({
      periodOrTerm: targetPeriod,
      sourceType: sourceType || undefined,
    });

    if (!summaryResult.success) {
      return NextResponse.json(
        { success: false, error: summaryResult.error.message },
        { status: 500 }
      );
    }

    // Get detailed missing info if a specific source type was requested
    let missingDetails = null;
    if (sourceType) {
      const missingResult = await detectMissingUpdatesTool({
        periodOrTerm: targetPeriod,
        sourceType,
      });

      if (missingResult.success) {
        missingDetails = {
          missingChildIds: missingResult.data.missingChildIds,
          missingUpdates: missingResult.data.missingUpdates,
        };
      }
    }

    logger.info('Compliance summary: Generated', {
      period: targetPeriod,
      overallComplianceRate: summaryResult.data.overallComplianceRate,
      totalMissing: summaryResult.data.totalMissing,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...summaryResult.data,
        missingDetails,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };

    logger.error('Compliance summary: Unexpected error', error, {});

    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
